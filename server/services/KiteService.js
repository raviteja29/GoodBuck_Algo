import { createRequire } from 'module';
import WebSocket from 'ws';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const KiteConnect = require('kiteconnect').KiteConnect;

dotenv.config();

class KiteService {
  constructor() {
    this.kite = new KiteConnect({
      api_key: process.env.KITE_API_KEY
    });
    
    this.wsClients = new Set();
    this.instrumentTokens = new Set();
    this.lastQuotes = new Map();
    this.ticker = null;
  }

  setAccessToken(accessToken) {
    this.kite.setAccessToken(accessToken);
    this.initializeTicker(accessToken);
  }

  async generateSession(requestToken) {
    try {
      console.log('Generating session with request token:', requestToken);
      
      const sessionData = await this.kite.generateSession(requestToken, process.env.KITE_API_SECRET);
      
      // Set the access token after successful session generation
      this.setAccessToken(sessionData.access_token);
      
      return {
        access_token: sessionData.access_token,
        user_id: sessionData.user_id,
        user_name: sessionData.user_name,
        user_shortname: sessionData.user_shortname,
        email: sessionData.email,
        user_type: sessionData.user_type,
        broker: sessionData.broker
      };
    } catch (error) {
      console.error('Error generating session:', error);
      throw error;
    }
  }

  initializeTicker(accessToken) {
    if (this.ticker) {
      console.log('[KiteService] Closing existing ticker');
      this.ticker.close();
    }

    try {
      // Set NODE_TLS_REJECT_UNAUTHORIZED to bypass SSL certificate validation
      // This is needed because of the "self signed certificate" error
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      console.log('[KiteService] Added environment option: NODE_TLS_REJECT_UNAUTHORIZED=0');
      
      const KiteTicker = require('kiteconnect').KiteTicker;
      
      // Create the ticker with the WebSocket options to bypass SSL cert validation
      this.ticker = new KiteTicker({
        api_key: process.env.KITE_API_KEY,
        access_token: accessToken,
        reconnect: true,
        reconnect_max_delay: 60,
        reconnect_max_tries: 30,
        max_retry: 30,
        debug: true,
        // Add WebSocket options to bypass SSL certificate validation
        ws_options: {
          rejectUnauthorized: false
        }
      });

      console.log('[KiteService] Using apiKey=' + process.env.KITE_API_KEY + ' and accessToken=<REDACTED>');
      console.log('[KiteService] Added WebSocket options: { rejectUnauthorized: false }');

      this.ticker.connect();
      this.ticker.on('ticks', this.handleTicks.bind(this));
      this.ticker.on('connect', this.handleConnect.bind(this));
      this.ticker.on('disconnect', this.handleDisconnect.bind(this));
      this.ticker.on('error', this.handleError.bind(this));
      this.ticker.on('close', this.handleClose.bind(this));
      this.ticker.on('reconnect', this.handleReconnect.bind(this));
      this.ticker.on('noreconnect', this.handleNoReconnect.bind(this));
      this.ticker.on('order_update', this.handleOrderUpdate.bind(this));
    } catch (error) {
      console.error('[KiteService] Error initializing Kite ticker:', error);
    }
  }

  handleTicks(ticks) {
    if (!ticks || !Array.isArray(ticks) || ticks.length === 0) {
      console.log('[KiteService] Received empty or invalid ticks, ignoring');
      return;
    }
    
    console.log(`[KiteService] ✅ RECEIVED ${ticks.length} LIVE TICKS from Kite API!`);
    
    // Log sample tick for debugging - but limit the data size
    if (ticks.length > 0) {
      const sampleTick = {
        instrument_token: ticks[0].instrument_token,
        last_price: ticks[0].last_price,
        volume: ticks[0].volume,
        timestamp: ticks[0].timestamp,
        mode: ticks[0].mode
      };
      console.log('[KiteService] Sample tick (limited data):', JSON.stringify(sampleTick, null, 2));
    }

    // Store ticks in cache
    let updatedTokens = [];
    ticks.forEach(tick => {
      if (tick && tick.instrument_token) {
        this.lastQuotes.set(tick.instrument_token, {
          last_price: tick.last_price,
          volume: tick.volume,
          ohlc: {
            open: tick.ohlc?.open,
            high: tick.ohlc?.high,
            low: tick.ohlc?.low,
            close: tick.ohlc?.close
          },
          change: tick.change,
          timestamp: new Date()
        });
        updatedTokens.push(tick.instrument_token);
      }
    });

    console.log(`[KiteService] Updated quotes for tokens: ${updatedTokens.join(', ')}`);
    console.log(`[KiteService] Broadcasting to ${this.wsClients.size} WebSocket clients`);

    // Broadcast to all connected clients
    const tickData = JSON.stringify({ type: 'ticks', data: ticks });
    let broadcastCount = 0;
    this.wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(tickData);
          broadcastCount++;
        } catch (sendError) {
          console.error('[KiteService] Error sending tick data to client:', sendError);
        }
      }
    });
    
    console.log(`[KiteService] Successfully broadcasted to ${broadcastCount} clients`);
  }

  handleConnect() {
    console.log('[KiteService] ✅ Ticker connected successfully to Kite WebSocket server');
    console.log('[KiteService] Connection details:', {
      tickerConnected: this.ticker?.connected,
      wsReadyState: this.ticker?.ws?.readyState,
      subscriptionCount: this.instrumentTokens.size
    });
    
    // Check if we have existing subscriptions and resubscribe
    const tokens = Array.from(this.instrumentTokens);
    console.log(`[KiteService] Subscription status: Already subscribed to ${tokens.length} tokens`);
    
    if (tokens.length > 0) {
      console.log(`[KiteService] Tokens to resubscribe: ${tokens.join(', ')}`);
      
      // Wait a moment for the connection to stabilize
      setTimeout(() => {
        console.log('[KiteService] Resubscribing after connection stabilization...');
        
        try {
          console.log(`[KiteService] Subscribing to token(s):`, tokens.join(','));
          this.ticker.subscribe(tokens);
          
          setTimeout(() => {
            try {
              console.log('[KiteService] Setting real-time mode for tokens');
              this.ticker.setMode(this.ticker.MODEREAL, tokens);
              console.log(`[KiteService] ✅ Successfully set MODEREAL mode for all tokens`);
            } catch (modeError) {
              console.error('[KiteService] Error setting ticker mode:', modeError);
              console.error('[KiteService] Mode error details:', {
                message: modeError.message,
                code: modeError.code,
                data: modeError.data
              });
              
              // Try setting mode individually
              tokens.forEach(token => {
                try {
                  this.ticker.setMode(this.ticker.MODEREAL, [token]);
                  console.log(`[KiteService] Successfully set MODEREAL for individual token: ${token}`);
                } catch (indivModeError) {
                  console.error(`[KiteService] Failed to set MODEREAL for token ${token}:`, indivModeError);
                }
              });
            }
          }, 1000); // Wait 1 second after subscribe before setting mode
          
        } catch (subscribeError) {
          console.error('[KiteService] Error subscribing to tokens:', subscribeError);
          console.error('[KiteService] Subscribe error details:', {
            message: subscribeError.message,
            code: subscribeError.code,
            status: subscribeError.status,
            data: subscribeError.data,
            error_type: subscribeError.error_type
          });
          
          // Try to subscribe one at a time to identify problematic tokens
          tokens.forEach(token => {
            try {
              console.log(`[KiteService] Attempting to subscribe to individual token: ${token}`);
              this.ticker.subscribe([token]);
              console.log(`[KiteService] Successfully subscribed to token: ${token}`);
            } catch (individualError) {
              console.error(`[KiteService] Failed to subscribe to token ${token}:`, individualError);
            }
          });
        }
      }, 2000); // Wait 2 seconds after connection before resubscribing
    } else {
      console.log('[KiteService] No tokens to resubscribe to');
    }
    
    console.log('[KiteService] Ticker connected (with SSL certificate bypass)');
  }

  handleDisconnect(event) {
    console.log('[KiteService] Kite ticker disconnected, event:', event);
  }

  handleError(error) {
    console.error('[KiteService] Ticker error:', error);
  }
  
  handleClose() {
    console.log('[KiteService] Ticker connection closed');
  }
  
  handleReconnect() {
    console.log('[KiteService] Ticker reconnecting...');
  }
  
  handleNoReconnect() {
    console.log('[KiteService] Ticker will not reconnect. Maximum reconnection attempts reached.');
  }
  
  handleOrderUpdate(order) {
    console.log('[KiteService] Order update received:', order);
  }

  addWebSocketClient(client) {
    this.wsClients.add(client);
    client.on('close', () => {
      this.wsClients.delete(client);
    });
  }

  removeWebSocketClient(client) {
    this.wsClients.delete(client);
  }

  subscribeTokens(tokens) {
    tokens.forEach(token => this.instrumentTokens.add(token));
    
    // Enhanced logging for debugging
    console.log(`[KiteService] subscribeTokens called with tokens: ${tokens.join(', ')}`);
    console.log(`[KiteService] Total instrumentTokens now: ${Array.from(this.instrumentTokens).join(', ')}`);
    console.log(`[KiteService] Ticker status: connected=${this.ticker?.connected}, ticker exists=${!!this.ticker}`);
    
    if (this.ticker && this.ticker.connected) {
      const allTokens = Array.from(this.instrumentTokens);
      try {
        console.log(`[KiteService] Attempting to subscribe to ${allTokens.length} tokens: ${allTokens.join(', ')}`);
        
        // Try subscribing to tokens one by one to identify problematic ones
        const failedTokens = [];
        const successTokens = [];
        
        for (const token of allTokens) {
          try {
            console.log(`[KiteService] Subscribing to individual token: ${token}`);
            this.ticker.subscribe([token]);
            successTokens.push(token);
            console.log(`[KiteService] Successfully subscribed to token: ${token}`);
          } catch (individualError) {
            console.error(`[KiteService] Failed to subscribe to token ${token}:`, individualError);
            failedTokens.push({ token, error: individualError.message });
          }
        }
        
        // Try setting mode for successful tokens
        if (successTokens.length > 0) {
          try {
            console.log(`[KiteService] Setting MODEREAL for ${successTokens.length} successful tokens`);
            this.ticker.setMode(this.ticker.MODEREAL, successTokens);
            console.log(`[KiteService] Successfully set MODEREAL mode for tokens: ${successTokens.join(', ')}`);
          } catch (modeError) {
            console.error('[KiteService] Error setting ticker mode:', modeError);
            
            // Try setting mode individually
            for (const token of successTokens) {
              try {
                this.ticker.setMode(this.ticker.MODEREAL, [token]);
                console.log(`[KiteService] Successfully set MODEREAL for individual token: ${token}`);
              } catch (indivModeError) {
                console.error(`[KiteService] Failed to set MODEREAL for token ${token}:`, indivModeError);
              }
            }
          }
        }
        
        // Report results
        if (failedTokens.length > 0) {
          console.log(`[KiteService] Failed to subscribe to ${failedTokens.length} tokens:`, failedTokens);
        }
        if (successTokens.length > 0) {
          console.log(`[KiteService] Successfully subscribed to ${successTokens.length} tokens`);
        }
        
      } catch (error) {
        console.error('[KiteService] Error subscribing to tokens:', error);
        console.error('[KiteService] Error details:', {
          message: error.message,
          code: error.code,
          status: error.status,
          data: error.data,
          error_type: error.error_type
        });
        
        // Handle permission errors gracefully
        if (error.message && error.message.includes('permission')) {
          console.log('[KiteService] Permission issue detected. Using cached quotes only.');
        }
      }
    } else {
      console.warn('[KiteService] Cannot subscribe - ticker not connected. Ticker connected:', this.ticker?.connected);
      console.warn('[KiteService] Ticker state details:', {
        tickerExists: !!this.ticker,
        connected: this.ticker?.connected,
        readyState: this.ticker?.ws?.readyState
      });
    }
  }

  unsubscribeTokens(tokens) {
    tokens.forEach(token => this.instrumentTokens.delete(token));
    if (this.ticker && this.ticker.connected) {
      this.ticker.unsubscribe(tokens);
    }
  }

  async searchInstruments(query) {
    try {
      const instruments = await this.kite.getInstruments();
      return instruments.filter(inst => 
        inst.tradingsymbol.toLowerCase().includes(query.toLowerCase()) ||
        inst.name.toLowerCase().includes(query.toLowerCase())
      );
    } catch (error) {
      console.error('Error searching instruments:', error);
      throw error;
    }
  }

  async getQuote(instrumentToken) {
    try {
      // First check if we have a recent quote in memory
      const cachedQuote = this.lastQuotes.get(instrumentToken);
      if (cachedQuote && Date.now() - cachedQuote.timestamp < 5000) { // Use cache for 5 seconds
        console.log(`[KiteService] Using cached quote for token ${instrumentToken}`);
        return cachedQuote;
      }

      // If not, fetch from Kite API
      try {
        console.log(`[KiteService] Fetching quote for token ${instrumentToken} from Kite API`);
        const quote = await this.kite.getQuote([instrumentToken]);
        
        // Update cache
        if (quote && quote[instrumentToken]) {
          this.lastQuotes.set(instrumentToken, {
            ...quote[instrumentToken],
            timestamp: new Date()
          });
        }
        
        return quote[instrumentToken];
      } catch (apiError) {
        console.error(`[KiteService] Error fetching quote from API:`, apiError);
        
        // If we have a cached quote, return it even if it's older than our normal threshold
        if (cachedQuote) {
          console.log(`[KiteService] Falling back to older cached quote for token ${instrumentToken}`);
          return cachedQuote;
        }
        
        // If it's a permission error, return a basic structure
        if (apiError.message && apiError.message.includes('permission')) {
          console.log(`[KiteService] Permission issue, returning placeholder quote for token ${instrumentToken}`);
          return {
            instrument_token: instrumentToken,
            last_price: 0,
            volume: 0,
            ohlc: { open: 0, high: 0, low: 0, close: 0 },
            change: 0,
            error: 'Insufficient permission for this instrument'
          };
        }
        
        throw apiError;
      }
    } catch (error) {
      console.error('Error in getQuote:', error);
      throw error;
    }
  }

  async getInstrumentDetails(name) {
    try {
      const instruments = await this.searchInstruments(name);
      const instrument = instruments.find(i => i.tradingsymbol === name.toUpperCase());
      
      if (!instrument) {
        throw new Error('Instrument not found');
      }

      try {
        const quote = await this.getQuote(instrument.instrument_token);
        
        return {
          name: instrument.tradingsymbol,
          token: instrument.instrument_token,
          ltp: quote.last_price || 0,
          change: quote.change || 0,
          volume: quote.volume || 0,
          ohlc: quote.ohlc || { open: 0, high: 0, low: 0, close: 0 }
        };
      } catch (quoteError) {
        console.error(`[KiteService] Error fetching quote for ${name}:`, quoteError);
        
        // Return instrument details without real-time data
        return {
          name: instrument.tradingsymbol,
          token: instrument.instrument_token,
          ltp: 0,
          change: 0,
          volume: 0,
          ohlc: { open: 0, high: 0, low: 0, close: 0 },
          error: quoteError.message || 'Failed to fetch quote'
        };
      }
    } catch (error) {
      console.error('Error getting instrument details:', error);
      throw error;
    }
  }

  // Trading API Methods
  async getProfile() {
    try {
      return await this.kite.getProfile();
    } catch (error) {
      console.error('Error fetching profile:', error);
      throw error;
    }
  }

  async getMargins() {
    try {
      const margins = await this.kite.getMargins();
      console.log('[KiteService] Raw margins data from Kite API:', JSON.stringify(margins, null, 2));
      return margins;
    } catch (error) {
      console.error('Error fetching margins:', error);
      throw error;
    }
  }

  async getPositions() {
    try {
      return await this.kite.getPositions();
    } catch (error) {
      console.error('Error fetching positions:', error);
      throw error;
    }
  }

  async getOrders() {
    try {
      return await this.kite.getOrders();
    } catch (error) {
      console.error('Error fetching orders:', error);
      throw error;
    }
  }

  async placeOrder(orderParams) {
    try {
      return await this.kite.placeOrder(orderParams);
    } catch (error) {
      console.error('Error placing order:', error);
      throw error;
    }
  }

  async getHoldings() {
    try {
      return await this.kite.getHoldings();
    } catch (error) {
      console.error('Error fetching holdings:', error);
      throw error;
    }
  }

  async getInstrumentHighLow(instrumentToken, fromDate, toDate) {
    try {
      console.log(`[KiteService] Fetching historical data for token ${instrumentToken} from ${fromDate} to ${toDate}`);
      
      const historicalData = await this.kite.getHistoricalData(
        instrumentToken,
        'day',
        fromDate,
        toDate
      );
      
      if (!historicalData || historicalData.length === 0) {
        throw new Error('No historical data found for the selected date range');
      }
      
      // Calculate the high and low from the historical data
      let high = Number.MIN_SAFE_INTEGER;
      let low = Number.MAX_SAFE_INTEGER;
      
      historicalData.forEach(candle => {
        if (candle.high > high) {
          high = candle.high;
        }
        if (candle.low < low) {
          low = candle.low;
        }
      });
      
      console.log(`[KiteService] Historical data analysis complete - High: ${high}, Low: ${low}`);
      
      return {
        high,
        low,
        dataPoints: historicalData.length,
        dateRange: {
          from: fromDate,
          to: toDate
        }
      };
    } catch (error) {
      console.error('Error fetching historical high/low data:', error);
      throw error;
    }
  }
}

export default new KiteService();
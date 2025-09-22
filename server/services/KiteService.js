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
      this.ticker.close();
    }

    const KiteTicker = require('kiteconnect').KiteTicker;
    this.ticker = new KiteTicker({
      api_key: process.env.KITE_API_KEY,
      access_token: accessToken
    });

    this.ticker.connect();
    this.ticker.on('ticks', this.handleTicks.bind(this));
    this.ticker.on('connect', this.handleConnect.bind(this));
    this.ticker.on('disconnect', this.handleDisconnect.bind(this));
    this.ticker.on('error', this.handleError.bind(this));
  }

  handleTicks(ticks) {
    ticks.forEach(tick => {
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
    });

    // Broadcast to all connected clients
    const tickData = JSON.stringify({ type: 'ticks', data: ticks });
    this.wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(tickData);
      }
    });
  }

  handleConnect() {
    console.log('Ticker connected');
    if (this.instrumentTokens.size > 0) {
      this.ticker.subscribe(Array.from(this.instrumentTokens));
      this.ticker.setMode(this.ticker.MODEREAL, Array.from(this.instrumentTokens));
    }
  }

  handleDisconnect() {
    console.log('Ticker disconnected');
  }

  handleError(error) {
    console.error('Ticker error:', error);
  }

  addWebSocketClient(client) {
    this.wsClients.add(client);
    client.on('close', () => {
      this.wsClients.delete(client);
    });
  }

  subscribeTokens(tokens) {
    tokens.forEach(token => this.instrumentTokens.add(token));
    if (this.ticker && this.ticker.connected) {
      this.ticker.subscribe(Array.from(this.instrumentTokens));
      this.ticker.setMode(this.ticker.MODEREAL, Array.from(this.instrumentTokens));
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
      if (cachedQuote && Date.now() - cachedQuote.timestamp < 1000) {
        return cachedQuote;
      }

      // If not, fetch from Kite API
      const quote = await this.kite.getQuote([instrumentToken]);
      return quote[instrumentToken];
    } catch (error) {
      console.error('Error fetching quote:', error);
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

      const quote = await this.getQuote(instrument.instrument_token);
      
      return {
        name: instrument.tradingsymbol,
        token: instrument.instrument_token,
        ltp: quote.last_price,
        change: quote.change,
        volume: quote.volume,
        ohlc: quote.ohlc
      };
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
      return await this.kite.getMargins();
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
}

export default new KiteService();
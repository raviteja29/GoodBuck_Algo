import { KiteConnect } from 'kiteconnect';
import { createRequire } from 'module';
import BaseBroker from './BaseBroker.js';

const require = createRequire(import.meta.url);
const { KiteTicker } = require('kiteconnect');

export class ZerodhaBroker extends BaseBroker {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.kite = null;
    this.ticker = null;
  }

  initializeKiteConnect() {
    if (!this.kite) {
      this.kite = new KiteConnect({
        api_key: this.apiKey,
        timeout: 30000,
        retry: {
          count: 3,
          delay: 1000
        }
      });
      
      if (this.accessToken) {
        this.kite.setAccessToken(this.accessToken);
      }
    }
    return this.kite;
  }

  getLoginUrl() {
    return `https://kite.zerodha.com/connect/login?v=3&api_key=${this.apiKey}`;
  }

  async generateSession(requestToken) {
    const kite = this.initializeKiteConnect();
    
    try {
      const sessionData = await kite.generateSession(requestToken, this.apiSecret);
      this.setAccessToken(sessionData.access_token);
      return this.normalizeProfile(sessionData);
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getProfile() {
    const kite = this.initializeKiteConnect();
    
    try {
      const profile = await kite.getProfile();
      return this.normalizeProfile(profile);
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async logout() {
    this.accessToken = null;
    this.isAuthenticated = false;
    this.kite = null;
    if (this.ticker) {
      this.ticker.disconnect();
      this.ticker = null;
    }
  }

  async placeOrder(orderParams) {
    const kite = this.initializeKiteConnect();
    
    try {
      const order = await kite.placeOrder('regular', orderParams);
      return this.normalizeOrder(order);
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getOrders() {
    const kite = this.initializeKiteConnect();
    
    try {
      const orders = await kite.getOrders();
      return orders.map(order => this.normalizeOrder(order));
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getPositions() {
    const kite = this.initializeKiteConnect();
    
    try {
      const positions = await kite.getPositions();
      return {
        net: positions.net?.map(pos => this.normalizePosition(pos)) || [],
        day: positions.day?.map(pos => this.normalizePosition(pos)) || []
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getHoldings() {
    const kite = this.initializeKiteConnect();
    
    try {
      const holdings = await kite.getHoldings();
      return holdings.map(holding => this.normalizePosition(holding));
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getMargins() {
    const kite = this.initializeKiteConnect();
    
    try {
      const margins = await kite.getMargins();
      return margins; // Zerodha format is already standard
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getQuote(instrumentTokens) {
    const kite = this.initializeKiteConnect();
    
    try {
      const quotes = await kite.getQuote(instrumentTokens);
      const normalizedQuotes = {};
      
      for (const [token, quote] of Object.entries(quotes)) {
        normalizedQuotes[token] = this.normalizeQuote(quote);
      }
      
      return normalizedQuotes;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getHistoricalData(instrumentToken, interval, fromDate, toDate, options = {}) {
    const kite = this.initializeKiteConnect();
    
    try {
      const data = await kite.getHistoricalData(
        instrumentToken, 
        interval, 
        fromDate, 
        toDate, 
        options.continuous, 
        options.oi
      );
      
      return {
        candles: data,
        status: 'ok'
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getInstruments(exchange = null) {
    const kite = this.initializeKiteConnect();
    
    try {
      const instruments = await kite.getInstruments(exchange);
      return instruments.map(instrument => this.normalizeInstrument(instrument));
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async searchInstruments(query) {
    const instruments = await this.getInstruments();
    const lowerQuery = query.toLowerCase();
    
    return instruments.filter(instrument => 
      instrument.tradingsymbol?.toLowerCase().includes(lowerQuery) ||
      instrument.name?.toLowerCase().includes(lowerQuery)
    ).slice(0, 100);
  }

  initializeWebSocket(accessToken) {
    try {
      if (this.ticker) {
        this.ticker.disconnect();
      }

      this.ticker = new KiteTicker({
        api_key: this.apiKey,
        access_token: accessToken,
        reconnect: true,
        reconnect_max_delay: 60,
        reconnect_max_tries: 30,
        max_retry: 30,
        debug: false
      });

      return this.ticker;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  subscribeToTicks(tokens) {
    if (!this.ticker) {
      throw new Error('WebSocket not initialized. Call initializeWebSocket first.');
    }

    try {
      this.ticker.subscribe(tokens);
      this.ticker.setMode(this.ticker.MODE_FULL, tokens);
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // Data normalization methods
  normalizeProfile(rawProfile) {
    return {
      user_id: rawProfile.user_id,
      user_name: rawProfile.user_name,
      access_token: rawProfile.access_token,
      email: rawProfile.email,
      broker: 'zerodha',
      meta: rawProfile
    };
  }

  normalizeOrder(rawOrder) {
    return {
      order_id: rawOrder.order_id,
      exchange_order_id: rawOrder.exchange_order_id,
      parent_order_id: rawOrder.parent_order_id,
      status: rawOrder.status,
      status_message: rawOrder.status_message,
      order_timestamp: rawOrder.order_timestamp,
      exchange_timestamp: rawOrder.exchange_timestamp,
      exchange: rawOrder.exchange,
      tradingsymbol: rawOrder.tradingsymbol,
      instrument_token: rawOrder.instrument_token,
      transaction_type: rawOrder.transaction_type, // BUY/SELL
      order_type: rawOrder.order_type, // MARKET/LIMIT
      validity: rawOrder.validity,
      price: rawOrder.price,
      quantity: rawOrder.quantity,
      filled_quantity: rawOrder.filled_quantity,
      pending_quantity: rawOrder.pending_quantity,
      cancelled_quantity: rawOrder.cancelled_quantity,
      average_price: rawOrder.average_price,
      product: rawOrder.product,
      tag: rawOrder.tag,
      broker: 'zerodha'
    };
  }

  normalizePosition(rawPosition) {
    return {
      instrument_token: rawPosition.instrument_token,
      exchange: rawPosition.exchange,
      tradingsymbol: rawPosition.tradingsymbol,
      product: rawPosition.product,
      quantity: rawPosition.quantity,
      overnight_quantity: rawPosition.overnight_quantity,
      multiplier: rawPosition.multiplier,
      average_price: rawPosition.average_price,
      last_price: rawPosition.last_price,
      pnl: rawPosition.pnl,
      m2m: rawPosition.m2m,
      unrealised: rawPosition.unrealised,
      realised: rawPosition.realised,
      value: rawPosition.value,
      broker: 'zerodha'
    };
  }

  normalizeQuote(rawQuote) {
    return {
      instrument_token: rawQuote.instrument_token,
      timestamp: rawQuote.timestamp,
      last_price: rawQuote.last_price,
      last_quantity: rawQuote.last_quantity,
      average_price: rawQuote.average_price,
      volume: rawQuote.volume,
      buy_quantity: rawQuote.buy_quantity,
      sell_quantity: rawQuote.sell_quantity,
      ohlc: rawQuote.ohlc,
      net_change: rawQuote.net_change,
      oi: rawQuote.oi,
      oi_day_high: rawQuote.oi_day_high,
      oi_day_low: rawQuote.oi_day_low,
      broker: 'zerodha'
    };
  }

  normalizeInstrument(rawInstrument) {
    return {
      instrument_token: rawInstrument.instrument_token,
      exchange_token: rawInstrument.exchange_token,
      tradingsymbol: rawInstrument.tradingsymbol,
      name: rawInstrument.name,
      last_price: rawInstrument.last_price || 0,
      expiry: rawInstrument.expiry,
      strike: rawInstrument.strike,
      tick_size: rawInstrument.tick_size,
      lot_size: rawInstrument.lot_size,
      instrument_type: rawInstrument.instrument_type,
      segment: rawInstrument.segment,
      exchange: rawInstrument.exchange,
      broker: 'zerodha'
    };
  }
}

export default ZerodhaBroker;
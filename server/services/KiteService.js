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
}

export default new KiteService();
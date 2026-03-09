import BaseBroker from './BaseBroker.js';

export class FyersBroker extends BaseBroker {
  constructor(config) {
    super(config);
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.redirectUrl = config.redirectUrl;
    this.baseUrl = config.baseUrl || 'https://api-t1.fyers.in/api/v3';
    this.ws = null;
  }

  // Generate app ID hash (required for Fyers)
  async generateAppIdHash() {
    const message = `${this.clientId}:${this.clientSecret}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Authentication methods
  async generateSession(authCode) {
    try {
      const appIdHash = await this.generateAppIdHash();
      
      const response = await fetch(`${this.baseUrl}/validate-authcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          appIdHash: appIdHash,
          code: authCode
        })
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        this.setAccessToken(data.access_token);
        return {
          access_token: data.access_token,
          user_id: data.user_id || 'fyers_user',
          user_name: data.user_name || 'Fyers User'
        };
      } else {
        throw new Error(data.message || 'Failed to generate session');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getProfile() {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        return this.normalizeProfile(data.data);
      } else {
        throw new Error(data.message || 'Failed to fetch profile');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async logout() {
    this.accessToken = null;
    this.isAuthenticated = false;
    // Fyers doesn't have a specific logout endpoint
    return { status: 'success' };
  }

  // Trading methods
  async placeOrder(orderParams) {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderParams)
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        return this.normalizeOrder(data.data);
      } else {
        throw new Error(data.message || 'Failed to place order');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getOrders() {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/orders`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        return data.orderBook ? data.orderBook.map(order => this.normalizeOrder(order)) : [];
      } else {
        throw new Error(data.message || 'Failed to fetch orders');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getPositions() {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/positions`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        const positions = [];
        if (data.netPositions) positions.push(...data.netPositions);
        if (data.overall) positions.push(...data.overall);
        
        return positions.map(position => this.normalizePosition(position));
      } else {
        throw new Error(data.message || 'Failed to fetch positions');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getHoldings() {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/holdings`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        return data.holdings || [];
      } else {
        throw new Error(data.message || 'Failed to fetch holdings');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getMargins() {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/funds`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        return data.fund_limit || {};
      } else {
        throw new Error(data.message || 'Failed to fetch margins');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  // Market data methods
  async getQuote(instrumentTokens) {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    try {
      const symbols = Array.isArray(instrumentTokens) ? instrumentTokens.join(',') : instrumentTokens;
      
      const response = await fetch(`${this.baseUrl}/data/quotes/?symbols=${symbols}`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        return data.d || {};
      } else {
        throw new Error(data.message || 'Failed to fetch quotes');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getHistoricalData(instrumentToken, interval, fromDate, toDate, options = {}) {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    try {
      const params = new URLSearchParams({
        symbol: instrumentToken,
        resolution: this.mapInterval(interval),
        date_format: '1',
        range_from: Math.floor(new Date(fromDate).getTime() / 1000),
        range_to: Math.floor(new Date(toDate).getTime() / 1000),
        cont_flag: '1'
      });

      const response = await fetch(`${this.baseUrl}/data/history?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        return this.formatHistoricalData(data.candles);
      } else {
        throw new Error(data.message || 'Failed to fetch historical data');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getInstruments(exchange = null) {
    if (!this.accessToken) {
      throw new Error('Access token not available');
    }

    try {
      const response = await fetch(`${this.baseUrl}/data/symbol-master`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.s === 'ok') {
        let instruments = data.data || [];
        
        if (exchange) {
          instruments = instruments.filter(inst => inst.exchange === exchange.toUpperCase());
        }
        
        return instruments.map(inst => this.normalizeInstrument(inst));
      } else {
        throw new Error(data.message || 'Failed to fetch instruments');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async searchInstruments(query) {
    const instruments = await this.getInstruments();
    
    return instruments.filter(inst => 
      inst.tradingsymbol.toLowerCase().includes(query.toLowerCase()) ||
      (inst.name && inst.name.toLowerCase().includes(query.toLowerCase()))
    ).slice(0, 50);
  }

  // WebSocket methods
  initializeWebSocket(accessToken) {
    // Fyers WebSocket implementation would go here
    // For now, return a placeholder
    console.log('Fyers WebSocket not implemented yet');
    return null;
  }

  subscribeToTicks(tokens) {
    console.log('Fyers tick subscription not implemented yet');
    return false;
  }

  // Normalization methods
  normalizeProfile(rawProfile) {
    return {
      user_id: rawProfile.fy_id || rawProfile.id,
      user_name: rawProfile.name || 'Fyers User',
      email: rawProfile.email_id || '',
      broker: 'fyers',
      ...rawProfile
    };
  }

  normalizeOrder(rawOrder) {
    return {
      order_id: rawOrder.id,
      tradingsymbol: rawOrder.symbol,
      transaction_type: rawOrder.side,
      order_type: rawOrder.type,
      quantity: rawOrder.qty,
      price: rawOrder.limitPrice || rawOrder.price,
      status: rawOrder.status,
      broker: 'fyers',
      ...rawOrder
    };
  }

  normalizePosition(rawPosition) {
    return {
      tradingsymbol: rawPosition.symbol,
      quantity: rawPosition.netQty || rawPosition.qty,
      average_price: rawPosition.avgPrice || rawPosition.buyAvg || rawPosition.sellAvg,
      pnl: rawPosition.pl || rawPosition.realizedPnl,
      broker: 'fyers',
      ...rawPosition
    };
  }

  normalizeQuote(rawQuote) {
    return {
      instrument_token: rawQuote.symbol,
      last_price: rawQuote.lp || rawQuote.last_price,
      volume: rawQuote.volume,
      change: rawQuote.ch,
      change_percent: rawQuote.chp,
      broker: 'fyers',
      ...rawQuote
    };
  }

  normalizeInstrument(rawInstrument) {
    return {
      instrument_token: rawInstrument.symbol,
      tradingsymbol: rawInstrument.symbol,
      name: rawInstrument.description || rawInstrument.symbol,
      exchange: rawInstrument.exchange,
      segment: rawInstrument.segment,
      instrument_type: rawInstrument.instrument_type,
      lot_size: rawInstrument.lot_size || 1,
      tick_size: rawInstrument.tick_size || 0.05,
      broker: 'fyers',
      ...rawInstrument
    };
  }

  // Utility methods
  getLoginUrl() {
    const state = Math.random().toString(36).substring(2, 15);
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUrl,
      response_type: 'code',
      state: state,
      scope: 'openid profile api-v3'
    });

    return `https://api-t1.fyers.in/api/v3/generate-authcode?${params.toString()}`;
  }

  mapInterval(interval) {
    const intervalMap = {
      '1minute': '1',
      '2minute': '2',
      '3minute': '3',
      '5minute': '5',
      '10minute': '10',
      '15minute': '15',
      '30minute': '30',
      '60minute': '60',
      'day': '1D'
    };
    
    return intervalMap[interval] || '15';
  }

  formatHistoricalData(candles) {
    if (!candles || !Array.isArray(candles)) return [];
    
    return candles.map(candle => ({
      date: new Date(candle[0] * 1000).toISOString().split('T')[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5]
    }));
  }
}

export default FyersBroker;
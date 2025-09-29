import BaseBroker from './BaseBroker.js';
import axios from 'axios';
import crypto from 'crypto';

export class BreezeBroker extends BaseBroker {
  constructor(config) {
    super(config);
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.sessionToken = null;
    this.baseUrl = 'https://api.icicidirect.com/breezeapi/api/v1';
  }

  getLoginUrl() {
    // ICICI Breeze doesn't use web-based login like Zerodha
    // It uses username/password authentication
    return null;
  }

  async generateSession(username, password, apiSecret) {
    try {
      // ICICI Breeze authentication flow
      const loginData = {
        UserName: username,
        Password: password,
        LocalIP: '127.0.0.1',
        PublicIP: '127.0.0.1',
        HDSerialNumber: '',
        MACAddress: '',
        MachineID: '',
        VersionID: 'v1.0',
        RequestNo: '1',
        My2PIN: apiSecret,
        ConnectionType: '1'
      };

      const response = await axios.post(`${this.baseUrl}/customer/authenticate`, loginData, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': this.apiKey
        }
      });

      if (response.data.Status === '200') {
        this.sessionToken = response.data.Success.session_token;
        this.setAccessToken(this.sessionToken);
        
        return this.normalizeProfile({
          user_id: username,
          user_name: username,
          access_token: this.sessionToken,
          session_token: this.sessionToken
        });
      } else {
        throw new Error(response.data.Error || 'Authentication failed');
      }
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getProfile() {
    try {
      const response = await this.makeAuthenticatedRequest('/customer/demat-equity-limit');
      
      return this.normalizeProfile({
        user_id: 'breeze_user',
        user_name: 'Breeze User',
        access_token: this.sessionToken,
        email: null,
        limits: response.data.Success
      });
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async logout() {
    try {
      await this.makeAuthenticatedRequest('/customer/logout');
    } catch (error) {
      console.warn('Logout request failed:', error.message);
    }
    
    this.sessionToken = null;
    this.accessToken = null;
    this.isAuthenticated = false;
  }

  async placeOrder(orderParams) {
    try {
      // Convert standard order params to Breeze format
      const breezeOrderParams = {
        stock_code: orderParams.tradingsymbol,
        exchange_code: this.mapExchange(orderParams.exchange),
        product: this.mapProduct(orderParams.product),
        action: orderParams.transaction_type, // BUY/SELL
        order_type: this.mapOrderType(orderParams.order_type),
        stoploss: orderParams.trigger_price || '',
        quantity: orderParams.quantity.toString(),
        price: orderParams.price?.toString() || '',
        validity: this.mapValidity(orderParams.validity),
        disclosed_quantity: orderParams.disclosed_quantity?.toString() || '',
        expiry_date: '',
        right: '',
        strike_price: orderParams.strike?.toString() || '',
        user_remark: orderParams.tag || ''
      };

      const response = await this.makeAuthenticatedRequest('/order', breezeOrderParams, 'POST');
      
      return this.normalizeOrder(response.data.Success);
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getOrders() {
    try {
      const response = await this.makeAuthenticatedRequest('/order');
      
      if (response.data.Success && Array.isArray(response.data.Success)) {
        return response.data.Success.map(order => this.normalizeOrder(order));
      }
      
      return [];
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getPositions() {
    try {
      const response = await this.makeAuthenticatedRequest('/portfolio/positions');
      
      let positions = [];
      if (response.data.Success && Array.isArray(response.data.Success)) {
        positions = response.data.Success.map(pos => this.normalizePosition(pos));
      }
      
      return {
        net: positions,
        day: positions // Breeze doesn't separate day/net positions like Kite
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getHoldings() {
    try {
      const response = await this.makeAuthenticatedRequest('/portfolio/holdings');
      
      if (response.data.Success && Array.isArray(response.data.Success)) {
        return response.data.Success.map(holding => this.normalizePosition(holding));
      }
      
      return [];
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getMargins() {
    try {
      const response = await this.makeAuthenticatedRequest('/customer/demat-equity-limit');
      
      // Convert Breeze margin format to standard format
      const margins = response.data.Success;
      return {
        equity: {
          enabled: true,
          net: parseFloat(margins.limit_for_equity_cash || '0'),
          available: {
            adhoc_margin: parseFloat(margins.adhoc_margin || '0'),
            cash: parseFloat(margins.cash_limit || '0'),
            opening_balance: parseFloat(margins.limit_for_equity_cash || '0'),
            live_balance: parseFloat(margins.available_limit || '0'),
            collateral: parseFloat(margins.collateral_value || '0'),
            intraday_payin: 0
          },
          utilised: {
            debits: parseFloat(margins.used_limit || '0'),
            exposure: parseFloat(margins.margin_used || '0'),
            m2m_realised: 0,
            m2m_unrealised: 0,
            option_premium: 0,
            payout: 0,
            span: 0,
            holding_sales: 0,
            turnover: 0,
            liquid_collateral: 0,
            stock_collateral: 0
          }
        },
        commodity: { enabled: false }
      };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getQuote(instrumentTokens) {
    try {
      const quotes = {};
      
      // Breeze might need different approach for quotes
      // This is a simplified implementation
      for (const token of instrumentTokens) {
        try {
          const response = await this.makeAuthenticatedRequest(`/market/quote?stock_code=${token}`);
          if (response.data.Success) {
            quotes[token] = this.normalizeQuote(response.data.Success);
          }
        } catch (error) {
          console.warn(`Failed to get quote for ${token}:`, error.message);
          quotes[token] = { error: error.message };
        }
      }
      
      return quotes;
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getHistoricalData(instrumentToken, interval, fromDate, toDate, options = {}) {
    try {
      const breezeInterval = this.mapInterval(interval);
      
      const params = {
        stock_code: instrumentToken,
        exchange_code: options.exchange || 'NSE',
        expiry_date: options.expiry || '',
        right: options.right || '',
        strike_price: options.strike || '',
        interval: breezeInterval,
        from_date: fromDate.split(' ')[0], // Extract date part
        to_date: toDate.split(' ')[0]
      };

      const response = await this.makeAuthenticatedRequest('/market/historical', params);
      
      if (response.data.Success && Array.isArray(response.data.Success)) {
        const candles = response.data.Success.map(item => [
          new Date(item.datetime).toISOString(),
          parseFloat(item.open),
          parseFloat(item.high),
          parseFloat(item.low),
          parseFloat(item.close),
          parseInt(item.volume)
        ]);
        
        return {
          candles: candles,
          status: 'ok'
        };
      }
      
      return { candles: [], status: 'ok' };
    } catch (error) {
      throw this.handleApiError(error);
    }
  }

  async getInstruments(exchange = null) {
    try {
      const exchangeCode = exchange ? this.mapExchange(exchange) : 'NSE';
      const response = await this.makeAuthenticatedRequest(`/market/instruments/${exchangeCode}`);
      
      if (response.data.Success && Array.isArray(response.data.Success)) {
        return response.data.Success.map(instrument => this.normalizeInstrument(instrument));
      }
      
      return [];
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
    // Breeze WebSocket implementation would go here
    // This is a placeholder - actual implementation depends on Breeze's WebSocket API
    console.warn('Breeze WebSocket not implemented yet');
    return null;
  }

  subscribeToTicks(tokens) {
    // Breeze tick subscription would go here
    console.warn('Breeze tick subscription not implemented yet');
  }

  // Helper methods for making authenticated requests
  async makeAuthenticatedRequest(endpoint, data = null, method = 'GET') {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this.apiKey,
        'X-SESSION-TOKEN': this.sessionToken
      }
    };

    if (data && method !== 'GET') {
      config.data = data;
    } else if (data && method === 'GET') {
      config.params = data;
    }

    return await axios(config);
  }

  // Mapping methods to convert between standard and Breeze formats
  mapExchange(exchange) {
    const exchangeMap = {
      'NSE': 'NSE',
      'BSE': 'BSE',
      'NFO': 'NFO',
      'BFO': 'BFO',
      'MCX': 'MCX'
    };
    return exchangeMap[exchange] || 'NSE';
  }

  mapProduct(product) {
    const productMap = {
      'MIS': 'Intraday',
      'CNC': 'Delivery',
      'NRML': 'Normal'
    };
    return productMap[product] || 'Intraday';
  }

  mapOrderType(orderType) {
    const orderTypeMap = {
      'MARKET': 'Market',
      'LIMIT': 'Limit',
      'SL': 'StopLoss',
      'SL-M': 'StopLossMarket'
    };
    return orderTypeMap[orderType] || 'Market';
  }

  mapValidity(validity) {
    const validityMap = {
      'DAY': 'DAY',
      'IOC': 'IOC',
      'GTD': 'GTD'
    };
    return validityMap[validity] || 'DAY';
  }

  mapInterval(interval) {
    const intervalMap = {
      'minute': '1minute',
      '3minute': '3minute',
      '5minute': '5minute',
      '10minute': '10minute',
      '15minute': '15minute',
      '30minute': '30minute',
      '60minute': '1hour',
      'day': '1day'
    };
    return intervalMap[interval] || '1minute';
  }

  // Data normalization methods
  normalizeProfile(rawProfile) {
    return {
      user_id: rawProfile.user_id,
      user_name: rawProfile.user_name,
      access_token: rawProfile.access_token,
      email: rawProfile.email,
      broker: 'breeze',
      meta: rawProfile
    };
  }

  normalizeOrder(rawOrder) {
    return {
      order_id: rawOrder.order_id,
      exchange_order_id: rawOrder.exchange_order_id,
      parent_order_id: null,
      status: rawOrder.Status,
      status_message: rawOrder.status_message || '',
      order_timestamp: rawOrder.order_datetime,
      exchange_timestamp: rawOrder.exchange_order_update_time,
      exchange: rawOrder.exchange_code,
      tradingsymbol: rawOrder.stock_code,
      instrument_token: rawOrder.stock_code, // Breeze uses stock_code
      transaction_type: rawOrder.action,
      order_type: rawOrder.order_type,
      validity: rawOrder.validity,
      price: parseFloat(rawOrder.price || '0'),
      quantity: parseInt(rawOrder.quantity || '0'),
      filled_quantity: parseInt(rawOrder.executed_quantity || '0'),
      pending_quantity: parseInt(rawOrder.quantity || '0') - parseInt(rawOrder.executed_quantity || '0'),
      cancelled_quantity: 0,
      average_price: parseFloat(rawOrder.average_price || '0'),
      product: rawOrder.product,
      tag: rawOrder.user_remark,
      broker: 'breeze'
    };
  }

  normalizePosition(rawPosition) {
    return {
      instrument_token: rawPosition.stock_code,
      exchange: rawPosition.exchange_code,
      tradingsymbol: rawPosition.stock_code,
      product: rawPosition.product,
      quantity: parseInt(rawPosition.quantity || '0'),
      overnight_quantity: parseInt(rawPosition.quantity || '0'),
      multiplier: 1,
      average_price: parseFloat(rawPosition.average_price || '0'),
      last_price: parseFloat(rawPosition.ltp || '0'),
      pnl: parseFloat(rawPosition.mtm || '0'),
      m2m: parseFloat(rawPosition.mtm || '0'),
      unrealised: parseFloat(rawPosition.mtm || '0'),
      realised: 0,
      value: parseFloat(rawPosition.stock_value || '0'),
      broker: 'breeze'
    };
  }

  normalizeQuote(rawQuote) {
    return {
      instrument_token: rawQuote.stock_code,
      timestamp: new Date().toISOString(),
      last_price: parseFloat(rawQuote.ltp || '0'),
      last_quantity: parseInt(rawQuote.ltt || '0'),
      average_price: parseFloat(rawQuote.avg_price || '0'),
      volume: parseInt(rawQuote.volume || '0'),
      buy_quantity: 0,
      sell_quantity: 0,
      ohlc: {
        open: parseFloat(rawQuote.open || '0'),
        high: parseFloat(rawQuote.high || '0'),
        low: parseFloat(rawQuote.low || '0'),
        close: parseFloat(rawQuote.close || '0')
      },
      net_change: parseFloat(rawQuote.change || '0'),
      broker: 'breeze'
    };
  }

  normalizeInstrument(rawInstrument) {
    return {
      instrument_token: rawInstrument.stock_code,
      exchange_token: rawInstrument.token,
      tradingsymbol: rawInstrument.stock_code,
      name: rawInstrument.company_name || rawInstrument.stock_code,
      last_price: 0,
      expiry: rawInstrument.expiry_date,
      strike: parseFloat(rawInstrument.strike_price || '0'),
      tick_size: parseFloat(rawInstrument.tick_size || '0.05'),
      lot_size: parseInt(rawInstrument.lot_size || '1'),
      instrument_type: rawInstrument.right || 'EQ',
      segment: rawInstrument.exchange_code,
      exchange: rawInstrument.exchange_code,
      broker: 'breeze'
    };
  }
}

export default BreezeBroker;
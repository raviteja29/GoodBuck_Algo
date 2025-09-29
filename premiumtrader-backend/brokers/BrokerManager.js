import ZerodhaBroker from './ZerodhaBroker.js';
import BreezeBroker from './BreezeBroker.js';

export class BrokerManager {
  constructor() {
    this.brokers = new Map();
    this.activeBroker = null;
    this.initializeBrokers();
  }

  initializeBrokers() {
    // Initialize Zerodha broker
    this.brokers.set('zerodha', new ZerodhaBroker({
      apiKey: process.env.KITE_API_KEY,
      apiSecret: process.env.KITE_API_SECRET
    }));

    // Initialize ICICI Breeze broker
    this.brokers.set('breeze', new BreezeBroker({
      apiKey: process.env.BREEZE_API_KEY,
      secretKey: process.env.BREEZE_SECRET_KEY
    }));

    // Set default broker
    this.activeBroker = this.brokers.get('zerodha');
  }

  getBrokerList() {
    return Array.from(this.brokers.keys()).map(key => ({
      id: key,
      name: this.getBrokerDisplayName(key),
      isAvailable: this.isBrokerConfigured(key)
    }));
  }

  getBrokerDisplayName(brokerId) {
    const names = {
      'zerodha': 'Zerodha Kite',
      'breeze': 'ICICI Breeze'
    };
    return names[brokerId] || brokerId;
  }

  isBrokerConfigured(brokerId) {
    switch (brokerId) {
      case 'zerodha':
        return !!(process.env.KITE_API_KEY && process.env.KITE_API_SECRET);
      case 'breeze':
        return !!(process.env.BREEZE_API_KEY && process.env.BREEZE_SECRET_KEY);
      default:
        return false;
    }
  }

  setBroker(brokerId) {
    if (!this.brokers.has(brokerId)) {
      throw new Error(`Broker ${brokerId} not found`);
    }

    if (!this.isBrokerConfigured(brokerId)) {
      throw new Error(`Broker ${brokerId} is not properly configured`);
    }

    this.activeBroker = this.brokers.get(brokerId);
    return this.activeBroker;
  }

  getBroker(brokerId = null) {
    if (brokerId) {
      return this.brokers.get(brokerId);
    }
    return this.activeBroker;
  }

  getActiveBrokerId() {
    for (const [id, broker] of this.brokers.entries()) {
      if (broker === this.activeBroker) {
        return id;
      }
    }
    return null;
  }

  // Proxy methods to active broker
  async generateSession(...args) {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.generateSession(...args);
  }

  async getProfile() {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.getProfile();
  }

  async logout() {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.logout();
  }

  async placeOrder(orderParams) {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.placeOrder(orderParams);
  }

  async getOrders() {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.getOrders();
  }

  async getPositions() {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.getPositions();
  }

  async getHoldings() {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.getHoldings();
  }

  async getMargins() {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.getMargins();
  }

  async getQuote(instrumentTokens) {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.getQuote(instrumentTokens);
  }

  async getHistoricalData(instrumentToken, interval, fromDate, toDate, options = {}) {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.getHistoricalData(instrumentToken, interval, fromDate, toDate, options);
  }

  async getInstruments(exchange = null) {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.getInstruments(exchange);
  }

  async searchInstruments(query) {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return await this.activeBroker.searchInstruments(query);
  }

  getLoginUrl() {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return this.activeBroker.getLoginUrl();
  }

  initializeWebSocket(accessToken) {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return this.activeBroker.initializeWebSocket(accessToken);
  }

  subscribeToTicks(tokens) {
    if (!this.activeBroker) {
      throw new Error('No active broker set');
    }
    return this.activeBroker.subscribeToTicks(tokens);
  }

  // Multi-broker operations
  async getAllBrokerPositions() {
    const allPositions = {};
    
    for (const [brokerId, broker] of this.brokers.entries()) {
      if (broker.isAuthenticated) {
        try {
          const positions = await broker.getPositions();
          allPositions[brokerId] = positions;
        } catch (error) {
          console.error(`Failed to get positions from ${brokerId}:`, error.message);
          allPositions[brokerId] = { error: error.message };
        }
      }
    }
    
    return allPositions;
  }

  async getAllBrokerOrders() {
    const allOrders = {};
    
    for (const [brokerId, broker] of this.brokers.entries()) {
      if (broker.isAuthenticated) {
        try {
          const orders = await broker.getOrders();
          allOrders[brokerId] = orders;
        } catch (error) {
          console.error(`Failed to get orders from ${brokerId}:`, error.message);
          allOrders[brokerId] = { error: error.message };
        }
      }
    }
    
    return allOrders;
  }

  // Configuration validation
  validateBrokerConfig(brokerId) {
    const broker = this.brokers.get(brokerId);
    if (!broker) {
      return { valid: false, error: `Broker ${brokerId} not found` };
    }

    switch (brokerId) {
      case 'zerodha':
        if (!process.env.KITE_API_KEY) {
          return { valid: false, error: 'KITE_API_KEY environment variable is required' };
        }
        if (!process.env.KITE_API_SECRET) {
          return { valid: false, error: 'KITE_API_SECRET environment variable is required' };
        }
        break;

      case 'breeze':
        if (!process.env.BREEZE_API_KEY) {
          return { valid: false, error: 'BREEZE_API_KEY environment variable is required' };
        }
        if (!process.env.BREEZE_SECRET_KEY) {
          return { valid: false, error: 'BREEZE_SECRET_KEY environment variable is required' };
        }
        break;
    }

    return { valid: true };
  }
}

// Singleton instance
const brokerManager = new BrokerManager();

export default brokerManager;
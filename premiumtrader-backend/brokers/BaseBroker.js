// Base broker interface that all broker implementations must follow
// This ensures consistency across different broker APIs

export class BaseBroker {
  constructor(config) {
    this.config = config;
    this.isAuthenticated = false;
    this.accessToken = null;
  }

  // Authentication methods
  async generateSession(requestToken, apiSecret) {
    throw new Error('generateSession method must be implemented by broker');
  }

  async getProfile() {
    throw new Error('getProfile method must be implemented by broker');
  }

  async logout() {
    throw new Error('logout method must be implemented by broker');
  }

  // Trading methods
  async placeOrder(orderParams) {
    throw new Error('placeOrder method must be implemented by broker');
  }

  async getOrders() {
    throw new Error('getOrders method must be implemented by broker');
  }

  async getPositions() {
    throw new Error('getPositions method must be implemented by broker');
  }

  async getHoldings() {
    throw new Error('getHoldings method must be implemented by broker');
  }

  async getMargins() {
    throw new Error('getMargins method must be implemented by broker');
  }

  // Market data methods
  async getQuote(instrumentTokens) {
    throw new Error('getQuote method must be implemented by broker');
  }

  async getHistoricalData(instrumentToken, interval, fromDate, toDate, options = {}) {
    throw new Error('getHistoricalData method must be implemented by broker');
  }

  async getInstruments(exchange = null) {
    throw new Error('getInstruments method must be implemented by broker');
  }

  async searchInstruments(query) {
    throw new Error('searchInstruments method must be implemented by broker');
  }

  // WebSocket/Real-time data methods
  initializeWebSocket(accessToken) {
    throw new Error('initializeWebSocket method must be implemented by broker');
  }

  subscribeToTicks(tokens) {
    throw new Error('subscribeToTicks method must be implemented by broker');
  }

  // Data transformation methods (normalize different broker formats)
  normalizeProfile(rawProfile) {
    // Override in subclasses to standardize profile format
    return rawProfile;
  }

  normalizeOrder(rawOrder) {
    // Override in subclasses to standardize order format
    return rawOrder;
  }

  normalizePosition(rawPosition) {
    // Override in subclasses to standardize position format
    return rawPosition;
  }

  normalizeQuote(rawQuote) {
    // Override in subclasses to standardize quote format
    return rawQuote;
  }

  normalizeInstrument(rawInstrument) {
    // Override in subclasses to standardize instrument format
    return rawInstrument;
  }

  // Utility methods
  setAccessToken(token) {
    this.accessToken = token;
    this.isAuthenticated = !!token;
  }

  getLoginUrl() {
    throw new Error('getLoginUrl method must be implemented by broker');
  }

  getBrokerName() {
    return this.constructor.name.replace('Broker', '').toLowerCase();
  }

  // Standard error handling
  handleApiError(error) {
    console.error(`[${this.getBrokerName().toUpperCase()}] API Error:`, error);
    
    // Standardize error format across brokers
    return {
      error: error.message || 'Unknown error',
      error_type: error.error_type || 'GeneralException',
      status_code: error.status || 500,
      broker: this.getBrokerName()
    };
  }
}

export default BaseBroker;
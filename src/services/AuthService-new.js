// Updated AuthService with broker abstraction
class AuthService {
  constructor() {
    this.currentBroker = null;
    this.availableBrokers = [];
  }

  async initializeBrokers() {
    try {
      const response = await fetch('http://https://goodbuck-algo.onrender.com/api/brokers', {
        method: 'GET',
        credentials: 'include'
      });
      
      const data = await response.json();
      this.availableBrokers = data.brokers;
      this.currentBroker = data.activeBroker;
      
      return data;
    } catch (error) {
      console.error('Failed to initialize brokers:', error);
      throw error;
    }
  }

  async setBroker(brokerId) {
    try {
      const response = await fetch('http://https://goodbuck-algo.onrender.com/api/brokers/set', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ brokerId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }

      const result = await response.json();
      this.currentBroker = result.activeBroker;
      
      // Clear existing tokens when switching brokers
      this.logout();
      
      return result;
    } catch (error) {
      console.error('Failed to set broker:', error);
      throw error;
    }
  }

  getCurrentBroker() {
    return this.currentBroker;
  }

  getAvailableBrokers() {
    return this.availableBrokers;
  }

  getBrokerDisplayName(brokerId) {
    const broker = this.availableBrokers.find(b => b.id === brokerId);
    return broker ? broker.name : brokerId;
  }

  getLoginUrl() {
    if (this.currentBroker === 'zerodha') {
      const apiKey = import.meta.env.VITE_KITE_API_KEY;
      return `https://kite.zerodha.com/connect/login?v=3&api_key=${apiKey}`;
    } else if (this.currentBroker === 'breeze') {
      // ICICI Breeze doesn't use web-based login
      return null;
    }
    return null;
  }

  async generateSession(credentials) {
    console.log('[AuthService] Generating session for broker:', this.currentBroker);
    
    let requestBody = {};
    
    if (this.currentBroker === 'zerodha') {
      requestBody.request_token = credentials.requestToken;
    } else if (this.currentBroker === 'breeze') {
      requestBody.username = credentials.username;
      requestBody.password = credentials.password;
      requestBody.api_secret = credentials.apiSecret;
    } else {
      throw new Error(`Unsupported broker: ${this.currentBroker}`);
    }

    const response = await fetch('http://https://goodbuck-algo.onrender.com/api/generate_session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('[AuthService] Session generation failed:', err);
      throw new Error(err.error || 'Session generation failed');
    }

    const data = await response.json();
    console.log('[AuthService] Session data received:', data);

    if (!data.access_token) {
      console.error('[AuthService] No access_token in response:', data);
      throw new Error('No access_token received');
    }

    // Store session data with broker information
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('user_id', data.user_id);
    localStorage.setItem('user_name', data.user_name);
    localStorage.setItem('current_broker', this.currentBroker);
    localStorage.setItem('login_time', new Date().toISOString());

    return data;
  }

  getAccessToken() {
    return localStorage.getItem('access_token');
  }

  getUserInfo() {
    return {
      user_id: localStorage.getItem('user_id'),
      user_name: localStorage.getItem('user_name'),
      login_time: localStorage.getItem('login_time'),
      access_token: localStorage.getItem('access_token'),
      current_broker: localStorage.getItem('current_broker')
    };
  }

  isAuthenticated() {
    const token = localStorage.getItem('access_token');
    const storedBroker = localStorage.getItem('current_broker');
    
    // Check if token exists and broker matches current broker
    return !!(token && storedBroker === this.currentBroker);
  }

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_name');
    localStorage.removeItem('current_broker');
    localStorage.removeItem('login_time');
  }

  // Check if broker requires different authentication flow
  requiresUsernamePassword() {
    return this.currentBroker === 'breeze';
  }

  requiresRequestToken() {
    return this.currentBroker === 'zerodha';
  }
}

export default new AuthService();
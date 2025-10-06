// Import the official Fyers API v3 SDK
import { fyersModel } from 'fyers-api-v3';

class FyersService {
  constructor() {
    // Initialize the Fyers model with logging configuration
    this.fyers = new fyersModel({
      path: "./logs/", // Path for logs (optional)
      enableLogging: false // Disable logging in production
    });
    
    // Set up configuration from environment variables
    this.clientId = import.meta.env.VITE_FYERS_CLIENT_ID;
    this.clientSecret = import.meta.env.VITE_FYERS_CLIENT_SECRET;
    this.redirectUrl = import.meta.env.VITE_FYERS_REDIRECT_URL;
    this.baseUrl = import.meta.env.VITE_FYERS_BASE_URL || 'https://api-t1.fyers.in/api/v3';
    
    console.log('=== FYERS SERVICE INITIALIZATION ===');
    console.log('Client ID:', this.clientId);
    console.log('Client Secret:', this.clientSecret ? 'Present' : 'Missing');
    console.log('Redirect URL:', this.redirectUrl);
    
    // Configure the SDK
    if (this.clientId) {
      this.fyers.setAppId(this.clientId);
    }
    
    if (this.redirectUrl) {
      this.fyers.setRedirectUrl(this.redirectUrl);
    }
    
    // Check for existing access token
    const savedToken = localStorage.getItem('fyers_access_token');
    if (savedToken) {
      console.log('Found saved access token, setting in SDK');
      this.fyers.setAccessToken(savedToken);
    }
  }

  // Step 1: Generate authorization URL using the official SDK
  getAuthUrl() {
    console.log('=== GENERATING AUTH URL ===');
    
    try {
      // Generate state for security
      const state = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('fyers_state', state);
      
      // Use the SDK method to generate auth code URL
      const authUrl = this.fyers.generateAuthCode();
      console.log('Generated Auth URL:', authUrl);
      
      return authUrl;
    } catch (error) {
      console.error('Error generating auth URL:', error);
      throw error;
    }
  }

  // Step 2: Exchange auth code for access token using the official SDK
  async getAccessToken(authCode) {
    console.log('=== GETTING ACCESS TOKEN ===');
    console.log('Auth Code received:', authCode);
    
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error('Missing Client ID or Client Secret in environment variables');
      }
      
      // Use the official SDK method for token exchange
      const tokenRequest = {
        client_id: this.clientId,
        secret_key: this.clientSecret,
        auth_code: authCode
      };
      
      console.log('Calling fyers.generate_access_token with:', {
        client_id: tokenRequest.client_id,
        secret_key: tokenRequest.secret_key ? 'Present' : 'Missing',
        auth_code: tokenRequest.auth_code
      });
      
      const response = await this.fyers.generate_access_token(tokenRequest);
      console.log('Token response:', response);
      
      if (response.s === 'ok') {
        // Set the access token in the SDK
        this.fyers.setAccessToken(response.access_token);
        
        // Save to localStorage for persistence
        localStorage.setItem('fyers_access_token', response.access_token);
        
        console.log('✅ Access token received and set in SDK');
        return response.access_token;
      } else {
        console.error('❌ Token exchange failed:', response);
        throw new Error(response.message || `Token exchange error: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      console.error('❌ Error getting access token:', error);
      throw error;
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    const token = localStorage.getItem('fyers_access_token');
    if (token && !this.fyers.getAccessToken()) {
      // If we have a saved token but SDK doesn't have it, set it
      this.fyers.setAccessToken(token);
    }
    return !!token;
  }

  // Clear authentication
  logout() {
    localStorage.removeItem('fyers_access_token');
    localStorage.removeItem('fyers_state');
    // Note: The SDK doesn't have a clearAccessToken method, so we'll handle this in memory
    console.log('Logged out and cleared tokens');
  }

  // Get profile information using the official SDK
  async getProfile() {
    console.log('=== GETTING PROFILE ===');
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }
      
      const response = await this.fyers.get_profile();
      console.log('Profile response:', response);
      
      if (response.s === 'ok') {
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to fetch profile');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      throw error;
    }
  }

  // Get historical data using the official SDK
  async getHistoricalData(symbol, fromDate, toDate, resolution = '15') {
    console.log('=== GETTING HISTORICAL DATA ===');
    console.log('Symbol:', symbol);
    console.log('From:', fromDate, 'To:', toDate, 'Resolution:', resolution);
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }

      const params = {
        symbol: symbol,
        resolution: resolution, // 1, 2, 3, 5, 10, 15, 30, 60, 120, 240, 1D
        date_format: 1, // 1 for epoch timestamp
        range_from: Math.floor(new Date(fromDate).getTime() / 1000),
        range_to: Math.floor(new Date(toDate).getTime() / 1000),
        cont_flag: 1
      };

      console.log('Historical data params:', params);
      
      const response = await this.fyers.getHistoricalData(params);
      console.log('Historical data response:', response);
      
      if (response.s === 'ok') {
        return this.formatHistoricalData(response.candles);
      } else {
        throw new Error(response.message || 'Failed to fetch historical data');
      }
    } catch (error) {
      console.error('Error fetching historical data:', error);
      throw error;
    }
  }

  // Format historical data to match existing structure
  formatHistoricalData(candles) {
    if (!candles || !Array.isArray(candles)) return [];
    
    return candles.map(candle => ({
      timestamp: new Date(candle[0] * 1000).toISOString(),
      date: new Date(candle[0] * 1000).toLocaleDateString(),
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5]
    }));
  }

  // Get current market quotes using the official SDK
  async getQuotes(symbols) {
    console.log('=== GETTING QUOTES ===');
    console.log('Symbols:', symbols);
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }

      // Ensure symbols is an array
      const symbolArray = Array.isArray(symbols) ? symbols : [symbols];
      
      const response = await this.fyers.getQuotes(symbolArray);
      console.log('Quotes response:', response);
      
      if (response.s === 'ok') {
        return response.d;
      } else {
        throw new Error(response.message || 'Failed to fetch quotes');
      }
    } catch (error) {
      console.error('Error fetching quotes:', error);
      throw error;
    }
  }

  // Get option chain (using market depth for now, as SDK may not have dedicated optchain method)
  async getOptionChain(symbol, strikeCount = 10, expiryDate = null) {
    console.log('=== GETTING OPTION CHAIN ===');
    console.log('Symbol:', symbol, 'Strike Count:', strikeCount);
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }

      // For now, we'll use market depth to get option data
      // This might need adjustment based on the exact SDK capabilities
      const params = {
        symbol: [symbol],
        ohlcv_flag: 1
      };

      const response = await this.fyers.getMarketDepth(params);
      console.log('Option chain response:', response);
      
      if (response.s === 'ok') {
        return response.d;
      } else {
        throw new Error(response.message || 'Failed to fetch option chain');
      }
    } catch (error) {
      console.error('Error fetching option chain:', error);
      throw error;
    }
  }

  // Get market status using the official SDK
  async getMarketStatus() {
    console.log('=== GETTING MARKET STATUS ===');
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }

      const response = await this.fyers.getMarketStatus();
      console.log('Market status response:', response);
      
      if (response.s === 'ok') {
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to fetch market status');
      }
    } catch (error) {
      console.error('Error fetching market status:', error);
      throw error;
    }
  }

  // Build Fyers option symbol format
  buildOptionSymbol(underlying, expiry, strike, optionType) {
    // Fyers format: NSE:NIFTY24O17C25000 or NSE:NIFTY24O17P25000
    // underlying: NIFTY, expiry: 2024-10-17, strike: 25000, optionType: CE/PE
    
    const year = expiry.getFullYear().toString().slice(-2);
    
    // Convert month to letter (O for October, N for November, etc.)
    const monthMap = {
      0: 'A', 1: 'B', 2: 'C', 3: 'D', 4: 'E', 5: 'F',
      6: 'G', 7: 'H', 8: 'I', 9: 'J', 10: 'K', 11: 'L'
    };
    const month = monthMap[expiry.getMonth()];
    
    const date = expiry.getDate().toString().padStart(2, '0');
    const type = optionType === 'CE' ? 'C' : 'P';
    
    return `NSE:${underlying}${year}${month}${date}${type}${strike}`;
  }

  // Get specific option data for backtesting
  async getOptionData(underlying, expiry, strike, optionType, fromDate, toDate, resolution = '15') {
    const symbol = this.buildOptionSymbol(underlying, expiry, strike, optionType);
    console.log('Fetching data for option symbol:', symbol);
    
    return await this.getHistoricalData(symbol, fromDate, toDate, resolution);
  }

  // Helper method to get weekly expiry dates
  getWeeklyExpiryDates() {
    const today = new Date();
    const thursday = new Date(today);
    
    // Get next Thursday
    const daysUntilThursday = (4 - today.getDay() + 7) % 7;
    if (daysUntilThursday === 0 && today.getHours() >= 15) {
      // If it's Thursday after 3:30 PM, get next Thursday
      thursday.setDate(today.getDate() + 7);
    } else {
      thursday.setDate(today.getDate() + daysUntilThursday);
    }
    
    const nextThursday = new Date(thursday);
    nextThursday.setDate(thursday.getDate() + 7);
    
    return {
      currentWeek: thursday,
      nextWeek: nextThursday
    };
  }
}

export default new FyersService();
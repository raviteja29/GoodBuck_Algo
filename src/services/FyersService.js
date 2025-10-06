// Browser-compatible Fyers API implementation
// Based on official fyers-api-v3 documentation but adapted for browser use

class FyersService {
  constructor() {
    // Configuration from environment variables
    this.clientId = import.meta.env.VITE_FYERS_CLIENT_ID;
    this.clientSecret = import.meta.env.VITE_FYERS_CLIENT_SECRET;
    this.redirectUrl = import.meta.env.VITE_FYERS_REDIRECT_URL;
    this.baseUrl = import.meta.env.VITE_FYERS_BASE_URL || 'https://api-t1.fyers.in/api/v3';
    
    console.log('=== FYERS SERVICE INITIALIZATION ===');
    console.log('Client ID:', this.clientId);
    console.log('Client Secret:', this.clientSecret ? 'Present' : 'Missing');
    console.log('Redirect URL:', this.redirectUrl);
    
    // Check for existing access token
    const savedToken = localStorage.getItem('fyers_access_token');
    this.accessToken = savedToken;
    
    if (savedToken) {
      console.log('Found saved access token');
    }
  }

  // Step 1: Generate authorization URL (based on SDK pattern)
  getAuthUrl() {
    console.log('=== GENERATING AUTH URL ===');
    
    try {
      // Generate state for security
      const state = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('fyers_state', state);
      
      // Build auth URL using official Fyers format
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUrl,
        response_type: 'code',
        state: state,
        scope: 'openid profile api-v3'
      });

      const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?${params.toString()}`;
      console.log('Generated Auth URL:', authUrl);
      
      return authUrl;
    } catch (error) {
      console.error('Error generating auth URL:', error);
      throw error;
    }
  }

  // Step 2: Exchange auth code for access token (based on official API documentation)
  async getAccessToken(authCode) {
    console.log('=== GETTING ACCESS TOKEN ===');
    console.log('Auth Code received:', authCode);
    
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error('Missing Client ID or Client Secret in environment variables');
      }
      
      // Create appIdHash by concatenating client_id and secret_key, then SHA-256 hashing
      const appIdHash = await this.createAppIdHash();
      console.log('AppIdHash created successfully');
      
      // Use the exact format from the official API documentation
      const requestBody = {
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: authCode
      };
      
      console.log('Token exchange request:', {
        grant_type: requestBody.grant_type,
        appIdHash: requestBody.appIdHash ? 'Present' : 'Missing',
        code: requestBody.code
      });
      
      // Use the correct endpoint from documentation
      const response = await fetch(`${this.baseUrl}/validate-authcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Response status:', response.status);
      
      const data = await response.json();
      console.log('Token response:', data);
      
      if (data.s === 'ok') {
        // Store the access token
        this.accessToken = data.access_token;
        localStorage.setItem('fyers_access_token', this.accessToken);
        
        console.log('✅ Access token received and stored');
        return this.accessToken;
      } else {
        console.error('❌ Token exchange failed:', data);
        throw new Error(data.message || `Token exchange error: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      console.error('❌ Error getting access token:', error);
      throw error;
    }
  }

  // Helper method to create appIdHash (SHA-256 of client_id + client_secret)
  async createAppIdHash() {
    try {
      const text = this.clientId + this.clientSecret;
      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
      console.error('Error creating appIdHash:', error);
      throw error;
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.accessToken;
  }

  // Clear authentication
  logout() {
    this.accessToken = null;
    localStorage.removeItem('fyers_access_token');
    localStorage.removeItem('fyers_state');
    console.log('Logged out and cleared tokens');
  }

  // Get profile information using proper API format
  async getProfile() {
    console.log('=== GETTING PROFILE ===');
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }
      
      const response = await fetch(`${this.baseUrl}/profile`, {
        method: 'GET',
        headers: {
          'Authorization': this.accessToken,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('Profile response:', data);
      
      if (data.s === 'ok') {
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to fetch profile');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      throw error;
    }
  }

  // Get historical data using proper API format
  async getHistoricalData(symbol, fromDate, toDate, resolution = '15') {
    console.log('=== GETTING HISTORICAL DATA ===');
    console.log('Symbol:', symbol);
    console.log('From:', fromDate, 'To:', toDate, 'Resolution:', resolution);
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }

      const params = new URLSearchParams({
        symbol: symbol,
        resolution: resolution, // 1, 2, 3, 5, 10, 15, 30, 60, 120, 240, 1D
        date_format: '1', // 1 for epoch timestamp
        range_from: Math.floor(new Date(fromDate).getTime() / 1000),
        range_to: Math.floor(new Date(toDate).getTime() / 1000),
        cont_flag: '1'
      });

      console.log('Historical data params:', Object.fromEntries(params));
      
      const response = await fetch(`${this.baseUrl}/data/history?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': this.accessToken,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('Historical data response:', data);
      
      if (data.s === 'ok') {
        return this.formatHistoricalData(data.candles);
      } else {
        throw new Error(data.message || 'Failed to fetch historical data');
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

  // Get current market quotes using proper API format
  async getQuotes(symbols) {
    console.log('=== GETTING QUOTES ===');
    console.log('Symbols:', symbols);
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }

      // Ensure symbols is properly formatted
      const symbolsParam = Array.isArray(symbols) ? symbols.join(',') : symbols;
      
      const response = await fetch(`${this.baseUrl}/data/quotes/?symbols=${symbolsParam}`, {
        method: 'GET',
        headers: {
          'Authorization': this.accessToken,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('Quotes response:', data);
      
      if (data.s === 'ok') {
        return data.d;
      } else {
        throw new Error(data.message || 'Failed to fetch quotes');
      }
    } catch (error) {
      console.error('Error fetching quotes:', error);
      throw error;
    }
  }

  // Get option chain using proper API format
  async getOptionChain(symbol, strikeCount = 10, expiryDate = null) {
    console.log('=== GETTING OPTION CHAIN ===');
    console.log('Symbol:', symbol, 'Strike Count:', strikeCount);
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }

      const params = new URLSearchParams({
        symbol: symbol, // e.g., "NSE:NIFTY50-INDEX"
        strikecount: strikeCount
      });

      if (expiryDate) {
        params.append('expiryDate', expiryDate);
      }

      const response = await fetch(`${this.baseUrl}/data/optchain?${params}`, {
        method: 'GET',
        headers: {
          'Authorization': this.accessToken,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('Option chain response:', data);
      
      if (data.s === 'ok') {
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to fetch option chain');
      }
    } catch (error) {
      console.error('Error fetching option chain:', error);
      throw error;
    }
  }

  // Get market status using proper API format
  async getMarketStatus() {
    console.log('=== GETTING MARKET STATUS ===');
    
    try {
      if (!this.isAuthenticated()) {
        throw new Error('Access token not available. Please authenticate first.');
      }

      const response = await fetch(`${this.baseUrl}/data/market-status`, {
        method: 'GET',
        headers: {
          'Authorization': this.accessToken,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      console.log('Market status response:', data);
      
      if (data.s === 'ok') {
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to fetch market status');
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
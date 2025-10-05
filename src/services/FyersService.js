class FyersService {
  constructor() {
    this.clientId = import.meta.env.VITE_FYERS_CLIENT_ID;
    this.clientSecret = import.meta.env.VITE_FYERS_CLIENT_SECRET;
    
    // Use the redirect URL from environment (matches Fyers app registration)
    this.redirectUrl = import.meta.env.VITE_FYERS_REDIRECT_URL;
    
    this.baseUrl = import.meta.env.VITE_FYERS_BASE_URL || 'https://api-t1.fyers.in/api/v3';
    this.accessToken = localStorage.getItem('fyers_access_token');
  }

  // Step 1: Generate authorization URL
  getAuthUrl() {
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('fyers_state', state);
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUrl,
      response_type: 'code',
      state: state,
      scope: 'openid profile api-v3'
    });

    return `https://api-t1.fyers.in/api/v3/generate-authcode?${params.toString()}`;
  }

  // Generate app ID hash (required for Fyers)
  async generateAppIdHash() {
    console.log('=== Generating App ID Hash ===');
    console.log('Client ID:', this.clientId);
    console.log('Client Secret:', this.clientSecret ? 'Present (length: ' + this.clientSecret.length + ')' : 'Missing');
    
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Client ID or Client Secret missing from environment variables');
    }
    
    const message = `${this.clientId}:${this.clientSecret}`;
    console.log('Hash input message format: CLIENT_ID:CLIENT_SECRET');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log('Generated hash:', hash);
    return hash;
  }

  // Step 2: Exchange auth code for access token
  async getAccessToken(authCode) {
    try {
      console.log('=== Getting Access Token ===');
      console.log('Auth Code:', authCode);
      console.log('Client ID:', this.clientId);
      console.log('Client Secret:', this.clientSecret ? 'Present' : 'Missing');
      console.log('Redirect URL:', this.redirectUrl);
      
      const appIdHash = await this.generateAppIdHash();
      console.log('Generated App ID Hash:', appIdHash);
      
      const requestBody = {
        grant_type: 'authorization_code',
        appIdHash: appIdHash,
        code: authCode
      };
      
      console.log('Request body:', requestBody);
      console.log('API URL:', `${this.baseUrl}/validate-authcode`);
      
      const response = await fetch(`${this.baseUrl}/validate-authcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      const data = await response.json();
      console.log('Response data:', data);
      
      if (data.s === 'ok') {
        this.accessToken = data.access_token;
        localStorage.setItem('fyers_access_token', this.accessToken);
        console.log('✅ Access token received and stored');
        return data.access_token;
      } else {
        console.error('❌ API returned error:', data);
        throw new Error(data.message || `API Error: ${JSON.stringify(data)}`);
      }
    } catch (error) {
      console.error('❌ Error getting access token:', error);
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
  }

  // Get profile information
  async getProfile() {
    if (!this.accessToken) {
      throw new Error('Access token not available. Please authenticate first.');
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
        return data.data;
      } else {
        throw new Error(data.message || 'Failed to fetch profile');
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      throw error;
    }
  }

  // Get historical data for any instrument (including options)
  async getHistoricalData(symbol, fromDate, toDate, resolution = '15') {
    if (!this.accessToken) {
      throw new Error('Access token not available. Please authenticate first.');
    }

    try {
      const params = new URLSearchParams({
        symbol: symbol,
        resolution: resolution, // 1, 2, 3, 5, 10, 15, 30, 60, 120, 240, 1D
        date_format: '1', // 1 for epoch timestamp
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
      console.error('Error fetching historical data:', error);
      throw error;
    }
  }

  // Format historical data to match your existing structure
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

  // Get option chain
  async getOptionChain(symbol, strikeCount = 10, expiryDate = null) {
    if (!this.accessToken) {
      throw new Error('Access token not available. Please authenticate first.');
    }

    try {
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
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
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

  // Get current market quotes
  async getQuotes(symbols) {
    if (!this.accessToken) {
      throw new Error('Access token not available. Please authenticate first.');
    }

    try {
      const symbolsParam = Array.isArray(symbols) ? symbols.join(',') : symbols;
      
      const response = await fetch(`${this.baseUrl}/data/quotes/?symbols=${symbolsParam}`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
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

  // Search for instruments/symbols
  async searchSymbols(query) {
    if (!this.accessToken) {
      throw new Error('Access token not available. Please authenticate first.');
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
        // Filter for instruments matching your query
        const filteredSymbols = data.data.filter(symbol => 
          symbol.symbol.toLowerCase().includes(query.toLowerCase()) ||
          symbol.description?.toLowerCase().includes(query.toLowerCase())
        );
        
        return filteredSymbols.slice(0, 50); // Limit results
      } else {
        throw new Error(data.message || 'Failed to search symbols');
      }
    } catch (error) {
      console.error('Error searching symbols:', error);
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

  // Get market status
  async getMarketStatus() {
    if (!this.accessToken) {
      throw new Error('Access token not available. Please authenticate first.');
    }

    try {
      const response = await fetch(`${this.baseUrl}/data/market-status`, {
        method: 'GET',
        headers: {
          'Authorization': `${this.clientId}:${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
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
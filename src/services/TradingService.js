import AuthService from './AuthService';

// WebSocket connection for real-time market data
let ws = null;
let tickSubscribers = new Set();
let instrumentTokens = new Set();

const apiKey = 'gv7qaefirlizzfmw'; // Use your actual API key here

async function setupWebSocket() {
  // Close existing connection if any
  if (ws) {
    console.log('Closing existing WebSocket connection');
    try {
      ws.close();
    } catch (err) {
      console.error('Error closing existing WebSocket:', err);
    }
    ws = null;
  }

  console.log('Setting up WebSocket connection');
  console.log('localStorage keys:', Object.keys(localStorage));
  
  const accessToken = localStorage.getItem('access_token');
  console.log('Access token from localStorage:', accessToken ? 'Token found (not showing for security)' : 'No token found');
  
  if (!accessToken) {
    console.warn('No access token found, skipping WebSocket connection');
    return false;
  }

  try {
    const publicToken = `${apiKey}:${accessToken}`;
    console.log('Attempting to connect to WebSocket server with formatted token');
    
    // Create new WebSocket instance
    ws = new WebSocket(`ws://localhost:5000/ws?token=${encodeURIComponent(publicToken)}`);
    
    // Keep track of ping interval
    let pingInterval;

    // Setup event handlers
    ws.onopen = () => {
      console.log('WebSocket connection established successfully');
      // Start ping interval (every 25 seconds)
      pingInterval = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      }, 25000);
      
      // Resubscribe to any existing instrument tokens
      if (instrumentTokens.size > 0) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          tokens: Array.from(instrumentTokens)
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received WebSocket message:', data);
        
        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          case 'ticks':
            tickSubscribers.forEach(callback => callback(data.data));
            break;
          case 'quotes':
            if (data.data) {
              tickSubscribers.forEach(callback => callback(data.data));
            }
            break;
          case 'connection':
            console.log('WebSocket connection status:', data.status);
            break;
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      // Clear ping interval
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      // Only reconnect if not intentionally closed (code !== 1000)
      if (event.code !== 1000) {
        console.log('Attempting to reconnect in 5s...');
        setTimeout(setupWebSocket, 5000);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      console.log('WebSocket state:', ws.readyState);
    };
    
    return true;
  } catch (error) {
    console.error('Error creating WebSocket connection:', error);
    return false;
  }
}

// Call this to start receiving updates for specific instruments
function subscribeToInstruments(tokens) {
  tokens.forEach(token => instrumentTokens.add(token));
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'subscribe',
      tokens: Array.from(instrumentTokens)
    }));
  }
}

// Call this to stop receiving updates for specific instruments
function unsubscribeFromInstruments(tokens) {
  tokens.forEach(token => instrumentTokens.delete(token));
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'unsubscribe',
      tokens: tokens
    }));
  }
}

// Subscribe to real-time updates
function subscribeToTicks(callback) {
  tickSubscribers.add(callback);
  return () => tickSubscribers.delete(callback);
}

// Initialize WebSocket connection
setupWebSocket();

// Utility: Merge live ticks into positions and recalculate P&L
export function mergeTicksAndRecalculatePnL(positions, ticks) {
  const tickMap = {};
  ticks.forEach(tick => {
    tickMap[tick.instrument_token] = tick.last_price;
  });
  return positions.map(pos => {
    const livePrice = tickMap[pos.instrument_token];
    if (livePrice !== undefined) {
      pos.last_price = livePrice;
      if (pos.quantity > 0) {
        pos.pnl = (livePrice - pos.average_price) * pos.quantity;
      } else if (pos.quantity < 0) {
        pos.pnl = (pos.average_price - livePrice) * Math.abs(pos.quantity);
      } else {
        pos.pnl = 0;
      }
    }
    return pos;
  });
}

class TradingService {
  constructor() {
    // Initialize WebSocket connection when service is created
    setupWebSocket();
  }

  // Expose WebSocket setup function to reconnect after login
  setupWebSocket() {
    console.log('TradingService.setupWebSocket called');
    // Add a small delay to ensure localStorage is updated
    setTimeout(() => {
      console.log('Executing setupWebSocket after delay');
      return setupWebSocket();
    }, 500);
  }

  // Expose WebSocket subscription methods
  subscribeToTicks(callback) {
    return subscribeToTicks(callback);
  }

  subscribeToInstruments(tokens) {
    subscribeToInstruments(tokens);
  }

  unsubscribeFromInstruments(tokens) {
    unsubscribeFromInstruments(tokens);
  }

  static mergeTicksAndRecalculatePnL(positions, ticks) {
    const tickMap = {};
    ticks.forEach(tick => {
      tickMap[tick.instrument_token] = tick.last_price;
    });

    return positions.map(pos => {
      const livePrice = tickMap[pos.instrument_token];
      if (livePrice !== undefined) {
        pos.last_price = livePrice;
        if (pos.quantity > 0) {
          pos.pnl = (livePrice - pos.average_price) * pos.quantity;
        } else if (pos.quantity < 0) {
          pos.pnl = (pos.average_price - livePrice) * Math.abs(pos.quantity);
        } else {
          pos.pnl = 0;
        }
      }
      return pos;
    });
  }
getAuthHeaders() {
  const token = localStorage.getItem('access_token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

async getProfile() {
  const response = await fetch('http://localhost:5000/api/profile', {
    method: 'GET',
    credentials: 'include',
    headers: this.getAuthHeaders(),
  });
  if (!response.ok) throw new Error('Failed to fetch profile');
  return await response.json();
}

async getMargins() {
    try {
      const response = await fetch('http://localhost:5000/api/margins', {
        method: 'GET',
        credentials: 'include',
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[getMargins] Error fetching margins:', errorData);
        throw new Error(errorData.error || 'Failed to fetch margins');
      }

      return await response.json();
    } catch (error) {
      console.error('[getMargins] Unexpected error:', error);
      throw new Error('Unable to fetch margins. Please try again later.');
    }
  }

  async getPositions() {
    const response = await fetch('http://localhost:5000/api/positions', {
      method: 'GET',
      credentials: 'include',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch positions');
    return await response.json();
  }

  async getOrders() {
    const response = await fetch('http://localhost:5000/api/orders', {
      method: 'GET',
      credentials: 'include',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch orders');
    return await response.json();
  }

  async placeOrder(orderParams) {
    const response = await fetch('http://localhost:5000/api/orders', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(orderParams),
    });
    if (!response.ok) throw new Error('Failed to place order');
    return await response.json();
  }

  async getHistoricalData(instrumentToken, fromDate, toDate, interval) {
    const response = await fetch(`http://localhost:5000/api/historical?instrumentToken=${instrumentToken}&fromDate=${fromDate}&toDate=${toDate}&interval=${interval}`, {
      method: 'GET',
      credentials: 'include',
      headers: this.getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch historical data');
    return await response.json();
  }

  async searchInstruments(query) {
    try {
      console.log(`[TradingService] Searching for instruments: ${query}`);
      
      const response = await fetch(`http://localhost:5000/api/instruments/search?query=${encodeURIComponent(query)}`, {
        method: 'GET',
        credentials: 'include',
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[TradingService] Search error:`, errorData);
        throw new Error(errorData.error || 'Failed to search instruments');
      }
      
      const results = await response.json();
      console.log(`[TradingService] Found ${results.length} instruments`);
      return results;
    } catch (error) {
      console.error('Error searching instruments:', error);
      throw error;
    }
  }

  async getInstrumentDetails(name) {
    try {
      console.log(`[TradingService] Fetching details for instrument: ${name}`);
      console.log(`[TradingService] Auth headers present:`, !!this.getAuthHeaders().Authorization);
      
      const response = await fetch(`http://localhost:5000/api/instruments/details?name=${encodeURIComponent(name)}`, {
        method: 'GET',
        credentials: 'include',
        headers: this.getAuthHeaders(),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error(`[TradingService] Error response:`, errorData);
        throw new Error(errorData.error || 'Failed to fetch instrument details');
      }
      
      const details = await response.json();
      console.log(`[TradingService] Received instrument details:`, details);
      
      // Subscribe to real-time updates for this instrument
      subscribeToInstruments([details.token]);
      
      return {
        name: details.name,
        token: details.token,
        ltp: details.ltp,
        change: details.change || '0%',
        qty: details.volume || 0,
        avgPrice: details.ltp,
        pnl: 0 // Will be updated in real-time
      };
    } catch (error) {
      console.error('Error fetching instrument details:', error);
      throw new Error(`Failed to fetch details for ${name}`);
  }
}

}

export default new TradingService();
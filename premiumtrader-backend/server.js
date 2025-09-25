// server.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { KiteConnect } from 'kiteconnect';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// In-memory cache for used request_tokens
const usedTokens = new Set();

dotenv.config();

console.log('Using API Key:', process.env.KITE_API_KEY);
console.log('Using API Secret:', process.env.KITE_API_SECRET ? '***secret redacted***' : 'MISSING');

const app = express();

// 1) Enable CORS with explicit origin and credentials
app.use(cors({
  origin: 'http://localhost:5173', // Update this to your frontend URL if different
  credentials: true
}));

// 2) Enable JSON body parsing (this **must** come before your routes)
app.use(express.json());

// 3) Define routes after json parser
app.post('/api/generate_session', async (req, res) => {
  const { request_token } = req.body;
  console.log('Received request_token:', request_token);

  if (!request_token) {
    console.error('No request_token in request body');
    return res.status(400).json({ error: 'request_token required' });
  }
  if (usedTokens.has(request_token)) {
    console.error('Duplicate request_token detected:', request_token);
    return res.status(400).json({ error: 'request_token already used' });
  }
  usedTokens.add(request_token);

  try {
    const kc = new KiteConnect({ 
      api_key: process.env.KITE_API_KEY,
      timeout: 30000, // 30 second timeout
      retry: {
        count: 3,     // Retry 3 times
        delay: 1000   // 1 second between retries
      }
    });
    
    console.log('Attempting to generate session with KiteConnect...');
    try {
      const sessionData = await kc.generateSession(request_token, process.env.KITE_API_SECRET);
      console.log('Session generated successfully:', {
        user_id: sessionData.user_id,
        user_name: sessionData.user_name,
        login_time: new Date().toISOString()
      });
      return res.json(sessionData);
    } catch (apiErr) {
      console.error('KiteConnect API Error:', apiErr);
      return res.status(400).json({ 
        error: apiErr.message,
        error_type: apiErr.error_type,
        data: apiErr.data 
      });
    }
  } catch (err) {
    console.error('Session generation error:', err);
    return res.status(500).json({ 
      error: err.message,
      details: 'Error initializing KiteConnect or processing session'
    });
  }
});


// Helper to get access token from header or query
function getAccessToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }
  return req.query.access_token;
}

// Proxy route for user profile
app.get('/api/profile', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    console.log('[PROFILE] Received request for /api/profile');
    console.log('[PROFILE] Authorization header:', req.headers['authorization']);
    console.log('[PROFILE] Extracted access_token:', access_token);
    if (!access_token) {
      console.warn('[PROFILE] No access token provided, returning 401');
      return res.status(401).json({ error: 'Access token required' });
    }
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    try {
      const profile = await kc.getProfile();
      console.log('[PROFILE] Successfully fetched profile:', profile);
      res.json(profile);
    } catch (apiErr) {
      console.error('[PROFILE] Error fetching profile from KiteConnect:', apiErr);
      res.status(500).json({ error: apiErr.message });
    }
  } catch (err) {
    console.error('[PROFILE] Route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy route for margins
app.get('/api/margins', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    console.log('[MARGINS] Received request for /api/margins');
    console.log('[MARGINS] Authorization header:', req.headers['authorization']);
    console.log('[MARGINS] Extracted access_token:', access_token);
    if (!access_token) {
      console.warn('[MARGINS] No access token provided, returning 401');
      return res.status(401).json({ error: 'Access token required' });
    }
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    try {
      console.log('[MARGINS] Sending request to KiteConnect getMargins API...');
      console.log('[MARGINS] Request headers:', {
        api_key: process.env.KITE_API_KEY,
        access_token
      });
      const margins = await kc.getMargins();
      console.log('[MARGINS] Successfully fetched margins:', margins);
      res.json(margins);
    } catch (apiErr) {
      console.error('[MARGINS] Error fetching margins from KiteConnect:', {
        message: apiErr.message,
        error_type: apiErr.error_type,
        data: apiErr.data,
        stack: apiErr.stack
      });
      console.log('[MARGINS] Request details:', {
        api_key: process.env.KITE_API_KEY,
        access_token
      });
      res.status(500).json({ 
        error: apiErr.message,
        error_type: apiErr.error_type,
        data: apiErr.data
      });
    }
  } catch (err) {
    console.error('[MARGINS] Route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy route for positions
app.get('/api/positions', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    const positions = await kc.getPositions();
    res.json(positions);
  } catch (err) {
    console.error('Positions fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy route for holdings (GET all holdings)
app.get('/api/holdings', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    const holdings = await kc.getHoldings();
    res.json(holdings);
  } catch (err) {
    console.error('Holdings fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy route for orders (GET all orders)
app.get('/api/orders', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    const orders = await kc.getOrders();
    res.json(orders);
  } catch (err) {
    console.error('Orders fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy route for placing an order (POST)
app.post('/api/orders', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    const orderParams = req.body;
    const order = await kc.placeOrder('regular', orderParams);
    res.json(order);
  } catch (err) {
    console.error('Order place error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy route for historical data
app.get('/api/historical', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      console.error('[HISTORICAL] No access token provided');
      return res.status(401).json({ error: 'Access token required' });
    }
    const { instrumentToken, fromDate, toDate, interval } = req.query;
    console.log('[HISTORICAL] Query params:', { instrumentToken, fromDate, toDate, interval });
    if (!instrumentToken || !fromDate || !toDate || !interval) {
      console.error('[HISTORICAL] Missing required query parameters');
      return res.status(400).json({ error: 'Missing required query parameters' });
    }
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    try {
      const data = await kc.getHistoricalData(instrumentToken, interval, fromDate, toDate);
      console.log('[HISTORICAL] Data fetched:', Array.isArray(data.candles) ? `Candles: ${data.candles.length}` : data);
      res.json(data);
    } catch (apiErr) {
      console.error('[HISTORICAL] Error from KiteConnect:', apiErr);
      res.status(500).json({ error: apiErr.message, details: apiErr });
    }
  } catch (err) {
    console.error('[HISTORICAL] Route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add quotes endpoint for multiple instruments
app.get('/api/quotes', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    console.log(`[QUOTES] Access token exists: ${!!access_token}`);
    
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    const { tokens } = req.query;
    if (!tokens) {
      return res.status(400).json({ error: 'Tokens parameter is required' });
    }
    
    const tokenArray = tokens.split(',').map(t => parseInt(t, 10));
    console.log(`[QUOTES] Fetching quotes for tokens: ${tokenArray.join(',')}`);
    
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    
    console.log(`[QUOTES] Using API Key: ${process.env.KITE_API_KEY ? 'Present' : 'Missing'}`);
    console.log(`[QUOTES] Access token length: ${access_token ? access_token.length : 0}`);
    
    try {
      // Get quotes for the requested tokens
      console.log(`[QUOTES] Calling kc.getQuote with tokens: ${tokenArray}`);
      const quotes = await kc.getQuote(tokenArray);
      console.log('[QUOTES] Successfully fetched quotes:', Object.keys(quotes).length, 'quotes');
      res.json(quotes);
    } catch (kiteError) {
      console.error('[QUOTES] Kite API error details:');
      console.error('Error message:', kiteError.message);
      console.error('Error status:', kiteError.status);
      console.error('Error code:', kiteError.code);
      console.error('Full error:', kiteError);
      
      // If permission error, try alternative approach with individual calls
      if (kiteError.error_type === 'PermissionException') {
        console.log('[QUOTES] Permission error detected. Trying individual quote fetches...');
        try {
          const individualQuotes = {};
          for (const token of tokenArray) {
            try {
              console.log(`[QUOTES] Fetching individual quote for token: ${token}`);
              const singleQuote = await kc.getQuote([token]);
              individualQuotes[token] = singleQuote[token];
            } catch (individualError) {
              console.error(`[QUOTES] Failed to fetch individual quote for ${token}:`, individualError.message);
            }
          }
          
          if (Object.keys(individualQuotes).length > 0) {
            console.log('[QUOTES] Successfully fetched some individual quotes');
            return res.json(individualQuotes);
          }
        } catch (individualError) {
          console.error('[QUOTES] Individual quote approach also failed:', individualError.message);
        }
      }
      
      // Check if it's an authentication error
      if (kiteError.message && (kiteError.message.includes('token') || kiteError.message.includes('auth'))) {
        console.error('[QUOTES] Authentication error - token may be expired');
        return res.status(401).json({ error: 'Authentication failed. Please login again.' });
      }
      
      // For other errors, return the actual error instead of mock data
      console.error('[QUOTES] Kite API error - returning error response');
      return res.status(500).json({ 
        error: 'Market data temporarily unavailable', 
        details: kiteError.message,
        error_type: kiteError.error_type 
      });
    }
  } catch (err) {
    console.error('[QUOTES] Route error:', err.message || err);
    console.error('[QUOTES] Stack trace:', err.stack);
    
    // Return proper error response instead of mock data
    res.status(500).json({ 
      error: 'Market data service temporarily unavailable',
      details: err.message 
    });
  }
});

// Add search endpoint for instruments
app.get('/api/instruments/search', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    
    const { query } = req.query;
    console.log('[INSTRUMENT SEARCH] Received search query:', query);
    
    if (!query) {
      console.warn('[INSTRUMENT SEARCH] Missing query parameter');
      return res.status(400).json({ error: 'Query parameter is required' });
    }
    
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    
    try {
      console.log('[INSTRUMENT SEARCH] Fetching instruments from KiteConnect...');
      const instruments = await kc.getInstruments();
      console.log(`[INSTRUMENT SEARCH] Fetched ${instruments.length} instruments`);
      
      // Search instruments by tradingsymbol or name
      const searchTerm = query.toUpperCase();
      const matchingInstruments = instruments.filter(inst => 
        (inst.tradingsymbol && inst.tradingsymbol.toUpperCase().includes(searchTerm)) ||
        (inst.name && inst.name.toUpperCase().includes(searchTerm))
      );
      
      console.log(`[INSTRUMENT SEARCH] Found ${matchingInstruments.length} matching instruments`);
      
      // Limit results to 20 and return relevant fields
      const results = matchingInstruments.slice(0, 20).map(inst => ({
        instrument_token: inst.instrument_token,
        tradingsymbol: inst.tradingsymbol,
        name: inst.name,
        exchange: inst.exchange,
        segment: inst.segment,
        instrument_type: inst.instrument_type
      }));
      
      res.json(results);
    } catch (apiErr) {
      console.error('[INSTRUMENT SEARCH] Error fetching instruments:', {
        message: apiErr.message,
        error_type: apiErr.error_type,
        data: apiErr.data,
        stack: apiErr.stack
      });
      res.status(500).json({ 
        error: apiErr.message,
        error_type: apiErr.error_type,
        data: apiErr.data
      });
    }
  } catch (err) {
    console.error('[INSTRUMENT SEARCH] Route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy route for instrument details
app.get('/api/instruments/details', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }
    const { name } = req.query;
    console.log('[INSTRUMENT DETAILS] Received request for instrument:', name);
    if (!name) {
      console.warn('[INSTRUMENT DETAILS] Missing name parameter');
      return res.status(400).json({ error: 'Name parameter is required' });
    }
    
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    
    try {
      console.log('[INSTRUMENT DETAILS] Fetching instruments from KiteConnect...');
      const instruments = await kc.getInstruments();
      console.log(`[INSTRUMENT DETAILS] Fetched ${instruments ? instruments.length : 0} instruments`);
      
      if (!instruments || !Array.isArray(instruments)) {
        console.error('[INSTRUMENT DETAILS] No instruments returned from KiteConnect');
        return res.status(500).json({ error: 'Failed to fetch instruments from Kite API' });
      }
      
      // More flexible search - handle NIFTY 50, NIFTY, etc.
      const searchName = name ? name.toUpperCase().replace(/\s+/g, '') : '';
      let instrument = instruments.find(i => i && i.tradingsymbol && i.tradingsymbol.toUpperCase() === searchName);
      
      // If exact match not found, try a more flexible search
      if (!instrument) {
        console.log('[INSTRUMENT DETAILS] Exact match not found, trying flexible search for:', searchName);
        
        // Special case for NIFTY 50
        if (searchName === 'NIFTY50' || searchName === 'NIFTY') {
          instrument = instruments.find(i => i && i.tradingsymbol && i.tradingsymbol.toUpperCase() === 'NIFTY' && i.exchange === 'NSE');
        }
        
        // Special case for BANKNIFTY
        if (searchName === 'BANKNIFTY') {
          instrument = instruments.find(i => i && i.tradingsymbol && i.tradingsymbol.toUpperCase() === 'BANKNIFTY' && i.exchange === 'NSE');
        }
        
        // If still not found, try a partial match
        if (!instrument) {
          instrument = instruments.find(i => 
            i.tradingsymbol.toUpperCase().includes(searchName) || 
            (i.name && i.name.toUpperCase().includes(searchName))
          );
        }
      }
      
      if (!instrument) {
        console.warn('[INSTRUMENT DETAILS] Instrument not found:', name);
        return res.status(404).json({ error: 'Instrument not found' });
      }
      
      console.log('[INSTRUMENT DETAILS] Fetching quote for instrument token:', instrument.instrument_token);
      const quote = await kc.getQuote([instrument.instrument_token]);
      const quoteData = quote[instrument.instrument_token];
      
      res.json({
        name: instrument.tradingsymbol,
        token: instrument.instrument_token,
        ltp: quoteData.last_price,
        change: ((quoteData.last_price - quoteData.ohlc.open) / quoteData.ohlc.open * 100).toFixed(2) + '%',
        volume: quoteData.volume,
        ohlc: quoteData.ohlc
      });
    } catch (apiErr) {
      console.error('[INSTRUMENT DETAILS] Error fetching instrument details:', {
        message: apiErr.message,
        error_type: apiErr.error_type,
        data: apiErr.data,
        stack: apiErr.stack
      });
      res.status(500).json({ 
        error: apiErr.message,
        error_type: apiErr.error_type,
        data: apiErr.data
      });
    }
  } catch (err) {
    console.error('Route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create HTTP server
const port = process.env.PORT || 5000;
const server = createServer(app);

/**
 * Order webhook endpoint - receives real-time order updates from Zerodha
 * Format documented at: https://kite.trade/docs/connect/v3/postbacks/
 */
app.post('/api/webhook/orders', (req, res) => {
  console.log('Order webhook received');
  
  try {
    // Check for Kite API version header
    const kiteVersion = req.headers['x-kite-version'];
    if (kiteVersion) {
      console.log(`Kite API Version: ${kiteVersion}`);
    }
    
    // Verify the request is from Zerodha using checksum validation
    // when X-Kite-Signature header is present
    const signature = req.headers['x-kite-signature'];
    if (signature) {
      const apiSecret = process.env.KITE_API_SECRET;
      if (!apiSecret) {
        console.error('Cannot verify webhook: KITE_API_SECRET not configured');
        return res.status(500).json({ status: 'error', message: 'Server configuration error' });
      }
      
      // Create checksum from request body using API secret
      const body = JSON.stringify(req.body);
      const calculatedSignature = crypto
        .createHmac('sha256', apiSecret)
        .update(body)
        .digest('hex');
      
      // Compare the calculated signature with the one provided by Zerodha
      if (signature !== calculatedSignature) {
        console.error('Webhook signature verification failed');
        console.log('Received signature:', signature);
        console.log('Calculated signature:', calculatedSignature);
        return res.status(403).json({ status: 'error', message: 'Invalid signature' });
      }
      
      console.log('Webhook signature verified successfully');
    } else {
      console.warn('No X-Kite-Signature header found - webhook verification skipped');
    }
    
    // The postback payload is an array of order objects according to Zerodha docs
    const orderUpdates = req.body;
    
    // Validate the data structure
    if (!Array.isArray(orderUpdates)) {
      console.error('Invalid order webhook data received - expected array:', orderUpdates);
      return res.status(400).json({ status: 'error', message: 'Invalid data format, expected array' });
    }
    
    if (orderUpdates.length === 0) {
      console.log('Empty order updates array received');
      return res.status(200).json({ status: 'success', message: 'No updates to process' });
    }
    
    console.log(`Processing ${orderUpdates.length} order updates`);
    
    // Process each order update
    orderUpdates.forEach(orderData => {
      // Validate essential fields according to Zerodha docs
      if (!orderData || !orderData.order_id) {
        console.error('Invalid order data in webhook:', orderData);
        return; // Skip this item but continue processing others
      }
      
      console.log(`Broadcasting order update for order_id: ${orderData.order_id}`);
      
      // Process the order update (broadcast to connected clients via WebSocket)
      if (wss && wss.clients) {
        const orderUpdateMessage = JSON.stringify({
          type: 'order_update',
          data: orderData
        });
        
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(orderUpdateMessage);
          }
        });
      }
    });
    
    // Return success to acknowledge receipt
    return res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error processing order webhook:', error);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// Initialize WebSocket server with path
const wss = new WebSocketServer({ 
  server,
  path: '/ws',
  perMessageDeflate: false,
  verifyClient: async ({ req }, done) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      console.log('WebSocket connection attempt from:', req.socket.remoteAddress);
      console.log('Request URL:', req.url);
      
      const token = url.searchParams.get('token');
      console.log('Token present:', !!token);
      
      if (!token) {
        console.log('WebSocket connection rejected: No token provided');
        return done(false, 401, 'Unauthorized');
      }
      
      // Expect token in format api_key:access_token
      const [apiKey, accessToken] = token.split(':');
      console.log('API key present:', !!apiKey);
      console.log('Access token present:', !!accessToken);
      
      if (!apiKey || !accessToken) {
        console.log('WebSocket connection rejected: Malformed public token');
        return done(false, 401, 'Unauthorized');
      }
      const kc = new KiteConnect({ api_key: apiKey });
      kc.setAccessToken(accessToken);
      
      try {
        console.log('Attempting to validate token with Kite API...');
        // Use a simple method like getProfile to check if the token is valid
        const profile = await kc.getProfile();
        console.log('WebSocket authentication successful for user:', profile.user_id);
        done(true);
      } catch (error) {
        console.log('WebSocket authentication failed:', error.message);
        console.log('Error type:', error.error_type || 'Unknown');
        
        if (error.message && error.message.includes('Insufficient permission')) {
          console.log('This appears to be a permission error. Check that the API key has appropriate permissions.');
        }
        
        if (error.message && error.message.includes('Invalid access token')) {
          console.log('The access token appears to be invalid or expired.');
        }
        
        done(false, 401, 'Unauthorized');
      }
    } catch (error) {
      console.error('Error during WebSocket authentication:', error);
      done(false, 500, 'Internal Server Error');
    }
  }
});

// Store connected clients and their subscribed tokens
const clients = new Map();

// Ping interval to keep connections alive (30 seconds)
const pingInterval = 30000;

// Send ping to all connected clients
function sendPing() {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
      client.send(JSON.stringify({ type: 'ping' }));
    }
  });
}

// Start ping interval
const pingTimer = setInterval(sendPing, pingInterval);

// Clean up on server close
wss.on('close', () => {
  clearInterval(pingTimer);
});

// Log WebSocket server status
console.log('WebSocket server initialized');

wss.on('connection', (ws, req) => {
  // Generate unique ID for client
  const clientId = uuidv4();
  console.log(`New WebSocket client connected [ID: ${clientId}] from:`, req.socket.remoteAddress);
  
  // Get token from URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');
  
  // Extract access token from the public token format (api_key:access_token)
  const [, accessToken] = token.split(':');
  
  // Store client info
  clients.set(clientId, {
    ws,
    token: accessToken, // Store only the access token
    subscribedTokens: new Set(),
    lastPong: Date.now(),
    kiteClient: new KiteConnect({ api_key: process.env.KITE_API_KEY })
  });

  // Initialize Kite client for this connection
  const clientInfo = clients.get(clientId);
  clientInfo.kiteClient.setAccessToken(accessToken);

  // Send immediate confirmation
  try {
    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      message: 'Successfully connected to WebSocket server',
      clientId
    }));
  } catch (error) {
    console.error('Error sending connection confirmation:', error);
  }

  // Handle incoming messages
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      const clientInfo = clients.get(clientId);

      switch (data.type) {
        case 'subscribe':
          if (Array.isArray(data.tokens)) {
            clientInfo.subscribedTokens = new Set([...clientInfo.subscribedTokens, ...data.tokens]);
            console.log(`Client ${clientId} subscribed to tokens:`, data.tokens);
            
            // Get and send initial quotes for subscribed tokens
            try {
              const quotes = await clientInfo.kiteClient.getQuote(data.tokens);
              ws.send(JSON.stringify({
                type: 'quotes',
                data: quotes
              }));
            } catch (error) {
              console.error('Error fetching initial quotes:', error);
            }
          }
          break;

        case 'unsubscribe':
          if (Array.isArray(data.tokens)) {
            data.tokens.forEach(token => clientInfo.subscribedTokens.delete(token));
            console.log(`Client ${clientId} unsubscribed from tokens:`, data.tokens);
          }
          break;

        case 'pong':
          clientInfo.lastPong = Date.now();
          break;

        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });

  // Handle pong messages for keep-alive
  ws.on('pong', () => {
    const clientInfo = clients.get(clientId);
    if (clientInfo) {
      clientInfo.lastPong = Date.now();
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log(`Client disconnected [ID: ${clientId}]`);
    clients.delete(clientId);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
  });
});

// Start the server
server.listen(port, () => {
  console.log(`Backend server running on http://localhost:${port}`);
  console.log(`WebSocket server running on ws://localhost:${port}`);
});


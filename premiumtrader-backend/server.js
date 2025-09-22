// server.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { KiteConnect } from 'kiteconnect';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

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
      console.log(`[INSTRUMENT DETAILS] Fetched ${instruments.length} instruments`);
      const instrument = instruments.find(i => i.tradingsymbol.toUpperCase() === name.toUpperCase());
      
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

// Initialize WebSocket server with path
const wss = new WebSocketServer({ 
  server,
  path: '/ws',
  perMessageDeflate: false,
  verifyClient: async ({ req }, done) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const token = url.searchParams.get('token');
      
      if (!token) {
        console.log('WebSocket connection rejected: No token provided');
        return done(false, 401, 'Unauthorized');
      }

      // Verify token by making a test API call
      const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
      kc.setAccessToken(token);
      
      try {
        await kc.getProfile();
        console.log('WebSocket connection authenticated successfully');
        done(true);
      } catch (error) {
        console.log('WebSocket connection rejected: Invalid token');
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
  
  // Store client info
  clients.set(clientId, {
    ws,
    token,
    subscribedTokens: new Set(),
    lastPong: Date.now(),
    kiteClient: new KiteConnect({ api_key: process.env.KITE_API_KEY })
  });

  // Initialize Kite client for this connection
  const clientInfo = clients.get(clientId);
  clientInfo.kiteClient.setAccessToken(token);

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


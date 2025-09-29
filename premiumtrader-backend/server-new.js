// Updated server.js with broker abstraction
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import BrokerManager from './brokers/BrokerManager.js';

dotenv.config();

const app = express();

// Enable CORS
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());

// Initialize broker manager
const brokerManager = BrokerManager;

// Broker management endpoints
app.get('/api/brokers', (req, res) => {
  try {
    const brokers = brokerManager.getBrokerList();
    const activeBrokerId = brokerManager.getActiveBrokerId();
    
    res.json({
      brokers,
      activeBroker: activeBrokerId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/brokers/set', (req, res) => {
  try {
    const { brokerId } = req.body;
    
    if (!brokerId) {
      return res.status(400).json({ error: 'brokerId is required' });
    }

    const validation = brokerManager.validateBrokerConfig(brokerId);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    brokerManager.setBroker(brokerId);
    
    res.json({ 
      success: true, 
      activeBroker: brokerId,
      message: `Switched to ${brokerManager.getBrokerDisplayName(brokerId)}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Authentication endpoints (broker-agnostic)
app.post('/api/generate_session', async (req, res) => {
  try {
    const activeBrokerId = brokerManager.getActiveBrokerId();
    
    if (activeBrokerId === 'zerodha') {
      const { request_token } = req.body;
      
      if (!request_token) {
        return res.status(400).json({ error: 'request_token required' });
      }

      const sessionData = await brokerManager.generateSession(request_token);
      res.json(sessionData);
      
    } else if (activeBrokerId === 'breeze') {
      const { username, password, api_secret } = req.body;
      
      if (!username || !password || !api_secret) {
        return res.status(400).json({ error: 'username, password, and api_secret required for Breeze' });
      }

      const sessionData = await brokerManager.generateSession(username, password, api_secret);
      res.json(sessionData);
      
    } else {
      res.status(400).json({ error: 'No active broker configured' });
    }
  } catch (error) {
    console.error('Session generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auth callback endpoint for brokers that use redirect-based auth
app.get('/auth/callback', (req, res) => {
  // This endpoint handles OAuth callbacks from brokers
  // Currently ICICI Breeze uses direct authentication, but this is here for completeness
  const { code, state, error } = req.query;
  
  if (error) {
    return res.redirect(`http://localhost:5173/login?error=${encodeURIComponent(error)}`);
  }
  
  // For now, just redirect back to frontend
  // Individual broker implementations can extend this
  res.redirect(`http://localhost:5173/auth/callback?code=${code}&state=${state}`);
});

// Helper to get access token
function getAccessToken(req) {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }
  return req.query.access_token;
}

// Trading endpoints (broker-agnostic)
app.get('/api/profile', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // Set the access token for the active broker
    const broker = brokerManager.getBroker();
    broker.setAccessToken(access_token);

    const profile = await brokerManager.getProfile();
    res.json(profile);
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/margins', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const broker = brokerManager.getBroker();
    broker.setAccessToken(access_token);

    const margins = await brokerManager.getMargins();
    res.json(margins);
  } catch (error) {
    console.error('Margins fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const broker = brokerManager.getBroker();
    broker.setAccessToken(access_token);

    const positions = await brokerManager.getPositions();
    res.json(positions);
  } catch (error) {
    console.error('Positions fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/holdings', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const broker = brokerManager.getBroker();
    broker.setAccessToken(access_token);

    const holdings = await brokerManager.getHoldings();
    res.json(holdings);
  } catch (error) {
    console.error('Holdings fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const broker = brokerManager.getBroker();
    broker.setAccessToken(access_token);

    const orders = await brokerManager.getOrders();
    res.json(orders);
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const broker = brokerManager.getBroker();
    broker.setAccessToken(access_token);

    const order = await brokerManager.placeOrder(req.body);
    res.json(order);
  } catch (error) {
    console.error('Order place error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Market data endpoints
app.get('/api/quotes', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const { tokens } = req.query;
    if (!tokens) {
      return res.status(400).json({ error: 'Tokens parameter is required' });
    }

    const tokenArray = tokens.split(',').map(t => parseInt(t, 10));
    
    const broker = brokerManager.getBroker();
    broker.setAccessToken(access_token);

    const quotes = await brokerManager.getQuote(tokenArray);
    res.json(quotes);
  } catch (error) {
    console.error('Quotes fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/quote', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'token parameter required' });
    }

    const instrumentToken = parseInt(String(token), 10);
    
    const broker = brokerManager.getBroker();
    broker.setAccessToken(access_token);

    const quotes = await brokerManager.getQuote([instrumentToken]);
    const quote = quotes[instrumentToken];
    
    res.json({ source: 'api', quote });
  } catch (error) {
    console.error('Quote fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/historical', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const { instrumentToken, fromDate, toDate, interval, continuous, oi } = req.query;
    
    if (!instrumentToken || !interval || !fromDate || !toDate) {
      return res.status(400).json({ 
        error: 'Missing required parameters: instrumentToken, interval, fromDate, toDate' 
      });
    }

    const broker = brokerManager.getBroker();
    broker.setAccessToken(access_token);

    const options = {};
    if (continuous !== undefined) options.continuous = continuous === '1' || continuous === 'true';
    if (oi !== undefined) options.oi = oi === '1' || oi === 'true';

    const data = await brokerManager.getHistoricalData(instrumentToken, interval, fromDate, toDate, options);
    res.json(data);
  } catch (error) {
    console.error('Historical data fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Instrument search endpoints
app.get('/api/instruments/search', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (access_token) {
      const broker = brokerManager.getBroker();
      broker.setAccessToken(access_token);
    }

    const { query, name } = req.query;
    const q = (query || name || '').trim();
    
    if (!q) {
      return res.status(400).json({ error: 'query parameter required' });
    }

    const results = await brokerManager.searchInstruments(q);
    res.json(results);
  } catch (error) {
    console.error('Instrument search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/instruments', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (access_token) {
      const broker = brokerManager.getBroker();
      broker.setAccessToken(access_token);
    }

    const { exchange } = req.query;
    const instruments = await brokerManager.getInstruments(exchange);
    res.json(instruments);
  } catch (error) {
    console.error('Instruments fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Multi-broker endpoints
app.get('/api/multi-broker/positions', async (req, res) => {
  try {
    const allPositions = await brokerManager.getAllBrokerPositions();
    res.json(allPositions);
  } catch (error) {
    console.error('Multi-broker positions error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/multi-broker/orders', async (req, res) => {
  try {
    const allOrders = await brokerManager.getAllBrokerOrders();
    res.json(allOrders);
  } catch (error) {
    console.error('Multi-broker orders error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create HTTP server
const port = process.env.PORT || 5000;
const server = createServer(app);

// WebSocket setup (simplified - would need broker-specific implementation)
const wss = new WebSocketServer({ 
  server,
  path: '/ws'
});

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  console.log(`WebSocket client connected: ${clientId}`);
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle broker-specific WebSocket operations
      const activeBrokerId = brokerManager.getActiveBrokerId();
      const broker = brokerManager.getBroker();
      
      switch (data.type) {
        case 'subscribe':
          if (activeBrokerId === 'zerodha') {
            broker.subscribeToTicks(data.tokens);
          }
          // Add other broker implementations
          break;
          
        case 'set_broker':
          try {
            brokerManager.setBroker(data.brokerId);
            ws.send(JSON.stringify({
              type: 'broker_changed',
              brokerId: data.brokerId,
              success: true
            }));
          } catch (error) {
            ws.send(JSON.stringify({
              type: 'broker_change_error',
              error: error.message
            }));
          }
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket client disconnected: ${clientId}`);
  });
});

// Start the server
server.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on http://localhost:${port}`);
  console.log(`Also accessible at http://192.168.68.52:${port}`);
  console.log(`WebSocket server running on ws://localhost:${port}`);
  console.log(`Available brokers: ${brokerManager.getBrokerList().map(b => b.name).join(', ')}`);
  console.log(`Active broker: ${brokerManager.getBrokerDisplayName(brokerManager.getActiveBrokerId())}`);
});
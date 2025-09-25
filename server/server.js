import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import KiteService from './services/KiteService.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize WebSocket server
const wss = new WebSocketServer({ noServer: true });

console.log("WebSocket server initialized");

wss.on('connection', (ws, request) => {
  const clientIp = request.socket.remoteAddress;
  console.log(`New WebSocket connection: ${request.url}`);
  console.log(`WebSocket client (${clientIp}) connected`);
  
  // Flag to track if the client has authenticated
  let isAuthenticated = false;
  
  // Set a timeout for authentication
  const authTimeout = setTimeout(() => {
    if (!isAuthenticated) {
      console.log(`WebSocket client (${clientIp}) failed to authenticate within timeout period`);
      ws.close(1008, 'Authentication timeout');
    }
  }, 10000); // 10 seconds to authenticate
  
  ws.on('message', (message) => {
    console.log(`WebSocket client (${clientIp}) message: ${message}`);
    try {
      const data = JSON.parse(message);
      
      // Handle authentication
      if (data.type === 'auth') {
        // For now, accept any authentication attempt
        console.log(`WebSocket client (${clientIp}) authenticated successfully`);
        isAuthenticated = true;
        clearTimeout(authTimeout);
        
        // Add the authenticated client to KiteService
        KiteService.addWebSocketClient(ws);
        
        // Send authentication success response
        ws.send(JSON.stringify({
          type: 'auth_result',
          success: true
        }));
        
        // Track connected clients
        const connectedClients = wss.clients.size;
        console.log(`Connected clients: ${connectedClients}`);
        return;
      }
      
      // For all other message types, require authentication
      if (!isAuthenticated) {
        console.log(`Unauthenticated client (${clientIp}) attempted to send message: ${message}`);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Not authenticated'
        }));
        return;
      }
      
      // Handle other message types for authenticated clients
      if (data.type === 'subscribe' && Array.isArray(data.tokens)) {
        console.log(`[KiteService] Subscribing to token(s): ${data.tokens.join(',')}`);
        try {
          KiteService.subscribeTokens(data.tokens);
          // Send confirmation to client
          ws.send(JSON.stringify({
            type: 'subscribed',
            tokens: data.tokens
          }));
          console.log(`ws-client-${clientIp} subscribed to instrument tokens: ${data.tokens.join(',')}`);
        } catch (error) {
          console.error('[Server] Error subscribing to tokens:', error);
          // Send error message to client
          ws.send(JSON.stringify({
            type: 'error',
            message: error.message || 'Failed to subscribe to tokens'
          }));
        }
      } else if (data.type === 'unsubscribe' && Array.isArray(data.tokens)) {
        KiteService.unsubscribeTokens(data.tokens);
      } else if (data.type === 'pong') {
        // Just acknowledge ping/pong for keepalive
      } else {
        console.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket client (${clientIp}) disconnected`);
    KiteService.removeWebSocketClient(ws);
    console.log(`Connected clients: ${wss.clients.size}`);
  });
});

// Routes
app.get('/api/instruments/search', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'Name parameter is required' });
    }
    const instruments = await KiteService.searchInstruments(name);
    res.json(instruments);
  } catch (error) {
    console.error('Error searching instruments:', error);
    res.status(500).json({ error: 'Failed to search instruments' });
  }
});

app.get('/api/quote', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ error: 'Token parameter is required' });
    }
    const quote = await KiteService.getQuote(token);
    res.json(quote);
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

app.get('/api/instruments/details', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'Name parameter is required' });
    }
    const details = await KiteService.getInstrumentDetails(name);
    res.json(details);
  } catch (error) {
    console.error('Error fetching instrument details:', error);
    res.status(500).json({ error: 'Failed to fetch instrument details' });
  }
});

// Profile endpoint
app.get('/api/profile', async (req, res) => {
  try {
    const profile = await KiteService.getProfile();
    res.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Margins endpoint
app.get('/api/margins', async (req, res) => {
  try {
    const margins = await KiteService.getMargins();
    res.json(margins);
  } catch (error) {
    console.error('Error fetching margins:', error);
    res.status(500).json({ error: 'Failed to fetch margins' });
  }
});

// Positions endpoint
app.get('/api/positions', async (req, res) => {
  try {
    const positions = await KiteService.getPositions();
    res.json(positions);
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Holdings endpoint
app.get('/api/holdings', async (req, res) => {
  try {
    const holdings = await KiteService.getHoldings();
    res.json(holdings);
  } catch (error) {
    console.error('Error fetching holdings:', error);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

// Historical high/low endpoint
app.get('/api/instruments/historical-high-low', async (req, res) => {
  try {
    const { instrumentToken, fromDate, toDate } = req.query;
    
    if (!instrumentToken) {
      return res.status(400).json({ error: 'instrumentToken parameter is required' });
    }
    
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate and toDate parameters are required' });
    }
    
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    
    const highLowData = await KiteService.getInstrumentHighLow(instrumentToken, fromDate, toDate);
    res.json(highLowData);
  } catch (error) {
    console.error('Error fetching historical high/low data:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch historical high/low data' });
  }
});

// Orders endpoint
app.get('/api/orders', async (req, res) => {
  try {
    const orders = await KiteService.getOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Place order endpoint
app.post('/api/orders', async (req, res) => {
  try {
    const orderParams = req.body;
    const result = await KiteService.placeOrder(orderParams);
    res.json(result);
  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// Existing routes for profile, margins, positions, orders...

// Function to find an available port
async function findAvailablePort(startPort) {
  const net = await import('net');
  
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        server.listen(++startPort);
      } else {
        reject(err);
      }
    });
    
    server.on('listening', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    
    server.listen(startPort);
  });
}

// Start server with port fallback
async function startServer() {
  try {
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
      console.log('WebSocket server ready for connections');
    });

    // Upgrade HTTP server to WebSocket server
    server.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    return server;
  } catch (error) {
    if (error.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}`);
      const newPort = port + 1;
      const server = app.listen(newPort, () => {
        console.log(`Server running on port ${newPort}`);
        console.log('WebSocket server ready for connections');
      });

      server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      });

      return server;
    } else {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }
}

// Start the server
startServer();

// Handle Kite access token
let kiteAccessToken = null;

app.post('/api/auth/token', (req, res) => {
  try {
    const { access_token } = req.body;
    kiteAccessToken = access_token;
    KiteService.setAccessToken(access_token);
    res.json({ message: 'Access token set successfully' });
  } catch (error) {
    console.error('Error setting access token:', error);
    res.status(500).json({ error: 'Failed to set access token' });
  }
});

// Diagnostic endpoint to check permissions
app.get('/api/diagnostics/permissions', async (req, res) => {
  try {
    console.log('[DIAGNOSTICS] Running permission check...');
    const profile = await KiteService.checkPermissions();
    res.json({ 
      success: true, 
      profile: profile,
      message: 'Check console logs for detailed permission test results'
    });
  } catch (error) {
    console.error('[DIAGNOSTICS] Permission check failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: 'Check console logs for more information'
    });
  }
});

// Session generation endpoint
app.post('/api/generate_session', async (req, res) => {
  try {
    const { request_token } = req.body;
    
    if (!request_token) {
      return res.status(400).json({ error: 'Request token is required' });
    }

    console.log('Generating session for request token:', request_token);
    
    // Use KiteConnect to generate session
    const sessionData = await KiteService.generateSession(request_token);
    
    console.log('Session generated successfully:', sessionData);
    res.json(sessionData);
    
  } catch (error) {
    console.error('Error generating session:', error);
    res.status(500).json({ error: error.message || 'Failed to generate session' });
  }
});
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

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  KiteService.addWebSocketClient(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'subscribe' && Array.isArray(data.tokens)) {
        KiteService.subscribeTokens(data.tokens);
      } else if (data.type === 'unsubscribe' && Array.isArray(data.tokens)) {
        KiteService.unsubscribeTokens(data.tokens);
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
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
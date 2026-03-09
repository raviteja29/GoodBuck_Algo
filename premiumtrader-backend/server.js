// server.js

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { KiteConnect } from 'kiteconnect';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { KiteTicker } = require('kiteconnect');

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory cache for used request_tokens
const usedTokens = new Set();
// Quote cache and ticker state
const quoteCache = new Map(); // instrument_token -> tick with cacheTs
const subscribedTokens = new Set();
let ticker = null;
let tickerAccessToken = null;

function initTickerIfPossible(accessToken) {
  if (!accessToken) return;
  if (ticker && tickerAccessToken === accessToken) return; // already initialized
  tickerAccessToken = accessToken;
  if (ticker) { try { ticker.disconnect(); } catch (_) { } ticker = null; }
  try {
    console.log('[TICKER] Initializing');
    ticker = new KiteTicker({
      api_key: process.env.KITE_API_KEY,
      access_token: accessToken,
      reconnect: true,
      reconnect_max_delay: 60,
      reconnect_max_tries: 30,
      max_retry: 30,
      debug: false,
      ws_options: { rejectUnauthorized: false }
    });
    ticker.on('connect', () => {
      console.log('[TICKER] Connected');
      if (subscribedTokens.size) {
        const arr = Array.from(subscribedTokens);
        try { ticker.subscribe(arr); ticker.setMode(ticker.MODE_FULL, arr); } catch (e) { console.error('[TICKER] resubscribe failed', e.message); }
      }
    });
    ticker.on('ticks', (ticks = []) => {
      if (!Array.isArray(ticks) || !ticks.length) return;
      const now = Date.now();
      ticks.forEach(t => { if (t && t.instrument_token) quoteCache.set(t.instrument_token, { ...t, cacheTs: now }); });
      if (wss && wss.clients && wss.clients.size) {
        const msg = JSON.stringify({ type: 'ticks', data: ticks });
        let sent = 0; wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) { try { c.send(msg); sent++; } catch (_) { } } });
        if (sent) console.log(`[TICKER] Broadcast ${ticks.length} ticks to ${sent} clients`);
      }
    });
    ticker.on('error', e => console.error('[TICKER] Error', e.message));
    ticker.on('disconnect', r => console.warn('[TICKER] Disconnected', r));
    ticker.connect();
  } catch (e) {
    console.error('[TICKER] Init failed', e.message);
  }
}

// Load .env from parent directory (root of project)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('Using API Key:', process.env.KITE_API_KEY);
console.log('Using API Secret:', process.env.KITE_API_SECRET ? '***secret redacted***' : 'MISSING');
// Breeze key sanity check removed

const app = express();

// In-memory instrument cache (15 min TTL)
// Instrument cache + performance instrumentation
let instrumentCache = { data: null, timestamp: 0, warmed: false };
let instrumentLoadPromise = null; // prevent concurrent duplicate loads
const INSTRUMENT_TTL_MS = 60 * 60 * 1000; // 1 hour (trading session scope)

async function loadInstruments(force = false, reason = 'api-call') {
  const now = Date.now();
  // Serve fresh cache
  if (!force && instrumentCache.data && (now - instrumentCache.timestamp) < INSTRUMENT_TTL_MS) {
    return instrumentCache.data;
  }
  // Reuse in-flight promise if any
  if (instrumentLoadPromise && !force) {
    return instrumentLoadPromise;
  }
  const start = Date.now();
  console.log(`[INSTRUMENTS] Loading start (reason=${reason}) force=${force} …`);
  const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
  if (globalLastAccessToken) kc.setAccessToken(globalLastAccessToken);
  instrumentLoadPromise = kc.getInstruments()
    .then(list => {
      const duration = Date.now() - start;
      instrumentCache = { data: list, timestamp: Date.now(), warmed: true };
      console.log(`[INSTRUMENTS] Loaded ${list.length} instruments in ${duration} ms (reason=${reason})`);
      return list;
    })
    .catch(e => {
      const duration = Date.now() - start;
      console.error(`[INSTRUMENTS] Load failed after ${duration} ms: ${e.message}`);
      if (instrumentCache.data) {
        console.warn('[INSTRUMENTS] Serving stale cache');
        return instrumentCache.data;
      }
      throw e;
    })
    .finally(() => {
      instrumentLoadPromise = null;
    });
  return instrumentLoadPromise;
}

// Track last provided access token to reuse for instrument fetch caching
let globalLastAccessToken = null;

// 1) Enable CORS with explicit origin and credentials
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('http://localhost:') || origin.endsWith('.onrender.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
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
      globalLastAccessToken = sessionData.access_token;
      initTickerIfPossible(globalLastAccessToken);
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

// Removed Breeze login stubs and endpoints


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
    kc.setAccessToken(access_token); globalLastAccessToken = access_token; initTickerIfPossible(access_token);
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
    kc.setAccessToken(access_token); globalLastAccessToken = access_token; initTickerIfPossible(access_token);
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
    kc.setAccessToken(access_token); globalLastAccessToken = access_token; initTickerIfPossible(access_token);
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
    kc.setAccessToken(access_token); globalLastAccessToken = access_token; initTickerIfPossible(access_token);
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
    kc.setAccessToken(access_token); globalLastAccessToken = access_token;
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

// Proxy route for historical data - following Kite Connect API specification
// Route: /instruments/historical/:instrument_token/:interval
app.get('/api/historical/:instrumentToken/:interval', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      console.error('[HISTORICAL] No access token provided');
      return res.status(401).json({ error: 'Access token required' });
    }

    // URI parameters (as per Kite Connect documentation)
    const { instrumentToken, interval } = req.params;

    // Request parameters (as per Kite Connect documentation)
    const { from, to, continuous, oi } = req.query;

    console.log('[HISTORICAL] URI params:', { instrumentToken, interval });
    console.log('[HISTORICAL] Query params:', { from, to, continuous, oi });

    if (!instrumentToken || !interval || !from || !to) {
      console.error('[HISTORICAL] Missing required parameters');
      return res.status(400).json({
        error: 'Missing required parameters. instrumentToken and interval are required in URI, from and to are required in query'
      });
    }

    // Validate interval parameter against allowed values
    const allowedIntervals = ['minute', 'day', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute'];
    if (!allowedIntervals.includes(interval)) {
      console.error('[HISTORICAL] Invalid interval:', interval);
      return res.status(400).json({
        error: `Invalid interval. Allowed values: ${allowedIntervals.join(', ')}`
      });
    }

    // Validate date format - accept both YYYY-MM-DD and YYYY-MM-DD HH:MM:SS
    const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
    const dateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

    const isFromDateValid = dateOnlyRegex.test(from) || dateTimeRegex.test(from);
    const isToDateValid = dateOnlyRegex.test(to) || dateTimeRegex.test(to);

    if (!isFromDateValid || !isToDateValid) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS' });
    }

    // Convert dates to datetime format expected by Kite API (yyyy-mm-dd hh:mm:ss)
    let fromDateTime, toDateTime;

    // Check if input is already in datetime format
    if (from.includes(' ')) {
      fromDateTime = from;
      toDateTime = to;
    } else {
      // Convert from YYYY-MM-DD format to market hours
      fromDateTime = `${from} 09:15:00`; // Market opening time
      toDateTime = `${to} 15:30:00`; // Market closing time
    }

    console.log(`[HISTORICAL] Converted to datetime format: ${fromDateTime} to ${toDateTime}`);
    console.log(`[HISTORICAL] Additional params: continuous=${continuous}, oi=${oi}`);

    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token); globalLastAccessToken = access_token; initTickerIfPossible(access_token);

    try {
      const params = { from: fromDateTime, to: toDateTime };
      if (continuous !== undefined && continuous !== null) {
        params.continuous = continuous === '1' || continuous === 'true';
      }
      if (oi !== undefined && oi !== null) {
        params.oi = oi === '1' || oi === 'true';
      }
      const data = await kc.getHistoricalData(instrumentToken, interval, params.from, params.to, params.continuous, params.oi);
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

// Search instruments (substring match on tradingsymbol or name)
app.get('/api/instruments/search', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (access_token) { globalLastAccessToken = access_token; }
    const { query, name } = req.query;
    const q = (query || name || '').trim();
    if (!q) return res.status(400).json({ error: 'query parameter required' });
    const list = await loadInstruments(false, 'search');
    const lower = q.toLowerCase();
    const filtered = list.filter(i => {
      if (!i || !i.tradingsymbol) return false;
      const ts = i.tradingsymbol.toLowerCase();
      const nameField = (i.name || '').toLowerCase();
      return ts.includes(lower) || nameField.includes(lower);
    });
    res.json(filtered.slice(0, 200));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exact symbol fetch (mirrors expectation from frontend TradingService.getInstrumentsBySymbol)
app.get('/api/instruments/symbol', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (access_token) { globalLastAccessToken = access_token; }
    const { symbol } = req.query;
    if (!symbol) return res.status(400).json({ error: 'symbol parameter required' });
    const upper = symbol.toUpperCase();
    const list = await loadInstruments(false, 'symbol');
    const matches = list.filter(i => i.tradingsymbol === upper);
    const enriched = matches.map(i => ({
      instrument_token: i.instrument_token,
      exchange_token: i.exchange_token,
      tradingsymbol: i.tradingsymbol,
      name: i.name,
      last_price: 0,
      expiry: i.expiry || null,
      strike: i.strike || null,
      tick_size: i.tick_size,
      lot_size: i.lot_size || i.lotsize,
      instrument_type: i.instrument_type,
      segment: i.segment,
      exchange: i.exchange
    }));
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Backward compatibility route for existing frontend code using query parameters
app.get('/api/historical', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      console.error('[HISTORICAL-COMPAT] No access token provided');
      return res.status(401).json({ error: 'Access token required' });
    }

    const { instrumentToken, fromDate, toDate, interval, continuous, oi } = req.query;

    console.log('[HISTORICAL-COMPAT] Legacy route accessed');
    console.log('[HISTORICAL-COMPAT] Query params:', { instrumentToken, fromDate, toDate, interval, continuous, oi });

    if (!instrumentToken || !interval || !fromDate || !toDate) {
      console.error('[HISTORICAL-COMPAT] Missing required query parameters');
      return res.status(400).json({ error: 'Missing required query parameters: instrumentToken, interval, fromDate, toDate' });
    }

    // Validate interval parameter against allowed values
    const allowedIntervals = ['minute', 'day', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute'];
    if (!allowedIntervals.includes(interval)) {
      console.error('[HISTORICAL-COMPAT] Invalid interval:', interval);
      return res.status(400).json({
        error: `Invalid interval. Allowed values: ${allowedIntervals.join(', ')}`
      });
    }

    // Validate date format - accept both YYYY-MM-DD and YYYY-MM-DD HH:MM:SS
    const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
    const dateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

    const isFromDateValid = dateOnlyRegex.test(fromDate) || dateTimeRegex.test(fromDate);
    const isToDateValid = dateOnlyRegex.test(toDate) || dateTimeRegex.test(toDate);

    if (!isFromDateValid || !isToDateValid) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS' });
    }

    // Convert dates to datetime format expected by Kite API (yyyy-mm-dd hh:mm:ss)
    let fromDateTime, toDateTime;

    // Check if input is already in datetime format
    if (fromDate.includes(' ')) {
      fromDateTime = fromDate;
      toDateTime = toDate;
    } else {
      // Convert from YYYY-MM-DD format to market hours
      fromDateTime = `${fromDate} 09:15:00`; // Market opening time
      toDateTime = `${toDate} 15:30:00`; // Market closing time
    }

    console.log(`[HISTORICAL-COMPAT] Converted to datetime format: ${fromDateTime} to ${toDateTime}`);
    console.log(`[HISTORICAL-COMPAT] Additional params: continuous=${continuous}, oi=${oi}`);

    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);

    try {
      // Prepare parameters for getHistoricalData method
      const params = {
        from: fromDateTime,
        to: toDateTime
      };

      // Add continuous parameter if provided (for futures contracts)
      if (continuous !== undefined && continuous !== null) {
        params.continuous = continuous === '1' || continuous === 'true';
        console.log(`[HISTORICAL-COMPAT] Continuous data requested: ${params.continuous}`);
      }

      // Add OI parameter if provided (for Open Interest data)
      if (oi !== undefined && oi !== null) {
        params.oi = oi === '1' || oi === 'true';
        console.log(`[HISTORICAL-COMPAT] OI data requested: ${params.oi}`);
      }

      console.log(`[HISTORICAL-COMPAT] Calling getHistoricalData with params:`, params);

      // Call KiteConnect method with all parameters
      const data = await kc.getHistoricalData(instrumentToken, interval, params.from, params.to, params.continuous, params.oi);

      console.log('[HISTORICAL-COMPAT] Data fetched:', {
        hasData: !!data,
        hasCandlesArray: Array.isArray(data.candles),
        candlesCount: data.candles ? data.candles.length : 0,
        sampleCandle: data.candles && data.candles[0] ? data.candles[0] : null,
        includesOI: params.oi && data.candles && data.candles[0] ? data.candles[0].length === 7 : false
      });

      res.json(data);
    } catch (apiErr) {
      console.error('[HISTORICAL-COMPAT] Error from KiteConnect:', apiErr);
      res.status(500).json({ error: apiErr.message, details: apiErr });
    }
  } catch (err) {
    console.error('[HISTORICAL-COMPAT] Route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Historical high/low endpoint  
app.get('/api/instruments/historical-high-low', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) {
      console.error('[HISTORICAL-HIGH-LOW] No access token provided');
      return res.status(401).json({ error: 'Access token required' });
    }

    const { instrumentToken, fromDate, toDate } = req.query;
    console.log('[HISTORICAL-HIGH-LOW] Query params:', { instrumentToken, fromDate, toDate });

    if (!instrumentToken) {
      return res.status(400).json({ error: 'instrumentToken parameter is required' });
    }

    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate and toDate parameters are required' });
    }

    // Validate date format - accept both YYYY-MM-DD and YYYY-MM-DD HH:MM:SS
    const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
    const dateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

    const isFromDateValid = dateOnlyRegex.test(fromDate) || dateTimeRegex.test(fromDate);
    const isToDateValid = dateOnlyRegex.test(toDate) || dateTimeRegex.test(toDate);

    if (!isFromDateValid || !isToDateValid) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS' });
    }

    console.log(`[HISTORICAL-HIGH-LOW] Date validation passed for ${fromDate} to ${toDate}`);

    // Convert to datetime format expected by Kite API if needed
    let fromDateTime, toDateTime;

    // Check if dates already include time, otherwise add market hours
    if (fromDate.includes(' ')) {
      fromDateTime = fromDate;
    } else {
      fromDateTime = `${fromDate} 09:15:00`; // Market opening time
    }

    if (toDate.includes(' ')) {
      toDateTime = toDate;
    } else {
      toDateTime = `${toDate} 15:30:00`; // Market closing time
    }

    console.log(`[HISTORICAL-HIGH-LOW] Converted to datetime format: ${fromDateTime} to ${toDateTime}`);

    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);

    try {
      console.log(`[HISTORICAL-HIGH-LOW] Fetching historical data for token ${instrumentToken} from ${fromDateTime} to ${toDateTime}`);
      console.log(`[HISTORICAL-HIGH-LOW] KiteConnect instance created with API key: ${process.env.KITE_API_KEY ? 'Present' : 'Missing'}`);
      console.log(`[HISTORICAL-HIGH-LOW] Access token set: ${access_token ? 'Present' : 'Missing'}`);

      // Instead of using 'day' interval, use 'minute' interval to get intraday data
      // Then calculate OHLC for each day from 9:15 AM to 3:30 PM
      console.log(`[HISTORICAL-HIGH-LOW] Fetching minute-level data to calculate daily OHLC from market hours`);

      const historicalData = await kc.getHistoricalData(instrumentToken, 'minute', fromDateTime, toDateTime);

      console.log(`[HISTORICAL-HIGH-LOW] Raw minute-level data received:`, {
        hasData: !!historicalData,
        hasCandles: !!(historicalData && historicalData.candles),
        candlesLength: historicalData && historicalData.candles ? historicalData.candles.length : 0,
        sampleCandle: historicalData && historicalData.candles && historicalData.candles[0] ? historicalData.candles[0] : null,
        requestedRange: `${fromDateTime} to ${toDateTime}`,
        instrumentToken: instrumentToken,
        dataType: Array.isArray(historicalData) ? 'direct_array' : 'candles_object'
      });

      // Handle both formats: candles array or direct array of objects
      let dataArray = null;
      if (historicalData && historicalData.candles && Array.isArray(historicalData.candles)) {
        dataArray = historicalData.candles;
      } else if (historicalData && Array.isArray(historicalData)) {
        dataArray = historicalData;
      }

      if (!dataArray || dataArray.length === 0) {
        console.warn(`[HISTORICAL-HIGH-LOW] No data available for the requested range ${fromDateTime} to ${toDateTime}`);

        // Provide more specific error message based on the date range
        const startDate = new Date(fromDate);
        const endDate = new Date(toDate);
        const today = new Date();

        // Check if trying to access future dates
        if (startDate > today || endDate > today) {
          throw new Error(`Cannot fetch data for future dates. Please select dates from the past.`);
        }

        // Check if the range is only weekends
        let hasWeekdays = false;
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
          const dayOfWeek = d.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not Sunday (0) or Saturday (6)
            hasWeekdays = true;
            break;
          }
        }

        if (!hasWeekdays) {
          throw new Error(`The selected date range (${fromDate} to ${toDate}) contains only weekends. Please select a range that includes weekdays.`);
        }

        // Generic message for other cases (holidays, etc.)
        throw new Error(`No trading data available for the selected date range (${fromDate} to ${toDate}). This could be due to market holidays. Please try a different date range.`);
      }

      // Calculate daily OHLC from minute-level data for market hours (9:15 AM to 3:30 PM)
      let overallHigh = Number.MIN_SAFE_INTEGER;
      let overallLow = Number.MAX_SAFE_INTEGER;

      console.log(`[HISTORICAL-HIGH-LOW] Processing ${dataArray.length} minute-level data points for date range ${fromDate} to ${toDate}:`);

      // Group minute data by date to calculate daily OHLC
      const dailyData = {};

      dataArray.forEach((dataPoint, index) => {
        let timestamp, open, high, low, close, volume;

        // Handle both formats: array format [timestamp, open, high, low, close, volume] or object format
        if (Array.isArray(dataPoint)) {
          timestamp = dataPoint[0];
          open = dataPoint[1];
          high = dataPoint[2];
          low = dataPoint[3];
          close = dataPoint[4];
          volume = dataPoint[5];
        } else if (typeof dataPoint === 'object' && dataPoint !== null) {
          timestamp = dataPoint.date || dataPoint.timestamp;
          open = dataPoint.open;
          high = dataPoint.high;
          low = dataPoint.low;
          close = dataPoint.close;
          volume = dataPoint.volume;
        }

        const date = new Date(timestamp).toISOString().split('T')[0];
        const time = new Date(timestamp).toTimeString().split(' ')[0];

        // Initialize daily data if not exists
        if (!dailyData[date]) {
          dailyData[date] = {
            date: date,
            open: null,
            high: Number.MIN_SAFE_INTEGER,
            low: Number.MAX_SAFE_INTEGER,
            close: null,
            minuteCount: 0,
            firstTime: null,
            lastTime: null
          };
        }

        // Set open price (first minute of the day)
        if (dailyData[date].open === null || !dailyData[date].firstTime || time < dailyData[date].firstTime) {
          dailyData[date].open = open;
          dailyData[date].firstTime = time;
        }

        // Set close price (last minute of the day)
        if (dailyData[date].close === null || !dailyData[date].lastTime || time > dailyData[date].lastTime) {
          dailyData[date].close = close;
          dailyData[date].lastTime = time;
        }

        // Update high and low
        if (high > dailyData[date].high) {
          dailyData[date].high = high;
        }
        if (low < dailyData[date].low) {
          dailyData[date].low = low;
        }

        dailyData[date].minuteCount++;

        // Update overall high and low
        if (high > overallHigh) {
          overallHigh = high;
        }
        if (low < overallLow) {
          overallLow = low;
        }
      });

      // Log each day's OHLC calculated from minute data
      const sortedDates = Object.keys(dailyData).sort();
      sortedDates.forEach((date, index) => {
        const dayData = dailyData[date];
        console.log(`[HISTORICAL-HIGH-LOW] Day ${index + 1} (${date}): Open=${dayData.open}, High=${dayData.high}, Low=${dayData.low}, Close=${dayData.close}, Minutes=${dayData.minuteCount}, TimeRange=${dayData.firstTime}-${dayData.lastTime}`);
      });

      console.log(`[HISTORICAL-HIGH-LOW] Analysis complete - Overall High: ${overallHigh}, Overall Low: ${overallLow} across ${sortedDates.length} trading days`);

      const result = {
        high: overallHigh,
        low: overallLow,
        dataPoints: sortedDates.length,
        minuteDataPoints: dataArray.length,
        dailyBreakdown: dailyData,
        dateRange: {
          from: fromDate,
          to: toDate
        }
      };

      res.json(result);
    } catch (apiErr) {
      console.error('[HISTORICAL-HIGH-LOW] Error from KiteConnect:', apiErr);
      res.status(500).json({ error: apiErr.message, details: apiErr });
    }
  } catch (err) {
    console.error('[HISTORICAL-HIGH-LOW] Route error:', err);
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

// Single token quote (cache-first) endpoint
app.get('/api/quote', async (req, res) => {
  try {
    const access_token = getAccessToken(req);
    if (!access_token) return res.status(401).json({ error: 'Access token required' });
    initTickerIfPossible(access_token);
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'token parameter required' });
    const instrumentToken = parseInt(String(token), 10);
    if (Number.isNaN(instrumentToken)) return res.status(400).json({ error: 'token must be numeric' });
    const freshWindow = 5000; // 5s
    const cached = quoteCache.get(instrumentToken);
    if (cached && (Date.now() - cached.cacheTs) < freshWindow) {
      return res.json({ source: 'cache', quote: cached });
    }
    const kc = new KiteConnect({ api_key: process.env.KITE_API_KEY });
    kc.setAccessToken(access_token);
    try {
      const q = await kc.getQuote([instrumentToken]);
      const data = q[instrumentToken];
      if (data) quoteCache.set(instrumentToken, { ...data, cacheTs: Date.now() });
      return res.json({ source: 'api', quote: data || null });
    } catch (e) {
      if (cached) return res.json({ source: 'stale-cache', quote: cached, warning: e.message });
      return res.status(500).json({ error: e.message });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add search endpoint for instruments
// (Removed duplicate /api/instruments/search route that bypassed cache)

// Proxy route for instrument details
// (Removed duplicate /api/instruments/details route doing full reload each call)

// Lightweight instrument meta detail via cache (replacement) – returns token + name if present
app.get('/api/instruments/details', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: 'name parameter required' });
    const list = await loadInstruments(false, 'details');
    const searchName = name.toUpperCase().replace(/\s+/g, '');
    let inst = list.find(i => i.tradingsymbol && i.tradingsymbol.toUpperCase() === searchName);
    if (!inst) {
      if (searchName === 'NIFTY50' || searchName === 'NIFTY') {
        inst = list.find(i => i.tradingsymbol === 'NIFTY' && i.exchange === 'NSE');
      } else if (searchName === 'BANKNIFTY') {
        inst = list.find(i => i.tradingsymbol === 'BANKNIFTY' && i.exchange === 'NSE');
      }
    }
    if (!inst) {
      inst = list.find(i => i.tradingsymbol && i.tradingsymbol.toUpperCase().includes(searchName));
    }
    if (!inst) return res.status(404).json({ error: 'Instrument not found' });
    return res.json({
      name: inst.tradingsymbol,
      token: inst.instrument_token,
      exchange: inst.exchange,
      segment: inst.segment,
      instrument_type: inst.instrument_type,
      expiry: inst.expiry || null,
      strike: inst.strike || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Cache status endpoint
app.get('/api/instruments/cache/status', (req, res) => {
  res.json({
    hasData: !!instrumentCache.data,
    count: instrumentCache.data ? instrumentCache.data.length : 0,
    ageMs: instrumentCache.data ? (Date.now() - instrumentCache.timestamp) : null,
    warmed: instrumentCache.warmed,
    ttlMs: INSTRUMENT_TTL_MS
  });
});

// Fresh instruments endpoint with daily caching
app.get('/api/instruments/fresh', async (req, res) => {
  try {
    const { exchange } = req.query;

    console.log(`[/api/instruments/fresh] Fetching fresh instruments${exchange ? ` for ${exchange}` : ''}`);

    // Force fresh load to ensure we get the latest instruments
    const instruments = await loadInstruments(true, 'fresh-request');

    if (!instruments || !Array.isArray(instruments)) {
      return res.status(500).json({ error: 'Failed to load instruments data' });
    }

    // Filter by exchange if specified
    let filteredInstruments = instruments;
    if (exchange) {
      filteredInstruments = instruments.filter(inst =>
        inst.exchange && inst.exchange.toUpperCase() === exchange.toUpperCase()
      );
      console.log(`[/api/instruments/fresh] Filtered ${filteredInstruments.length} instruments for ${exchange}`);
    }

    // Sort by tradingsymbol for consistent results
    filteredInstruments.sort((a, b) => (a.tradingsymbol || '').localeCompare(b.tradingsymbol || ''));

    console.log(`[/api/instruments/fresh] Returning ${filteredInstruments.length} instruments`);
    res.json(filteredInstruments);

  } catch (error) {
    console.error('[/api/instruments/fresh] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch fresh instruments',
      details: error.message
    });
  }
});

// Ticker status endpoint
app.get('/api/ticker/status', (req, res) => {
  const now = Date.now();
  const sample = [];
  // Provide up to 5 recent cached quotes for transparency
  for (const [token, q] of quoteCache.entries()) {
    sample.push({ token, last_price: q.last_price, cacheAgeMs: now - q.cacheTs });
    if (sample.length >= 5) break;
  }
  res.json({
    initialized: !!ticker,
    connected: !!(ticker && ticker.connected),
    subscribedTokenCount: subscribedTokens.size,
    subscribedTokens: Array.from(subscribedTokens).slice(0, 50), // cap list size
    quoteCacheSize: quoteCache.size,
    quoteCacheSample: sample
  });
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

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../dist')));

// Catch-all handler: send back React's index.html file for any non-API routes
app.use((req, res, next) => {
  // Don't serve index.html for API routes or WebSocket
  if (req.path.startsWith('/api/') || req.path.startsWith('/ws')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  // For all other routes, serve the React app
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Initialize WebSocket server with path
const wss = new WebSocketServer({
  server,
  path: '/ws',
  perMessageDeflate: false,
  verifyClient: ({ req }, done) => {
    try {
      // Use a fixed host for parsing the URL relative path
      const url = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      console.log(`[WS-HANDSHAKE] Connection attempt. Token present: ${!!token}`);

      if (!token) {
        console.warn('[WS-HANDSHAKE] Rejected: No token provided');
        return done(false, 401, 'Unauthorized');
      }

      // Basic format check (api_key:access_token)
      if (!token.includes(':') || token.split(':').length !== 2) {
        console.warn('[WS-HANDSHAKE] Rejected: Malformed token format');
        return done(false, 401, 'Unauthorized');
      }

      console.log('[WS-HANDSHAKE] Accepted (pending post-connect validation)');
      done(true);
    } catch (error) {
      console.error('[WS-HANDSHAKE] Error:', error);
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

wss.on('connection', async (ws, req) => {
  const clientId = uuidv4();
  console.log(`[WS] Connection opened [ID: ${clientId}] from: ${req.socket.remoteAddress}`);

  // Use a fixed host for parsing the URL relative path
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token');
  const [apiKey, accessToken] = (token || '').split(':');

  if (!accessToken) {
    console.error(`[WS] Client ${clientId} connected without valid token format. Closing.`);
    ws.close(1008, 'Malformed token');
    return;
  }

  // Set up Kite client and try to validate
  const kc = new KiteConnect({ api_key: apiKey || process.env.KITE_API_KEY });
  kc.setAccessToken(accessToken);

  try {
    console.log(`[WS] ID: ${clientId} Validating token...`);
    // Validation: attempt to get profile
    const profile = await kc.getProfile();
    console.log(`[WS] ID: ${clientId} Auth SUCCESS (User: ${profile.user_id})`);

    // Store client info
    clients.set(clientId, {
      ws,
      token: accessToken,
      subscribedTokens: new Set(),
      lastPong: Date.now(),
      kiteClient: kc,
      profile
    });

    // Ensure ticker is initialized for this token if needed
    globalLastAccessToken = accessToken;
    initTickerIfPossible(accessToken);

    // Send success results
    ws.send(JSON.stringify({
      type: 'auth_result',
      success: true,
      user_id: profile.user_id,
      clientId
    }));

    ws.send(JSON.stringify({
      type: 'connection',
      status: 'connected',
      message: 'Authenticated and connected'
    }));

  } catch (err) {
    console.error(`[WS] ID: ${clientId} Auth FAILED: ${err.message}`);
    ws.send(JSON.stringify({
      type: 'auth_result',
      success: false,
      message: err.message
    }));
    // Close after a short delay so client gets the message
    setTimeout(() => ws.close(1008, 'Authentication failed'), 1000);
    return;
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
            // Track & subscribe ticker
            data.tokens.forEach(t => { if (typeof t === 'number') subscribedTokens.add(t); });
            if (ticker && ticker.connected) {
              try { ticker.subscribe(data.tokens); ticker.setMode(ticker.MODE_FULL, data.tokens); } catch (e) { console.error('[TICKER] subscribe error', e.message); }
            }
          }
          break;

        case 'unsubscribe':
          if (Array.isArray(data.tokens)) {
            data.tokens.forEach(token => clientInfo.subscribedTokens.delete(token));
            console.log(`Client ${clientId} unsubscribed from tokens:`, data.tokens);
            data.tokens.forEach(t => subscribedTokens.delete(t));
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
server.listen(port, '0.0.0.0', () => {
  console.log(`Backend server running on port ${port}`);
  console.log(`WebSocket server running on port ${port}`);
  // Warm instrument cache in background (non-blocking)
  loadInstruments(false, 'warm-start').catch(e => console.warn('[INSTRUMENTS] Warm load failed:', e.message));
});


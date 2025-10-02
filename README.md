
 # Zerodha Premium Trader (Analytics + Realtime) – Consolidated Backend

 Production‑oriented React + Vite application powered by a single consolidated premium backend that wraps Zerodha Kite Connect for:

 - Fast instrument search (1h cached, warm start)
 - Robust option symbol resolution (multi-format, Tuesday weekly expiry logic, SEPT/SEP variants)
 - Historical data (standard + compatibility routes + derived daily high/low from minute data)
 - Live streaming ticks via integrated KiteTicker (WebSocket broadcast)
 - Cached single & multi quote endpoints with stale fallback
 - Order postback (webhook) ingestion & broadcast
 - Diagnostics endpoints (instrument cache status, ticker status)
 - Debug UI panel in frontend for transparent symbol candidate / resolution tracing

## Current Architecture

```
frontend (Vite React)  --->  premiumtrader-backend/server.js (Express 5 + KiteConnect + KiteTicker)
```

Legacy backend removed (Sept 28 2025). See `DEPRECATION_NOTICE.md` for historical context & rollback instructions.

## Quick Start

Prerequisites:
 - Node 18+
 - Zerodha Kite API Key & Secret (.env in backend)

1. Install dependencies (root + premium backend):
	```powershell
	npm install
	cd premiumtrader-backend; npm install; cd ..
	```
2. Backend env file `premiumtrader-backend/.env`:
	```
	KITE_API_KEY=your_key
	KITE_API_SECRET=your_secret
	PORT=5000
	```
3. Start backend (from `premiumtrader-backend` or add a root script):
	```powershell
	cd premiumtrader-backend; node server.js
	```
4. Start frontend (root):
	```powershell
	npm run dev
	```
5. Login flow: Obtain `request_token` from Zerodha redirect, POST to `/api/generate_session` then use returned `access_token` in Authorization headers (Bearer) or embedded websocket token `api_key:access_token`.

## Key Backend Endpoints (premiumtrader-backend)

| Category | Endpoint | Notes |
|----------|----------|-------|
| Auth | POST `/api/generate_session` | Exchanges request_token -> session/access_token; initializes ticker |
| Profile/Data | GET `/api/profile`, `/api/margins`, `/api/positions`, `/api/holdings`, `/api/orders` | Requires Bearer token |
| Orders | POST `/api/orders` | Place order |
| Historical | GET `/api/historical/:instrumentToken/:interval` | Primary typed route |
| Historical Compat | GET `/api/historical` | Legacy query style |
| Derived Daily HL | GET `/api/instruments/historical-high-low` | Builds OHLC from minute candles |
| Instruments Search | GET `/api/instruments/search?query=INFY` | Uses 1h cache |
| Instrument Symbol | GET `/api/instruments/symbol?symbol=NIFTY24SEP18000CE` | Exact lookup with enrichment |
| Instrument Details | GET `/api/instruments/details?name=NIFTY` | Lightweight meta (no fresh quote) |
| Quotes (multi) | GET `/api/quotes?tokens=123,456` | Direct API (no internal cache) |
| Quote (single) | GET `/api/quote?token=123` | 5s cache + stale fallback |
| Instrument Cache Status | GET `/api/instruments/cache/status` | Age, count, warmed flag |
| Ticker Status | GET `/api/ticker/status` | Connected + subscribed tokens + cache sample |
| Order Webhook | POST `/api/webhook/orders` | Validates optional signature, broadcasts updates |

## WebSocket (Realtime)

Path: `ws://https://goodbuck-algo.onrender.com/ws?token=api_key:access_token`

Messages (client → server):
```json
{ "type": "subscribe", "tokens": [12345, 67890] }
{ "type": "unsubscribe", "tokens": [12345] }
```

Messages (server → client):
```json
{ "type": "connection", "status": "connected", "clientId": "..." }
{ "type": "quotes", "data": { "12345": {...} } }   // initial snapshot
{ "type": "ticks", "data": [ { "instrument_token":12345, "last_price":... }, ... ] }
{ "type": "order_update", "data": { ... } }
{ "type": "ping" }
```

Subscription automatically forwards tokens to KiteTicker (FULL mode). Ticks update an in-memory quoteCache (5s freshness window for single quote endpoint).

## Instrument Cache Strategy

 - Single in‑flight promise prevents stampede.
 - 1 hour TTL (covers trading session; manual refresh triggered implicitly on expiry).
 - Warm load on server start (non-blocking) to reduce first‑request latency.
 - Stale serve fallback if refresh fails.

## Consolidation Status

Completed:
 - Migrated ticker (live streaming) into premium backend.
 - Added single `GET /api/quote` (cache-first / stale fallback) & `GET /api/quotes`.
 - Unified search, symbol, details endpoints behind shared instrument cache.
 - Added diagnostic endpoints (`/api/instruments/cache/status`, `/api/ticker/status`).

Pending (see `DEPRECATION_NOTICE.md`):
 - Final removal of `server/` directory after validation window.
 - Optional ref-counted ticker unsubscribe (currently coarse: tokens accumulate; safe but could over-subscribe). 

## Frontend Highlights

 - Robust option candidate generation (multi formatting, expiry adjustments for Tuesday weekly change).
 - Static per-option Fibonacci cache keyed by token+date for deterministic analytics.
 - HMA calculation utilities for strategy components.
 - Debug Option Resolution panel (shows candidate list, method used, resolution logs & last price sources).

## Development Scripts (suggested)

Add to root `package.json` (if not present):
```json
{
  "scripts": {
	 "dev": "vite",
	 "backend": "node premiumtrader-backend/server.js",
	 "start:all": "powershell -Command \"Start-Process -NoNewWindow npm -ArgumentList 'run dev'; Start-Sleep -Milliseconds 800; npm run backend\""
  }
}
```

## Environment & Security

Never commit your `.env`. The access token is short-lived; refresh by redoing login/session. Order webhook signature verification uses `X-Kite-Signature` (HMAC SHA256 of raw body with API secret) when provided.

## Deprecation Summary (Completed)

Legacy backend (`server/`) removed after consolidation. All functionality resides in `premiumtrader-backend/server.js`. Refer to `DEPRECATION_NOTICE.md` for audit trail and rollback procedure.

## Future Improvements

 - Ref-counted ticker subscriptions & auto-unsubscribe when no clients need a token.
 - Persistence layer for instrument snapshot meta (reduce memory reparse on restart).
 - Rate / error budget dashboard + Prometheus metrics exporter.
 - Graceful multi-session handling if multiple user access tokens are desired (current design assumes single active access token lifecycle).

## Troubleshooting

| Issue | Likely Cause | Action |
|-------|--------------|--------|
| 401 on WebSocket | Expired / wrong access token | Re-login to regenerate session |
| Slow first search | Warm load still in progress | Wait few seconds; cache warms automatically |
| No ticks | Token not subscribed or permission | Check `/api/ticker/status` & subscription message |
| Quote API slow | Hitting Kite rate/latency | Single token endpoint will serve cached/stale |

## License

Internal / Proprietary – adapt as needed.

---
Generated consolidation README replacing default Vite template.

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

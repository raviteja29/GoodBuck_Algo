# Legacy Backend Deprecation Notice

Status: COMPLETED (legacy `server/` directory removed on 2025-09-28)

Physical purge details (2025-09-28): Legacy runtime code replaced by minimal placeholders (`server/server.js`, `server/package.json`) and directory added to .gitignore for node_modules and env artifacts to prevent accidental resurrection.

## Scope
The directory `server/` (legacy backend) and its service `services/KiteService.js` are deprecated. The consolidated backend is `premiumtrader-backend/server.js`.

## Rationale
- Eliminates duplicate instrument fetch & caching logic
- Single source for WebSocket + tick distribution (lower connection overhead)
- Unified quote caching path (single token + multi token + live tick feed)
- Reduced maintenance surface & logging noise
- Faster cold start (warm instrument preload + single concurrency guard)

## Functional Parity Achieved
| Feature | Legacy | Premium Backend | Status |
|---------|--------|-----------------|--------|
| Instrument search | Yes | Yes (cached 1h, warm) | Parity / Improved |
| Exact symbol lookup | Yes | Yes | Parity |
| Instrument details | Yes | Yes (lightweight) | Parity |
| Historical data | Partial | Full (interval + compat + derived HL) | Improved |
| Ticker streaming | Yes | Yes (KiteTicker integrated) | Parity |
| Order updates broadcast | No | Yes (webhook) | Added |
| Single quote cache | Yes (5s) | Yes (5s + stale fallback) | Parity / Improved |
| Multi quotes | Basic | Yes | Added |
| Diagnostics endpoints | No | Yes (/api/instruments/cache/status, /api/ticker/status) | Added |

## Removal Checklist
1. Run smoke tests:
   - Start premium backend: `node premiumtrader-backend/server.js`
   - Login & confirm `/api/profile` works
   - Subscribe via WebSocket and confirm ticks arrive
   - Hit `/api/quote?token=XXXX` twice (second should be `source=cache`)
   - Call `/api/instruments/search?query=NIFTY` returns list
   - Call `/api/ticker/status` shows `connected: true`
2. Frontend: navigate analytics pages; confirm option resolution & debug panel show correct tokens.
3. Verify order webhook (if configured) logs postback & broadcasts `order_update` message.
4. Confirm no remaining frontend calls go to `server/` port or expect its old endpoints.
5. Delete legacy directory:
   - Remove `server/` folder
   - Remove any scripts referencing it
6. Update documentation references (already adjusted in `README.md`).
7. Commit & push.

## Grace Period Recommendation
Keep legacy backend for 1-2 trading sessions in parallel (do NOT run simultaneously on same port) for fallback. After confidence established, remove.

## Known Non-ported Elements
- Extremely verbose per-token subscription logging logic (trimmed for clarity)
- Individual token resubscribe fallback loops (current implementation bulk-subscribes, sufficient; can add granular retry later if needed)

## Post-Removal Follow Ups (Optional)
- Implement reference counted unsubscribe to reduce over-subscription (`Map<token, refCount>` + prune when zero)
- Add metrics/health endpoint combining instrument & ticker stats
- Integrate structured logging (pino) and log level ENV control
- Persist last n minutes of ticks per token (ring buffer) for immediate chart seeding

## Rollback Plan
If an unforeseen gap surfaces after removal:
1. Recover `server/` directory from Git history (`git checkout <commit> -- server/`).
2. Run on alternate port (e.g., 5001) while diagnosing.
3. Diff behavior to identify missing feature and patch premium backend.

---
Prepared as part of consolidation (Plan A) completion.

// SQLite store for GoodBuck. Uses Node's built-in node:sqlite (Node >= 22.13),
// so there is no native dependency to build or ship.
//
// Schema changes go in MIGRATIONS as new entries; never edit an applied one.
// PRAGMA user_version records how many have run.

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'goodbuck.db');

const MIGRATIONS = [
  // 1 — initial schema
  `
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- A strategy is a parameterised config (instrument, timeframe, levels, HMA, setups, session, risk).
  CREATE TABLE strategies (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused')),
    config      TEXT NOT NULL,              -- JSON
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE backtests (
    id           TEXT PRIMARY KEY,
    strategy_id  TEXT REFERENCES strategies(id) ON DELETE CASCADE,
    params       TEXT NOT NULL,             -- JSON: config snapshot + date range
    metrics      TEXT,                      -- JSON
    equity       TEXT,                      -- JSON array
    status       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
    error        TEXT,
    created_at   INTEGER NOT NULL,
    finished_at  INTEGER
  );
  CREATE INDEX backtests_strategy ON backtests(strategy_id, created_at DESC);

  CREATE TABLE backtest_trades (
    backtest_id  TEXT NOT NULL REFERENCES backtests(id) ON DELETE CASCADE,
    seq          INTEGER NOT NULL,
    side         TEXT NOT NULL,
    setup        TEXT,
    entry_ts     INTEGER NOT NULL,
    entry_price  REAL NOT NULL,
    exit_ts      INTEGER,
    exit_price   REAL,
    exit_reason  TEXT,
    points       REAL,
    PRIMARY KEY (backtest_id, seq)
  );

  -- Candle cache: each (instrument, interval, day) is fetched from Kite once.
  CREATE TABLE candles (
    instrument_token  INTEGER NOT NULL,
    interval          TEXT NOT NULL,
    ts                INTEGER NOT NULL,     -- epoch ms, bar open
    open REAL NOT NULL, high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL,
    volume REAL, oi REAL,
    PRIMARY KEY (instrument_token, interval, ts)
  ) WITHOUT ROWID;

  CREATE TABLE candle_days (
    instrument_token  INTEGER NOT NULL,
    interval          TEXT NOT NULL,
    day               TEXT NOT NULL,        -- YYYY-MM-DD (IST)
    complete          INTEGER NOT NULL DEFAULT 1,
    fetched_at        INTEGER NOT NULL,
    PRIMARY KEY (instrument_token, interval, day)
  ) WITHOUT ROWID;

  -- Every signal the live engine emits: touch (on tick), confirmed (on bar close), exit, system.
  CREATE TABLE signals (
    id                TEXT PRIMARY KEY,
    strategy_id       TEXT REFERENCES strategies(id) ON DELETE SET NULL,
    stage             TEXT NOT NULL CHECK (stage IN ('touch','confirmed','exit','system')),
    side              TEXT,
    instrument_token  INTEGER,
    price             REAL,
    stop              REAL,
    target            REAL,
    level             TEXT,
    payload           TEXT,                 -- JSON
    ts                INTEGER NOT NULL,     -- market time of the event
    created_at        INTEGER NOT NULL
  );
  CREATE INDEX signals_ts ON signals(ts DESC);
  CREATE INDEX signals_strategy ON signals(strategy_id, ts DESC);

  -- Daily 15:35 snapshot of orders and positions (Kite only keeps today's).
  CREATE TABLE trade_snapshots (
    day          TEXT NOT NULL,             -- YYYY-MM-DD (IST)
    kind         TEXT NOT NULL CHECK (kind IN ('order','position')),
    ref_id       TEXT NOT NULL,             -- order_id, or tradingsymbol+product for positions
    strategy_id  TEXT,                      -- from the Kite order tag; NULL = unattributed
    payload      TEXT NOT NULL,             -- JSON as returned by Kite
    PRIMARY KEY (day, kind, ref_id)
  ) WITHOUT ROWID;
  `,

  // 2 — backtest trades stored as JSON (the engine's trade shape, legs included),
  //     plus the strategy's config snapshot on each backtest for staleness checks.
  `
  DROP TABLE backtest_trades;
  CREATE TABLE backtest_trades (
    backtest_id  TEXT NOT NULL REFERENCES backtests(id) ON DELETE CASCADE,
    seq          INTEGER NOT NULL,
    setup_key    TEXT NOT NULL,
    side         TEXT NOT NULL,
    entry_ts     INTEGER NOT NULL,
    points       REAL NOT NULL,
    data         TEXT NOT NULL,             -- JSON trade incl. legs
    PRIMARY KEY (backtest_id, seq)
  );
  ALTER TABLE backtests ADD COLUMN summary TEXT;   -- JSON per-setup rows
  ALTER TABLE backtests ADD COLUMN info TEXT;      -- JSON: candles used, skipped weeks, timings
  `,

  // 3 — option contracts whose candles are archived (candles live in `candles`).
  `
  CREATE TABLE option_contracts (
    instrument_token  INTEGER PRIMARY KEY,
    tradingsymbol     TEXT NOT NULL,
    underlying        TEXT NOT NULL,
    expiry            TEXT NOT NULL,        -- YYYY-MM-DD
    strike            REAL NOT NULL,
    type              TEXT NOT NULL CHECK (type IN ('CE','PE')),
    lot_size          INTEGER,
    first_saved_at    INTEGER NOT NULL
  );
  CREATE INDEX option_contracts_expiry ON option_contracts(underlying, expiry, strike);
  `,

  // 4 — Cross Pullback levels and the CE/PE strikes saved for each trading day.
  `
  CREATE TABLE option_levels (
    cross_ts   INTEGER NOT NULL,             -- the cross that started the setup
    day        TEXT NOT NULL,                -- trading day the level applies to (IST)
    side       TEXT NOT NULL,
    level      REAL NOT NULL,                -- first-touch price (GIFT NIFTY)
    touch_ts   INTEGER NOT NULL,
    until_ts   INTEGER,                      -- next cross; NULL while still valid
    expiry     TEXT,
    ce_strike  REAL NOT NULL,
    pe_strike  REAL NOT NULL,
    ce_token   INTEGER,
    pe_token   INTEGER,
    saved_at   INTEGER NOT NULL,
    PRIMARY KEY (cross_ts, day)
  ) WITHOUT ROWID;
  `,

  // 5 — drop level rows mapped to a later week's expiry (that week's had expired).
  `
  DELETE FROM option_levels WHERE expiry IS NOT NULL AND julianday(expiry) - julianday(day) > 6;
  `,

  // 6 — a level now saves CE and PE at the strike below and the strike above it.
  `
  ALTER TABLE option_levels RENAME COLUMN ce_strike TO strike_below;
  ALTER TABLE option_levels RENAME COLUMN pe_strike TO strike_above;
  ALTER TABLE option_levels DROP COLUMN ce_token;
  ALTER TABLE option_levels DROP COLUMN pe_token;
  `,
];

export function openDb(file = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw new Error(`DB migration ${v + 1} failed: ${e.message}`);
    }
  }
}

export function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

export function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

export function deleteMeta(db, key) {
  db.prepare('DELETE FROM meta WHERE key = ?').run(key);
}

export function schemaVersion(db) {
  return db.prepare('PRAGMA user_version').get().user_version;
}

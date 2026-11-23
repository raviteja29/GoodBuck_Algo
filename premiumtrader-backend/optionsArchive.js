// Options archive: saves the NIFTY option strikes the Cross Pullback levels
// would trade, while the contracts are still live (Kite stops serving a
// contract's data once it has expired).
//
// A level is a setup's first-touch price (GIFT NIFTY, 15m, HMA 50 vs HMA 130).
// It stays valid until the next cross, so it can be set on any earlier day.
// For each trading session the level is valid in (or, if it ends before one
// opens, the next session after it was set):
//   CE = level rounded down to 50, PE = level rounded up to 50 (equal on a strike),
//   expiry = the first NIFTY expiry on or after that session's day (within its
//   Wednesday → Tuesday week; if that one has expired, nothing can be saved).
// Those contracts' 5-minute candles (with OI) are saved for that day.
// Each run looks back LOOKBACK_DAYS, so a missed day is filled in on the next
// run while the contracts are live.

import { ensureCandles, getCandles, todayIST } from './candles.js';
import { getMeta, setMeta } from './db/index.js';
import { addDays, toInputDate } from './strategy/session.js';
import { runCrossPullback } from './strategy/rules/crossPullback.js';
import { DEFAULT_CROSS_CONFIG, normalizeConfig } from './strategy/config.js';

export const OPTIONS_ARCHIVE = {
  underlying: 'NIFTY',
  strikeStep: 50,
  interval: '5minute',
  lookbackDays: 10,
  historyDays: 120,              // GIFT NIFTY history for the HMA 130 warm-up
  sessionStartMin: 9 * 60 + 15,  // 09:15 IST
  sessionEndMin: 15 * 60 + 30,   // 15:30 IST
  runAfterMinIST: 15 * 60 + 40,  // 15:40 IST, after the close
};

const LAST_RUN_KEY = 'options_archive_levels_last_run'; // renamed when the rule changed to level strikes
const IST_OFFSET_MS = 330 * 60000;
const isoDay = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const istDay = (ms) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
const istMin = (ms) => { const d = new Date(ms + IST_OFFSET_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const at = (day, min) => Date.parse(`${day}T00:00:00+05:30`) + min * 60000;

/** CE = round down to the strike step, PE = round up (same strike when exactly on one). */
export function strikesForLevel(level, step = OPTIONS_ARCHIVE.strikeStep) {
  return { ce: Math.floor(level / step) * step, pe: Math.ceil(level / step) * step };
}

/** NIFTY options from Kite's instrument list, as { token, symbol, expiry, strike, type, lotSize }. */
export function niftyOptions(instruments, underlying = OPTIONS_ARCHIVE.underlying) {
  return (instruments || [])
    .filter((i) => i.exchange === 'NFO' && i.name === underlying && (i.instrument_type === 'CE' || i.instrument_type === 'PE'))
    .map((i) => ({
      token: Number(i.instrument_token), symbol: i.tradingsymbol, expiry: isoDay(i.expiry),
      strike: Number(i.strike), type: i.instrument_type, lotSize: Number(i.lot_size) || null,
    }));
}

/** Days (YYYY-MM-DD) that have GIFT NIFTY candles inside trading hours. */
export function sessionDays(bars, cfg = OPTIONS_ARCHIVE) {
  const days = new Set();
  for (const b of bars) {
    const m = istMin(b.ts);
    if (m >= cfg.sessionStartMin && m < cfg.sessionEndMin) days.add(istDay(b.ts));
  }
  return [...days].sort();
}

/**
 * One row per (level, trading day): the levels from the strategy's setups and
 * the sessions each one applies to.
 */
export function levelDays(setups, sessions, cfg = OPTIONS_ARCHIVE) {
  const ordered = [...setups].sort((a, b) => a.crossTs - b.crossTs);
  const out = [];
  ordered.forEach((s, k) => {
    if (!Number.isFinite(s.touch) || !s.touchTs) return;
    const until = ordered[k + 1]?.crossTs ?? Infinity;
    let days = sessions.filter((d) => s.touchTs < at(d, cfg.sessionEndMin) && until > at(d, cfg.sessionStartMin));
    if (!days.length) {
      const next = sessions.find((d) => at(d, cfg.sessionStartMin) >= s.touchTs);
      if (next) days = [next];
    }
    for (const day of days) {
      out.push({ crossTs: s.crossTs, side: s.side, level: s.touch, touchTs: s.touchTs, until: Number.isFinite(until) ? until : null, day });
    }
  });
  return out;
}

/** Attach expiry and CE/PE contracts to each level-day. */
export function pickContracts(rows, options, cfg = OPTIONS_ARCHIVE) {
  const expiries = [...new Set(options.map((o) => o.expiry))].sort();
  const find = (expiry, strike, type) => options.find((o) => o.expiry === expiry && o.strike === strike && o.type === type) || null;
  return rows.map((r) => {
    // A week runs Wednesday → Tuesday, so the day's expiry is at most 6 days away.
    // A later one means that week's expiry has already gone from Kite's list.
    const next = expiries.find((e) => e >= r.day);
    const expiry = next && (Date.parse(next) - Date.parse(r.day)) / 86400000 <= 6 ? next : null;
    const { ce, pe } = strikesForLevel(r.level, cfg.strikeStep);
    return { ...r, expiry, ceStrike: ce, peStrike: pe, ceContract: expiry && find(expiry, ce, 'CE'), peContract: expiry && find(expiry, pe, 'PE') };
  });
}

/** True when a run is due: after the close, not yet run today. */
export function archiveDue(db, now = Date.now(), cfg = OPTIONS_ARCHIVE) {
  const last = getMeta(db, LAST_RUN_KEY);
  return istMin(now) >= cfg.runAfterMinIST && last?.day !== todayIST(now);
}

/**
 * Save the level strikes for the last `lookbackDays`.
 * @param {function} fetchHistorical (token, interval, from, to) => Promise<candles>
 */
export async function runOptionsArchive(db, fetchHistorical, instruments, { now = Date.now(), cfg = OPTIONS_ARCHIVE, log = () => {} } = {}) {
  const started = Date.now();
  const today = todayIST(now);
  const back = (n) => toInputDate(addDays(new Date(`${today}T00:00:00`), -n));
  const options = niftyOptions(instruments, cfg.underlying);
  if (!options.length) throw new Error('No NIFTY options in the instrument list');

  // Levels come from the GIFT NIFTY Cross Pullback (15m, HMA 50 / HMA 130).
  const { config } = normalizeConfig(DEFAULT_CROSS_CONFIG);
  const source = { token: config.instrument.token, interval: config.timeframe, from: back(cfg.historyDays), to: today };
  await ensureCandles(db, fetchHistorical, { ...source, now });
  const result = runCrossPullback({ candles: getCandles(db, source), from: back(cfg.lookbackDays + 30), to: today, config });
  const since = back(cfg.lookbackDays - 1);
  const rows = pickContracts(levelDays(result.setups, sessionDays(result.bars, cfg), cfg), options, cfg).filter((r) => r.day >= since);

  const saveContract = db.prepare(`INSERT INTO option_contracts (instrument_token, tradingsymbol, underlying, expiry, strike, type, lot_size, first_saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(instrument_token) DO NOTHING`);
  const saveLevel = db.prepare(`INSERT INTO option_levels (cross_ts, day, side, level, touch_ts, until_ts, expiry, ce_strike, pe_strike, ce_token, pe_token, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cross_ts, day) DO UPDATE SET until_ts = excluded.until_ts, expiry = COALESCE(excluded.expiry, option_levels.expiry),
      ce_token = COALESCE(excluded.ce_token, option_levels.ce_token), pe_token = COALESCE(excluded.pe_token, option_levels.pe_token)`);

  // contract token -> days to save
  const wanted = new Map();
  const missing = [];
  for (const r of rows) {
    saveLevel.run(r.crossTs, r.day, r.side, r.level, r.touchTs, r.until, r.expiry, r.ceStrike, r.peStrike, r.ceContract?.token ?? null, r.peContract?.token ?? null, Date.now());
    for (const [c, strike, type] of [[r.ceContract, r.ceStrike, 'CE'], [r.peContract, r.peStrike, 'PE']]) {
      if (!c) { missing.push(`${r.day} ${strike} ${type}`); continue; }
      const w = wanted.get(c.token) || { contract: c, days: new Set() };
      w.days.add(r.day);
      wanted.set(c.token, w);
    }
  }

  let requests = 0, failed = 0;
  for (const { contract: c, days } of wanted.values()) {
    saveContract.run(c.token, c.symbol, cfg.underlying, c.expiry, c.strike, c.type, c.lotSize, Date.now());
    for (const day of [...days].sort()) {
      try {
        requests += (await ensureCandles(db, fetchHistorical, { token: c.token, interval: cfg.interval, from: day, to: day, now })).requests;
      } catch (e) {
        failed += 1;
        log(`[OPTIONS] ${c.symbol} ${day}: ${e.message}`);
      }
    }
  }
  if (missing.length) log(`[OPTIONS] Not in Kite's list (expired or no such strike): ${missing.join(', ')}`);

  const summary = {
    day: today, at: now, since,
    levels: [...new Set(rows.map((r) => r.crossTs))].length,
    contracts: wanted.size, requests, failed, missing: missing.length,
    tookSec: Math.round((Date.now() - started) / 1000),
  };
  if (!failed) setMeta(db, LAST_RUN_KEY, summary); // a failed run is retried on the next check
  return summary;
}

/** For /api/health and the levels list: what has been saved. */
export function archiveStatus(db, cfg = OPTIONS_ARCHIVE) {
  const contracts = db.prepare('SELECT COUNT(*) n FROM option_contracts').get().n;
  const candles = db.prepare('SELECT COUNT(*) n FROM candles WHERE interval = ? AND instrument_token IN (SELECT instrument_token FROM option_contracts)').get(cfg.interval).n;
  const last = getMeta(db, LAST_RUN_KEY);
  return {
    contracts, candles,
    lastRun: last && { day: last.day, levels: last.levels, contracts: last.contracts, missing: last.missing, tookSec: last.tookSec },
  };
}

/** Saved levels with their strikes, newest first. */
export function listLevels(db, { limit = 50 } = {}) {
  return db.prepare(`SELECT l.day, l.side, l.level, l.touch_ts, l.cross_ts, l.until_ts, l.expiry,
      l.ce_strike, l.pe_strike, ce.tradingsymbol AS ce_symbol, pe.tradingsymbol AS pe_symbol
    FROM option_levels l
    LEFT JOIN option_contracts ce ON ce.instrument_token = l.ce_token
    LEFT JOIN option_contracts pe ON pe.instrument_token = l.pe_token
    ORDER BY l.day DESC, l.touch_ts DESC LIMIT ?`).all(limit);
}

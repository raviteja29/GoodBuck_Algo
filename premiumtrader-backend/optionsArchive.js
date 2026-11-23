// Options archive: saves NIFTY option candles while the contracts are still
// live, because Kite stops serving a contract's data once it has expired.
//
// Each run, for every trading day in the last LOOKBACK_DAYS:
//   - read NIFTY 50's low/high for that day,
//   - pick strikes from (low - 15 strikes) to (high + 15 strikes), 50 apart,
//   - for the nearest two expiries on or after that day, CE and PE,
// then fetch and store those contracts' candles (with OI) for those days.
// Candles go in the shared `candles` table; contract details in `option_contracts`.
// Days already complete are never fetched again, so a missed day is filled
// in on the next run as long as the contract hasn't expired.

import { ensureCandles, daysBetween, todayIST } from './candles.js';
import { getMeta, setMeta } from './db/index.js';
import { addDays, toInputDate } from './strategy/session.js';

export const OPTIONS_ARCHIVE = {
  underlying: 'NIFTY',
  indexToken: 256265, // NSE: NIFTY 50
  strikeStep: 50,
  strikesEachSide: 15, // ±750 points beyond the day's range
  expiries: 2,         // current + next
  interval: '5minute',
  lookbackDays: 10,
  runAfterMinIST: 15 * 60 + 40, // 15:40 IST, after the close
};

const LAST_RUN_KEY = 'options_archive_last_run';
const IST_OFFSET_MS = 330 * 60000;
const isoDay = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

/** NIFTY options from Kite's instrument list, as { token, symbol, expiry, strike, type, lotSize }. */
export function niftyOptions(instruments, underlying = OPTIONS_ARCHIVE.underlying) {
  return (instruments || [])
    .filter((i) => i.exchange === 'NFO' && i.name === underlying && (i.instrument_type === 'CE' || i.instrument_type === 'PE'))
    .map((i) => ({
      token: Number(i.instrument_token), symbol: i.tradingsymbol, expiry: isoDay(i.expiry),
      strike: Number(i.strike), type: i.instrument_type, lotSize: Number(i.lot_size) || null,
    }));
}

/** Which contracts to save on `day`, given NIFTY's low/high that day. */
export function contractsForDay(options, day, low, high, cfg = OPTIONS_ARCHIVE) {
  const pad = cfg.strikeStep * cfg.strikesEachSide;
  const lo = Math.floor((low - pad) / cfg.strikeStep) * cfg.strikeStep;
  const hi = Math.ceil((high + pad) / cfg.strikeStep) * cfg.strikeStep;
  const expiries = [...new Set(options.map((o) => o.expiry).filter((e) => e >= day))].sort().slice(0, cfg.expiries);
  return options.filter((o) => expiries.includes(o.expiry) && o.strike >= lo && o.strike <= hi);
}

/** True when a run is due: logged in, after the close, not yet run today. */
export function archiveDue(db, now = Date.now(), cfg = OPTIONS_ARCHIVE) {
  const ist = new Date(now + IST_OFFSET_MS);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const last = getMeta(db, LAST_RUN_KEY);
  return minutes >= cfg.runAfterMinIST && last?.day !== todayIST(now);
}

/**
 * Save option candles for the last `lookbackDays`.
 * @param {function} fetchHistorical (token, interval, from, to) => Promise<candles> (with oi)
 */
export async function runOptionsArchive(db, fetchHistorical, instruments, { now = Date.now(), cfg = OPTIONS_ARCHIVE, log = () => {} } = {}) {
  const started = Date.now();
  const to = todayIST(now);
  const from = toInputDate(addDays(new Date(`${to}T00:00:00`), -(cfg.lookbackDays - 1)));
  const options = niftyOptions(instruments, cfg.underlying);
  if (!options.length) throw new Error('No NIFTY options in the instrument list');

  // NIFTY 50 itself, so each day's range picks the strikes (and is kept too).
  await ensureCandles(db, fetchHistorical, { token: cfg.indexToken, interval: cfg.interval, from, to, now });
  const dayRange = db.prepare(`SELECT MIN(low) lo, MAX(high) hi, COUNT(*) n FROM candles
    WHERE instrument_token = ? AND interval = ? AND ts BETWEEN ? AND ?`);

  const wanted = new Map(); // token -> { contract, from, to }
  const tradingDays = [];
  for (const day of daysBetween(from, to)) {
    const r = dayRange.get(cfg.indexToken, cfg.interval, Date.parse(`${day}T00:00:00+05:30`), Date.parse(`${day}T23:59:59.999+05:30`));
    if (!r?.n) continue; // weekend / holiday
    tradingDays.push(day);
    for (const c of contractsForDay(options, day, r.lo, r.hi, cfg)) {
      const w = wanted.get(c.token);
      if (w) w.to = day; else wanted.set(c.token, { contract: c, from: day, to: day });
    }
  }

  const saveContract = db.prepare(`INSERT INTO option_contracts (instrument_token, tradingsymbol, underlying, expiry, strike, type, lot_size, first_saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(instrument_token) DO NOTHING`);
  let requests = 0, failed = 0;
  for (const { contract: c, from: f, to: t } of wanted.values()) {
    saveContract.run(c.token, c.symbol, cfg.underlying, c.expiry, c.strike, c.type, c.lotSize, Date.now());
    try {
      requests += (await ensureCandles(db, fetchHistorical, { token: c.token, interval: cfg.interval, from: f, to: t, now })).requests;
    } catch (e) {
      failed += 1;
      log(`[OPTIONS] ${c.symbol}: ${e.message}`);
    }
  }

  const summary = {
    day: to, at: now, from, to, tradingDays, contracts: wanted.size, requests, failed,
    expiries: [...new Set([...wanted.values()].map((w) => w.contract.expiry))].sort(),
    tookSec: Math.round((Date.now() - started) / 1000),
  };
  if (!failed) setMeta(db, LAST_RUN_KEY, summary); // a failed run is retried on the next check
  return summary;
}

/** Counts for /api/health: contracts and candles saved, and the last run. */
export function archiveStatus(db, cfg = OPTIONS_ARCHIVE) {
  const contracts = db.prepare('SELECT COUNT(*) n, MIN(expiry) first, MAX(expiry) last FROM option_contracts').get();
  const candles = db.prepare(`SELECT COUNT(*) n FROM candles WHERE interval = ? AND instrument_token IN (SELECT instrument_token FROM option_contracts)`).get(cfg.interval);
  const last = getMeta(db, LAST_RUN_KEY);
  return {
    contracts: contracts.n, expiries: contracts.n ? [contracts.first, contracts.last] : [], candles: candles.n,
    lastRun: last && { day: last.day, contracts: last.contracts, expiries: last.expiries, tradingDays: last.tradingDays, tookSec: last.tookSec },
  };
}

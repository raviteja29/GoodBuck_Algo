// Candle cache: every (instrument, interval, IST day) is fetched from Kite once
// and kept in SQLite. Today (and future days) are never marked complete, so
// they're refetched until the day is over.

import { addDays, toInputDate } from './strategy/session.js';

// Kite's maximum days per historical request, by interval.
const MAX_DAYS_PER_REQUEST = {
  minute: 60, '3minute': 100, '5minute': 100, '10minute': 100,
  '15minute': 200, '30minute': 200, '60minute': 400, day: 2000,
};

// Kite allows 3 historical requests/second; stay safely under it.
const REQUEST_GAP_MS = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const IST_OFFSET_MS = 330 * 60000;
/** Today's date in IST as YYYY-MM-DD. */
export const todayIST = (now = Date.now()) => new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);

/** YYYY-MM-DD strings from `from` to `to` inclusive (calendar days). */
export function daysBetween(from, to) {
  const out = [];
  for (let d = new Date(`${from}T00:00:00`); toInputDate(d) <= to; d = addDays(d, 1)) out.push(toInputDate(d));
  return out;
}

/** Group sorted day strings into contiguous runs of at most `maxLen` days. */
export function toRanges(days, maxLen) {
  const ranges = [];
  for (const day of days) {
    const cur = ranges[ranges.length - 1];
    const next = cur && toInputDate(addDays(new Date(`${cur.to}T00:00:00`), 1));
    if (cur && next === day && daysBetween(cur.from, day).length <= maxLen) cur.to = day;
    else ranges.push({ from: day, to: day });
  }
  return ranges;
}

/**
 * Make sure every day in [from, to] is cached, fetching only what's missing.
 * @param {object} db
 * @param {function} fetchHistorical (token, interval, fromStr, toStr) => Promise<Array<{date, open, high, low, close, volume, oi}>>
 * @returns {Promise<{fetchedDays:number, requests:number}>}
 */
export async function ensureCandles(db, fetchHistorical, { token, interval, from, to, onProgress, now = Date.now() }) {
  const today = todayIST(now);
  const wanted = daysBetween(from, to).filter((d) => d <= today);
  const have = new Set(
    db.prepare('SELECT day FROM candle_days WHERE instrument_token = ? AND interval = ? AND complete = 1 AND day BETWEEN ? AND ?')
      .all(token, interval, from, to).map((r) => r.day),
  );
  const missing = wanted.filter((d) => !have.has(d));
  if (!missing.length) return { fetchedDays: 0, requests: 0 };

  const ranges = toRanges(missing, MAX_DAYS_PER_REQUEST[interval] || 60);
  const insertCandle = db.prepare(`INSERT INTO candles (instrument_token, interval, ts, open, high, low, close, volume, oi)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(instrument_token, interval, ts) DO UPDATE SET open = excluded.open, high = excluded.high,
      low = excluded.low, close = excluded.close, volume = excluded.volume, oi = excluded.oi`);
  const markDay = db.prepare(`INSERT INTO candle_days (instrument_token, interval, day, complete, fetched_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(instrument_token, interval, day) DO UPDATE SET complete = excluded.complete, fetched_at = excluded.fetched_at`);

  let requests = 0;
  for (const [i, range] of ranges.entries()) {
    if (i > 0) await sleep(REQUEST_GAP_MS);
    onProgress?.({ step: i + 1, of: ranges.length, from: range.from, to: range.to });
    const rows = await fetchHistorical(token, interval, `${range.from} 00:00:00`, `${range.to} 23:59:59`);
    requests += 1;
    db.exec('BEGIN');
    try {
      for (const c of rows || []) {
        const ts = new Date(c.date).getTime();
        if (!Number.isFinite(ts)) continue;
        insertCandle.run(token, interval, ts, +c.open, +c.high, +c.low, +c.close, c.volume == null ? null : +c.volume, c.oi == null ? null : +c.oi);
      }
      const fetchedAt = Date.now();
      for (const day of daysBetween(range.from, range.to)) markDay.run(token, interval, day, day < today ? 1 : 0, fetchedAt);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return { fetchedDays: missing.length, requests };
}

/** Cached candles for [from, to] (IST days), oldest first, as engine-ready objects. */
export function getCandles(db, { token, interval, from, to }) {
  const fromMs = Date.parse(`${from}T00:00:00+05:30`);
  const toMs = Date.parse(`${to}T23:59:59.999+05:30`);
  return db.prepare('SELECT ts, open, high, low, close, volume FROM candles WHERE instrument_token = ? AND interval = ? AND ts BETWEEN ? AND ? ORDER BY ts')
    .all(token, interval, fromMs, toMs)
    .map((r) => ({ time: r.ts, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume ?? 0 }));
}

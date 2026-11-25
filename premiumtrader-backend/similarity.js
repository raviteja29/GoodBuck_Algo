// "Similar weeks": a chosen range of complete days of GIFT NIFTY (1–14 days;
// by default the last 7) compared with every earlier stretch of the same length
// that starts on the same weekday (e.g. Wed 18 – Tue 24 Nov vs past Wed–Tue weeks).
//
// A day runs 06:00 → 06:00 IST, so it includes that day's GIFT NIFTY night
// session, and a day counts as complete from 06:00 the next morning.
//
// Each stretch becomes an hourly path of % moves from its first price, so the
// index level doesn't matter. Alongside it goes the HMA 50 vs HMA 130 gap (as %
// of price), which says how the lines sit (crossed up / down / flat).
// Match score (0–100) = 50% shape (correlation of the paths)
//                     + 25% size of the moves (how close the % paths are)
//                     + 25% HMA lines (how close the HMA 50–130 gaps are).

import { ensureCandles, getCandles, todayIST } from './candles.js';
import { getMeta, setMeta } from './db/index.js';
import { addDays, toInputDate } from './strategy/session.js';
import { computeHMASeries } from './strategy/indicators.js';
import { DEFAULT_CROSS_CONFIG, normalizeConfig } from './strategy/config.js';

export const SIMILARITY = {
  historyYears: 3,
  bucketMin: 60,
  minHoursPerDay: 8,  // a stretch needs this many hours of candles per day of the range
  maxDays: 14,
  lowConfidenceDays: 3,
  dayStartMin: 6 * 60, // a day runs 06:00 → 06:00 IST (night session included)
  top: 3,
  rmseScale: 0.75,    // % — typical size difference that halves-ish the size score
  hmaScale: 0.25,     // % — same for the HMA gap
  optionWeeksNeeded: 8,
};

const IST_OFFSET_MS = 330 * 60000;
const WEEK_MS = 7 * 86400000;
const GIFT = DEFAULT_CROSS_CONFIG.instrument;
const HISTORY_KEY = 'gift_history_checked_day';

const DAY_MS = 86400000;
const dayAt = (day, cfg = SIMILARITY) => Date.parse(`${day}T00:00:00+05:30`) + cfg.dayStartMin * 60000;
const dayOf = (ms, cfg = SIMILARITY) => new Date(ms + IST_OFFSET_MS - cfg.dayStartMin * 60000).toISOString().slice(0, 10);

/** The last 7 complete days: 06:00 IST seven days before the latest 06:00, to that 06:00. */
export function lastWeekWindow(now, cfg = SIMILARITY) {
  const ist = now + IST_OFFSET_MS - cfg.dayStartMin * 60000;
  const end = Math.floor(ist / DAY_MS) * DAY_MS + cfg.dayStartMin * 60000 - IST_OFFSET_MS;
  return { start: end - WEEK_MS, end };
}

/** From / To days (YYYY-MM-DD) → { start, end } in ms, or { error }. Defaults to the last 7 complete days. */
export function rangeWindow({ from, to, now = Date.now(), cfg = SIMILARITY } = {}) {
  const last = lastWeekWindow(now, cfg);
  const lastDay = dayOf(last.end - 1, cfg);
  if (!from && !to) return { ...last, from: dayOf(last.start, cfg), to: lastDay, lastDay };
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from || '') || !re.test(to || '')) return { error: 'From and To must be dates (YYYY-MM-DD)', lastDay };
  const start = dayAt(from, cfg), end = dayAt(to, cfg) + DAY_MS;
  const days = Math.round((end - start) / DAY_MS);
  if (days < 1) return { error: 'To must be on or after From', lastDay };
  if (days > cfg.maxDays) return { error: `Pick at most ${cfg.maxDays} days`, lastDay };
  if (end > last.end) return { error: `Only complete days can be matched; the latest is ${lastDay}`, lastDay };
  return { start, end, from, to, lastDay };
}

/** Download up to 3 years of GIFT NIFTY 15m candles (once a day; only missing days are fetched). */
export async function ensureGiftHistory(db, fetchHistorical, { now = Date.now(), cfg = SIMILARITY } = {}) {
  const today = todayIST(now);
  if (getMeta(db, HISTORY_KEY) === today) return { requests: 0 };
  const from = toInputDate(addDays(new Date(`${today}T00:00:00`), -Math.round(cfg.historyYears * 365)));
  const r = await ensureCandles(db, fetchHistorical, { token: GIFT.token, interval: DEFAULT_CROSS_CONFIG.timeframe, from, to: today, now });
  setMeta(db, HISTORY_KEY, today);
  return r;
}

/** Bars in [start, start + lenMs) as hourly buckets: { pct, gap, close, ts } (last value in each hour). bars sorted by ts. */
export function buildStretch(bars, hmaFast, hmaSlow, start, lenMs, cfg = SIMILARITY) {
  let lo = 0, hi = bars.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (bars[mid].ts < start) lo = mid + 1; else hi = mid; }
  const w = { start, open: null, buckets: [] };
  for (let i = lo; i < bars.length && bars[i].ts < start + lenMs; i++) {
    const b = bars[i];
    if (w.open == null) w.open = b.open;
    const k = Math.floor((b.ts - start) / (cfg.bucketMin * 60000));
    const gap = Number.isFinite(hmaFast[i]) && Number.isFinite(hmaSlow[i]) ? ((hmaFast[i] - hmaSlow[i]) / b.close) * 100 : null;
    w.buckets[k] = { pct: ((b.close - w.open) / w.open) * 100, gap, close: b.close, ts: b.ts };
  }
  return w;
}

function pearson(x, y) {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Score one past week against the current one over the hours both have. */
export function scoreWeek(cur, past, upTo, cfg = SIMILARITY) {
  const a = [], b = [], ga = [], gb = [];
  for (let k = 0; k <= upTo; k++) {
    const x = cur.buckets[k], y = past.buckets[k];
    if (!x || !y) continue;
    a.push(x.pct); b.push(y.pct);
    if (x.gap != null && y.gap != null) { ga.push(x.gap); gb.push(y.gap); }
  }
  if (a.length < (cfg.minBuckets ?? 6)) return null;
  const corr = pearson(a, b);
  const rmse = Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);
  const hmaMad = ga.length ? ga.reduce((s, v, i) => s + Math.abs(v - gb[i]), 0) / ga.length : null;
  const shape = Math.max(0, corr);
  const size = Math.exp(-rmse / cfg.rmseScale);
  const hma = hmaMad == null ? 0 : Math.exp(-hmaMad / cfg.hmaScale);
  return {
    score: Math.round(100 * (0.5 * shape + 0.25 * size + 0.25 * hma)),
    parts: { shape: Math.round(shape * 100), size: Math.round(size * 100), hma: Math.round(hma * 100) },
    corr: Math.round(corr * 100) / 100, rmse: Math.round(rmse * 100) / 100, hmaMad: hmaMad == null ? null : Math.round(hmaMad * 100) / 100,
    hours: a.length,
  };
}

let cache = { key: null, value: null };
const pathOf = (w) => w.buckets.map((x, k) => (x ? [k, Math.round(x.pct * 1000) / 1000] : null)).filter(Boolean);

/**
 * The chosen days (default: the last 7 complete days) vs every earlier stretch
 * of the same length starting on the same weekday; best `top` matches.
 */
export function similarWeeks(db, { now = Date.now(), from = null, to = null, cfg = SIMILARITY } = {}) {
  const win = rangeWindow({ from, to, now, cfg });
  if (win.error) return { status: 'invalid', error: win.error, lastDay: win.lastDay, matches: [] };
  const { start, end } = win;
  const lenMs = end - start;
  const days = Math.round(lenMs / DAY_MS);
  const base = { weekStart: start, weekEnd: end - 1, from: win.from, to: win.to, days, lastDay: win.lastDay, lowConfidence: days < cfg.lowConfidenceDays };
  const today = todayIST(now);
  const histFrom = toInputDate(addDays(new Date(`${today}T00:00:00`), -Math.round(cfg.historyYears * 365)));
  const bars = getCandles(db, { token: GIFT.token, interval: DEFAULT_CROSS_CONFIG.timeframe, from: histFrom, to: today })
    .filter((c) => c.time + 15 * 60000 <= now && c.time < end)
    .map((c) => ({ ts: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
  if (!bars.length) return { status: 'no-data', ...base, matches: [] };
  const cacheKey = `${bars.length}:${bars.at(-1).ts}:${start}:${end}`;
  if (cache.key === cacheKey) return cache.value;

  // HMAs use everything up to the range's end; nothing after it is matched.
  const { config } = normalizeConfig(DEFAULT_CROSS_CONFIG);
  const fast = computeHMASeries(bars, config.trend.fastPeriod);
  const slow = computeHMASeries(bars, config.trend.slowPeriod);
  const minBuckets = Math.max(6, days * cfg.minHoursPerDay);
  const c = { ...cfg, minBuckets };
  const cur = buildStretch(bars, fast, slow, start, lenMs, c);
  const filled = cur.buckets.filter(Boolean).length;
  let value;
  if (filled < minBuckets) {
    value = { status: 'too-early', ...base, hoursSoFar: filled, hoursNeeded: minBuckets, matches: [], weeksCompared: 0 };
  } else {
    const upTo = lenMs / (cfg.bucketMin * 60000) - 1;
    const scored = [];
    // Earlier stretches a whole number of weeks back (same weekday), ending before the range starts.
    for (let s = start - Math.ceil(lenMs / WEEK_MS) * WEEK_MS; s >= bars[0].ts - WEEK_MS; s -= WEEK_MS) {
      const w = buildStretch(bars, fast, slow, s, lenMs, c);
      if (w.buckets.filter(Boolean).length < minBuckets) continue;
      const sc = scoreWeek(cur, w, upTo, c);
      if (sc) scored.push({ w, s: sc });
    }
    scored.sort((x, y) => y.s.score - x.s.score);
    value = {
      status: 'ok', ...base, hours: filled, weeksCompared: scored.length, historyFrom: bars[0].ts,
      current: pathOf(cur),
      matches: scored.slice(0, cfg.top).map(({ w, s }) => ({ weekStart: w.start, weekEnd: w.start + lenMs - 1, ...s, path: pathOf(w) })),
    };
  }
  cache = { key: cacheKey, value };
  return value;
}

/** Options similarity needs several weeks of saved option history first. */
export function optionSimilarityStatus(db, cfg = SIMILARITY) {
  const weeks = db.prepare(`SELECT COUNT(DISTINCT oc.expiry) AS n FROM option_contracts oc
    WHERE EXISTS (SELECT 1 FROM candle_days d WHERE d.instrument_token = oc.instrument_token AND d.interval = '15minute')`).get().n;
  return { status: weeks >= cfg.optionWeeksNeeded ? 'ready' : 'collecting', weeksSaved: weeks, weeksNeeded: cfg.optionWeeksNeeded };
}

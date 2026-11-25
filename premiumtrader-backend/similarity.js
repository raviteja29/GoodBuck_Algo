// "Similar weeks": the last 7 complete days of GIFT NIFTY compared with every
// earlier 7-day stretch that starts on the same weekday.
//
// On Wed 25 Nov it matches Wed 18 – Tue 24 Nov; on Thu 26 Nov, Thu 19 – Wed 25
// Nov; and so on. A day runs 06:00 → 06:00 IST, so it includes that day's GIFT
// NIFTY night session, and a day counts as complete from 06:00 the next morning.
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
  minBuckets: 30,     // hours of candles a stretch needs to be compared
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

/** Start (epoch ms) of the last 7 complete days: 06:00 IST seven days before the latest 06:00. */
export function lastWeekWindow(now, cfg = SIMILARITY) {
  const ist = now + IST_OFFSET_MS - cfg.dayStartMin * 60000;
  const end = Math.floor(ist / 86400000) * 86400000 + cfg.dayStartMin * 60000 - IST_OFFSET_MS;
  return { start: end - WEEK_MS, end };
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

/** Bars grouped into 7-day stretches aligned to `anchor`, each as hourly buckets: { pct, gap, close, ts } (last value in each hour). */
export function buildWeeks(bars, hmaFast, hmaSlow, anchor, cfg = SIMILARITY) {
  const weeks = new Map();
  bars.forEach((b, i) => {
    const ws = anchor + Math.floor((b.ts - anchor) / WEEK_MS) * WEEK_MS;
    let w = weeks.get(ws);
    if (!w) { w = { start: ws, open: b.open, buckets: [] }; weeks.set(ws, w); }
    const k = Math.floor((b.ts - ws) / (cfg.bucketMin * 60000));
    const gap = Number.isFinite(hmaFast[i]) && Number.isFinite(hmaSlow[i]) ? ((hmaFast[i] - hmaSlow[i]) / b.close) * 100 : null;
    w.buckets[k] = { pct: ((b.close - w.open) / w.open) * 100, gap, close: b.close, ts: b.ts };
  });
  return [...weeks.values()].sort((a, b) => a.start - b.start);
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
  if (a.length < cfg.minBuckets) return null;
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

/** The last 7 complete days vs every earlier 7-day stretch starting on the same weekday; best `top` matches. */
export function similarWeeks(db, { now = Date.now(), cfg = SIMILARITY } = {}) {
  const today = todayIST(now);
  const from = toInputDate(addDays(new Date(`${today}T00:00:00`), -Math.round(cfg.historyYears * 365)));
  const { start, end } = lastWeekWindow(now, cfg);
  const bars = getCandles(db, { token: GIFT.token, interval: DEFAULT_CROSS_CONFIG.timeframe, from, to: today })
    .filter((c) => c.time + 15 * 60000 <= now)
    .map((c) => ({ ts: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
  const base = { weekStart: start, weekEnd: end - 1 };
  if (!bars.length) return { status: 'no-data', ...base, matches: [] };
  const cacheKey = `${bars.length}:${bars.at(-1).ts}:${start}`;
  if (cache.key === cacheKey) return cache.value;

  const { config } = normalizeConfig(DEFAULT_CROSS_CONFIG);
  const fast = computeHMASeries(bars, config.trend.fastPeriod);
  const slow = computeHMASeries(bars, config.trend.slowPeriod);
  // HMAs use everything up to the window's end; nothing after it is matched.
  const keep = bars.map((b, i) => i).filter((i) => bars[i].ts < end);
  const weeks = buildWeeks(keep.map((i) => bars[i]), keep.map((i) => fast[i]), keep.map((i) => slow[i]), start, cfg);
  const cur = weeks.find((w) => w.start === start);
  const filled = cur ? cur.buckets.filter(Boolean).length : 0;
  let value;
  if (filled < cfg.minBuckets) {
    value = { status: 'too-early', ...base, hoursSoFar: filled, hoursNeeded: cfg.minBuckets, matches: [], weeksCompared: 0 };
  } else {
    const upTo = WEEK_MS / (cfg.bucketMin * 60000) - 1;
    const scored = [];
    for (const w of weeks) {
      if (w.start >= start || w.buckets.filter(Boolean).length < cfg.minBuckets) continue;
      const s = scoreWeek(cur, w, upTo, cfg);
      if (s) scored.push({ w, s });
    }
    scored.sort((x, y) => y.s.score - x.s.score);
    value = {
      status: 'ok', ...base, hours: filled, weeksCompared: scored.length, historyFrom: bars[0].ts,
      current: pathOf(cur),
      matches: scored.slice(0, cfg.top).map(({ w, s }) => ({ weekStart: w.start, weekEnd: w.start + WEEK_MS - 1, ...s, path: pathOf(w) })),
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

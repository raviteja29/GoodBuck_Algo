// "Similar weeks": compares the current Wednesday → Tuesday week of GIFT NIFTY
// with every past week, up to the same point in the week.
//
// Each week becomes an hourly path of % moves from that week's first price, so
// the index level doesn't matter. Alongside it goes the HMA 50 vs HMA 130 gap
// (as % of price), which says how the lines sit (crossed up / down / flat).
// Match score (0–100) = 50% shape (correlation of the paths)
//                     + 25% size of the moves (how close the % paths are)
//                     + 25% HMA lines (how close the HMA 50–130 gaps are).
// For each of the best matches it reports what that week did afterwards.

import { ensureCandles, getCandles, todayIST } from './candles.js';
import { getMeta, setMeta } from './db/index.js';
import { addDays, toInputDate } from './strategy/session.js';
import { computeHMASeries } from './strategy/indicators.js';
import { runCrossPullback } from './strategy/rules/crossPullback.js';
import { DEFAULT_CROSS_CONFIG, normalizeConfig } from './strategy/config.js';

export const SIMILARITY = {
  historyYears: 3,
  bucketMin: 60,
  minBuckets: 6,      // this much of the current week before matching
  top: 3,
  rmseScale: 0.75,    // % — typical size difference that halves-ish the size score
  hmaScale: 0.25,     // % — same for the HMA gap
  optionWeeksNeeded: 8,
};

const IST_OFFSET_MS = 330 * 60000;
const WEEK_MS = 7 * 86400000;
const GIFT = DEFAULT_CROSS_CONFIG.instrument;
const HISTORY_KEY = 'gift_history_checked_day';

/** Epoch ms of 00:00 IST on the Wednesday that starts the week containing `ms`. */
export function weekStartMs(ms) {
  const ist = ms + IST_OFFSET_MS;
  const dayStart = Math.floor(ist / 86400000) * 86400000;
  const back = (new Date(dayStart).getUTCDay() - 3 + 7) % 7;
  return dayStart - back * 86400000 - IST_OFFSET_MS;
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

/** Bars grouped into weeks, each as hourly buckets: { pct, gap, close, ts } (last value in each hour). */
export function buildWeeks(bars, hmaFast, hmaSlow, cfg = SIMILARITY) {
  const weeks = new Map();
  bars.forEach((b, i) => {
    const ws = weekStartMs(b.ts);
    let w = weeks.get(ws);
    if (!w) { w = { start: ws, open: b.open, buckets: [], lastIdx: i, firstIdx: i }; weeks.set(ws, w); }
    w.lastIdx = i;
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

const inSession = (ms) => {
  const d = new Date(ms + IST_OFFSET_MS);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return m >= 555 && m < 930;
};

let cache = { key: null, value: null };

/** The current week vs every past week of GIFT NIFTY; best `top` matches with what they did next. */
export function similarWeeks(db, { now = Date.now(), cfg = SIMILARITY } = {}) {
  const today = todayIST(now);
  const from = toInputDate(addDays(new Date(`${today}T00:00:00`), -Math.round(cfg.historyYears * 365)));
  const bars = getCandles(db, { token: GIFT.token, interval: DEFAULT_CROSS_CONFIG.timeframe, from, to: today })
    .filter((c) => c.time + 15 * 60000 <= now)
    .map((c) => ({ ts: c.time, open: c.open, high: c.high, low: c.low, close: c.close }));
  if (!bars.length) return { status: 'no-data', matches: [] };
  const cacheKey = `${bars.length}:${bars.at(-1).ts}:${Math.floor(now / 900000)}`;
  if (cache.key === cacheKey) return cache.value;

  const { config } = normalizeConfig(DEFAULT_CROSS_CONFIG);
  const fast = computeHMASeries(bars, config.trend.fastPeriod);
  const slow = computeHMASeries(bars, config.trend.slowPeriod);
  const weeks = buildWeeks(bars, fast, slow, cfg);
  const cur = weeks.at(-1);
  const curStart = weekStartMs(now);
  if (cur.start !== curStart) {
    const value = { status: 'week-not-started', weekStart: curStart, matches: [], weeksCompared: 0 };
    cache = { key: cacheKey, value };
    return value;
  }
  const upTo = cur.buckets.length - 1;
  const filled = cur.buckets.filter(Boolean).length;
  if (filled < cfg.minBuckets) {
    const value = { status: 'too-early', weekStart: curStart, hoursSoFar: filled, hoursNeeded: cfg.minBuckets, matches: [], weeksCompared: 0 };
    cache = { key: cacheKey, value };
    return value;
  }

  // First touches across the whole history, for "how many touches" afterwards.
  const result = runCrossPullback({ candles: bars.map((b) => ({ time: b.ts, ...b })), from, to: today, config });
  const touches = result.setups.filter((s) => s.touchTs).map((s) => s.touchTs);

  const scored = [];
  for (const w of weeks.slice(0, -1)) {
    const s = scoreWeek(cur, w, upTo, cfg);
    if (s) scored.push({ w, s });
  }
  scored.sort((x, y) => y.s.score - x.s.score);

  const matches = scored.slice(0, cfg.top).map(({ w, s }) => {
    // Where this week was at the same point as now, and how it ended.
    let at = null;
    for (let k = upTo; k >= 0 && !at; k--) at = w.buckets[k] || null;
    const lastBucket = w.buckets.filter(Boolean).at(-1);
    const end = w.start + WEEK_MS;
    const later = touches.filter((t) => t > (at?.ts ?? w.start) && t < end);
    const points = at && lastBucket ? lastBucket.close - at.close : null;
    return {
      weekStart: w.start, weekEnd: end - 86400000,
      ...s,
      next: {
        points: points == null ? null : Math.round(points * 10) / 10,
        pct: points == null ? null : Math.round((points / at.close) * 10000) / 100,
        direction: points == null ? null : points > 0 ? 'up' : points < 0 ? 'down' : 'flat',
        touches: later.length,
        touchesInMarketHours: later.filter(inSession).length,
      },
      path: w.buckets.map((x, k) => (x ? [k, Math.round(x.pct * 1000) / 1000] : null)).filter(Boolean),
    };
  });

  const value = {
    status: 'ok', weekStart: curStart, hoursSoFar: filled, upToHour: upTo, weeksCompared: scored.length,
    historyFrom: bars[0].ts,
    current: cur.buckets.map((x, k) => (x ? [k, Math.round(x.pct * 1000) / 1000] : null)).filter(Boolean),
    matches,
  };
  cache = { key: cacheKey, value };
  return value;
}

/** Options similarity needs several weeks of saved option history first. */
export function optionSimilarityStatus(db, cfg = SIMILARITY) {
  const weeks = db.prepare(`SELECT COUNT(DISTINCT oc.expiry) AS n FROM option_contracts oc
    WHERE EXISTS (SELECT 1 FROM candle_days d WHERE d.instrument_token = oc.instrument_token AND d.interval = '15minute')`).get().n;
  return { status: weeks >= cfg.optionWeeksNeeded ? 'ready' : 'collecting', weeksSaved: weeks, weeksNeeded: cfg.optionWeeksNeeded };
}

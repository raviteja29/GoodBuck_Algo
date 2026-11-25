// "Similar weeks": a chosen range of complete days of GIFT NIFTY (up to 14
// calendar days; by default the last 7) compared with every earlier run of the
// same number of consecutive TRADING days, starting on any weekday. Wed 18 –
// Tue 24 Nov is 5 trading days (the weekend has no candles), so it's compared
// with every 5 trading days in a row: Fri–Thu, Mon–Fri, Thu–Wed, ...
//
// A day runs 06:00 → 06:00 IST, so it includes that day's GIFT NIFTY night
// session, and a day counts as complete from 06:00 the next morning.
// Stretches line up trading day by trading day and hour by hour within the day.
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

/**
 * Trading days (06:00 → 06:00 IST days that have candles), oldest first, each
 * with its first price and hourly slots { close, gap } (last value in each hour).
 */
export function dayProfiles(bars, hmaFast, hmaSlow, cfg = SIMILARITY) {
  const days = [];
  let cur = null;
  bars.forEach((b, i) => {
    const day = dayOf(b.ts, cfg);
    if (!cur || cur.day !== day) { cur = { day, start: dayAt(day, cfg), open: b.open, slots: [] }; days.push(cur); }
    const h = Math.floor((b.ts - cur.start) / (cfg.bucketMin * 60000));
    const gap = Number.isFinite(hmaFast[i]) && Number.isFinite(hmaSlow[i]) ? ((hmaFast[i] - hmaSlow[i]) / b.close) * 100 : null;
    cur.slots[h] = { close: b.close, gap };
  });
  return days;
}

/** `n` trading days from index `j` as one path: buckets[dayIndex * 24 + hour] = { pct, gap } (% from the first price). */
export function stretchOf(days, j, n, cfg = SIMILARITY) {
  const perDay = (24 * 60) / cfg.bucketMin;
  const open = days[j].open;
  const buckets = [];
  for (let d = 0; d < n; d++) {
    days[j + d].slots.forEach((x, h) => { if (x) buckets[d * perDay + h] = { pct: ((x.close - open) / open) * 100, gap: x.gap }; });
  }
  const last = days[j + n - 1];
  return { index: j, start: days[j].start, end: last.start + DAY_MS - 1, days: days.slice(j, j + n).map((x) => x.day), buckets };
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
 * The chosen days (default: the last 7 complete days) vs every earlier run of
 * the same number of consecutive trading days, on any weekday; best `top`
 * matches that don't overlap each other.
 */
export function similarWeeks(db, { now = Date.now(), from = null, to = null, cfg = SIMILARITY } = {}) {
  const win = rangeWindow({ from, to, now, cfg });
  if (win.error) return { status: 'invalid', error: win.error, lastDay: win.lastDay, matches: [] };
  const { start, end } = win;
  const base = { weekStart: start, weekEnd: end - 1, from: win.from, to: win.to, lastDay: win.lastDay };
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
  const days = dayProfiles(bars, fast, slow, cfg);
  const first = days.findIndex((d) => d.start >= start);
  const n = first < 0 ? 0 : days.length - first; // trading days in the range (bars stop at its end)
  const perDay = (24 * 60) / cfg.bucketMin;
  const minBuckets = Math.max(6, n * cfg.minHoursPerDay);
  const c = { ...cfg, minBuckets };
  let value;
  if (!n) {
    value = { status: 'too-early', ...base, tradingDays: 0, hoursSoFar: 0, hoursNeeded: minBuckets, matches: [], weeksCompared: 0 };
  } else {
    const cur = stretchOf(days, first, n, cfg);
    const filled = cur.buckets.filter(Boolean).length;
    const info = { ...base, tradingDays: n, days: cur.days, lowConfidence: n < cfg.lowConfidenceDays };
    if (filled < minBuckets) {
      value = { status: 'too-early', ...info, hoursSoFar: filled, hoursNeeded: minBuckets, matches: [], weeksCompared: 0 };
    } else {
      const upTo = n * perDay - 1;
      const scored = [];
      // Every earlier run of n trading days that ends before the range starts.
      for (let j = 0; j + n <= first; j++) {
        const w = stretchOf(days, j, n, cfg);
        if (w.buckets.filter(Boolean).length < minBuckets) continue;
        const sc = scoreWeek(cur, w, upTo, c);
        if (sc) scored.push({ w, s: sc });
      }
      scored.sort((x, y) => y.s.score - x.s.score);
      // Neighbouring runs share most of their days; keep the best of each overlap.
      const picked = [];
      for (const m of scored) {
        if (picked.length >= cfg.top) break;
        if (picked.every((p) => Math.abs(p.w.index - m.w.index) >= n)) picked.push(m);
      }
      value = {
        status: 'ok', ...info, hours: filled, weeksCompared: scored.length, historyFrom: bars[0].ts,
        current: pathOf(cur),
        matches: picked.map(({ w, s }) => ({ weekStart: w.start, weekEnd: w.end, days: w.days, ...s, path: pathOf(w) })),
      };
    }
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

// Options archive: saves the NIFTY option contracts at each Cross Pullback
// level, while they're still live (Kite stops serving a contract's data once
// it has expired).
//
// A level is a setup's first-touch price (GIFT NIFTY, 15m, HMA 50 vs HMA 130).
// It stays valid until the next cross, so it can be set on any earlier day.
// For each trading session the level is valid in (or, if it ends before one
// opens, the next session after it was set):
//   strikes = the strike just below and just above the level (only that one
//             strike when the level is exactly on it), CE and PE of each,
//   expiry  = the expiry of that day's week: normally the Tuesday on/after it,
//             or the earlier day it moved to for a holiday (then the days after
//             it belong to the next week). If it has expired, nothing can be saved.
// Each contract's 15-minute candles (with OI) are saved for its whole life:
// everything Kite has from listing, then each new day until it expires.
//
// It runs every 15 minutes while logged in, just after each GIFT NIFTY candle
// closes, so a new first touch has its contracts saved within ~15 minutes and
// they're kept current through the session (tracked). A level that's still
// active is mapped to the next session even before that session starts.
// Each run looks back LOOKBACK_DAYS for levels, so a missed day is filled in.

import { ensureCandles, getCandles, todayIST } from './candles.js';
import { getMeta, setMeta } from './db/index.js';
import { addDays, toInputDate } from './strategy/session.js';
import { runCrossPullback } from './strategy/rules/crossPullback.js';
import { DEFAULT_CROSS_CONFIG, normalizeConfig } from './strategy/config.js';

export const OPTIONS_ARCHIVE = {
  underlying: 'NIFTY',
  strikeStep: 50,
  interval: '15minute',
  fullHistoryDays: 180,          // how far back to ask Kite for a contract (it returns from listing)
  lookbackDays: 10,
  historyDays: 120,              // GIFT NIFTY history for the HMA 130 warm-up
  sessionStartMin: 9 * 60 + 15,  // 09:15 IST
  sessionEndMin: 15 * 60 + 30,   // 15:30 IST
  everyMin: 15,                  // run just after each 15-minute candle closes
  graceMin: 1,
};

const LAST_RUN_KEY = 'options_archive_last_run_v4'; // renamed whenever the saving rule changes, so the new rule runs at once
const IST_OFFSET_MS = 330 * 60000;
const isoDay = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const istDay = (ms) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
const istMin = (ms) => { const d = new Date(ms + IST_OFFSET_MS); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const at = (day, min) => Date.parse(`${day}T00:00:00+05:30`) + min * 60000;

/** The strike just below and just above the level (the same strike when it's exactly on one). */
export function strikesForLevel(level, step = OPTIONS_ARCHIVE.strikeStep) {
  return { below: Math.floor(level / step) * step, above: Math.ceil(level / step) * step };
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

/** What every row of a level carries: its price, times, validity and the GIFT NIFTY stop. */
function levelBase(ordered, k, crossTimes) {
  const s = ordered[k];
  // A level ends at the next cross of any kind (a cross the strategy ignores still ends the setup).
  const until = (crossTimes ? crossTimes.find((t) => t > s.crossTs) : ordered[k + 1]?.crossTs) ?? Infinity;
  return {
    crossTs: s.crossTs, side: s.side, level: s.touch, touchTs: s.touchTs, until: Number.isFinite(until) ? until : null,
    stretchFrom: ordered[k - 1]?.crossTs ?? null, giftStop: Number.isFinite(s.stop) ? s.stop : null,
  };
}

const touched = (s) => Number.isFinite(s.touch) && s.touchTs;

/**
 * One row per (level, trading day): the levels from the strategy's setups and
 * the sessions each one applies to.
 */
export function levelDays(setups, sessions, cfg = OPTIONS_ARCHIVE, { nextSession = null, crossTimes = null } = {}) {
  const ordered = [...setups].sort((a, b) => a.crossTs - b.crossTs);
  const out = [];
  ordered.forEach((s, k) => {
    if (!touched(s)) return;
    const base = levelBase(ordered, k, crossTimes);
    const until = base.until ?? Infinity;
    let days = sessions.filter((d) => s.touchTs < at(d, cfg.sessionEndMin) && until > at(d, cfg.sessionStartMin));
    // A level that's still valid also applies to the next session, even before it opens.
    if (nextSession && until === Infinity && !days.includes(nextSession) && s.touchTs < at(nextSession, cfg.sessionEndMin)) days.push(nextSession);
    if (!days.length) {
      const next = sessions.find((d) => at(d, cfg.sessionStartMin) >= s.touchTs);
      if (next) days = [next];
    }
    for (const day of days) out.push({ ...base, day });
  });
  return out;
}

/**
 * Carried over: at the start of each expiry week, the latest short and the
 * latest long first touch from before it (so the week opens knowing where the
 * last down-trend and up-trend triggered), with that week's strikes.
 * weeks: [{ expiry, from }] — `from` is the week's first day; rows use it as their day.
 */
export function carriedLevels(setups, weeks, { crossTimes = null } = {}) {
  const ordered = [...setups].sort((a, b) => a.crossTs - b.crossTs);
  const out = [];
  for (const w of weeks) {
    const cutoff = at(w.from, 0);
    for (const side of ['short', 'long']) {
      let best = -1;
      ordered.forEach((s, k) => {
        if (s.side === side && touched(s) && s.touchTs < cutoff && (best < 0 || s.touchTs > ordered[best].touchTs)) best = k;
      });
      if (best >= 0) out.push({ ...levelBase(ordered, best, crossTimes), day: w.from, carried: true });
    }
  }
  return out;
}

/** Times of every HMA cross in an engine result, sloped or not. */
export function crossTimesOf({ bars, series: { fast, slow } }) {
  const out = [];
  for (let i = 1; i < bars.length; i++) {
    if (![fast[i], fast[i - 1], slow[i], slow[i - 1]].every(Number.isFinite)) continue;
    if ((fast[i - 1] >= slow[i - 1] && fast[i] < slow[i]) || (fast[i - 1] <= slow[i - 1] && fast[i] > slow[i])) out.push(bars[i].ts);
  }
  return out;
}

/** Today if it's a weekday before 15:30 IST, else the next weekday (holidays aren't known here). */
export function nextSessionDay(now, cfg = OPTIONS_ARCHIVE) {
  let day = todayIST(now);
  const weekday = (d) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w >= 1 && w <= 5; };
  if (weekday(day) && istMin(now) < cfg.sessionEndMin) return day;
  do { day = toInputDate(addDays(new Date(`${day}T00:00:00`), 1)); } while (!weekday(day));
  return day;
}

const marketOpen = (now, cfg = OPTIONS_ARCHIVE) => {
  const w = new Date(now + IST_OFFSET_MS).getUTCDay();
  const m = istMin(now);
  return w >= 1 && w <= 5 && m >= cfg.sessionStartMin && m < cfg.sessionEndMin + cfg.everyMin;
};

const dayAdd = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Wednesday that starts the calendar expiry week containing `day` (YYYY-MM-DD). */
export function weekStart(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() - 3 + 7) % 7; // 3 = Wednesday
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
}

/**
 * First day of the week that ends at `expiry`: the day after the previous
 * expiry (Tue 24 Nov after the Mon 23 Nov holiday move), normally Wednesday.
 */
export function weekFrom(expiry, expiries) {
  const prev = [...expiries].filter((e) => e < expiry).sort().at(-1);
  const wed = weekStart(expiry);
  return prev ? [dayAdd(prev, 1), dayAdd(wed, -2)].sort().at(-1) : wed;
}

/**
 * The NIFTY expiry a trading day belongs to. Weekly expiry is Tuesday, moved
 * earlier when Tuesday is a holiday (e.g. Mon 23 Nov), so a day after a moved
 * expiry (Tue 24 Nov) already belongs to the next week (1 Dec).
 *   listed: expiries in Kite's current list (live)
 *   known:  every expiry we've seen, including expired ones (from saved data)
 * Returns null when that day's expiry has already expired.
 */
export function expiryForDay(day, listed, known = [], today = day) {
  let tue = day;
  while (new Date(`${tue}T00:00:00Z`).getUTCDay() !== 2) tue = dayAdd(tue, 1);
  const live = [...new Set(listed)].sort();
  const all = [...new Set([...listed, ...known])].sort();
  const thisWeek = all.filter((e) => e >= dayAdd(tue, -3) && e <= tue).at(-1);
  if (thisWeek) {
    if (thisWeek >= day) return live.includes(thisWeek) ? thisWeek : null;
    return live.find((e) => e > thisWeek && e >= day) || null; // that week's expiry was moved before this day
  }
  if (tue < today) return null; // expired and never seen
  return live.find((e) => e >= day) || null;
}

/** Attach the expiry and the contracts (CE and PE at the strikes below and above) to each level-day. */
export function pickContracts(rows, options, cfg = OPTIONS_ARCHIVE, { known = [], today = null } = {}) {
  const listed = [...new Set(options.map((o) => o.expiry))];
  const find = (expiry, strike, type) => options.find((o) => o.expiry === expiry && o.strike === strike && o.type === type) || null;
  return rows.map((r) => {
    const expiry = expiryForDay(r.day, listed, known, today || r.day);
    const { below, above } = strikesForLevel(r.level, cfg.strikeStep);
    const contracts = [...new Set([below, above])].flatMap((strike) => ['CE', 'PE'].map((type) => ({ strike, type, contract: expiry ? find(expiry, strike, type) : null })));
    return { ...r, expiry, strikeBelow: below, strikeAbove: above, contracts };
  });
}

/** Every expiry seen so far (saved contracts and levels), expired ones included. */
export function knownExpiries(db, cfg = OPTIONS_ARCHIVE) {
  return db.prepare(`SELECT expiry FROM option_contracts WHERE underlying = ? UNION SELECT expiry FROM option_levels WHERE expiry IS NOT NULL`)
    .all(cfg.underlying).map((r) => r.expiry);
}

/** True once per 15-minute block, a minute after the block's candle closes. */
export function archiveDue(db, now = Date.now(), cfg = OPTIONS_ARCHIVE) {
  const last = getMeta(db, LAST_RUN_KEY);
  const block = (t) => Math.floor((t - cfg.graceMin * 60000) / (cfg.everyMin * 60000));
  return !last?.at || block(now) > block(last.at);
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
  // Only completed candles: a forming candle could show a cross that disappears.
  const candles = getCandles(db, source).filter((c) => c.time + 15 * 60000 <= now);
  const result = runCrossPullback({ candles, from: back(cfg.lookbackDays + 30), to: today, config });
  const since = back(cfg.lookbackDays - 1);
  const nextSession = nextSessionDay(now, cfg);
  const crossTimes = crossTimesOf(result);
  const sessions = sessionDays(result.bars, cfg);
  const known = knownExpiries(db, cfg);
  const listed = [...new Set(options.map((o) => o.expiry))];
  // The expiry weeks in the lookback window (and the next session's), each with the latest short / long carried over.
  const weekExpiries = new Set([...sessions.filter((d) => d >= since), nextSession].map((d) => expiryForDay(d, listed, known, today)).filter(Boolean));
  const allExpiries = [...new Set([...listed, ...known])];
  const weeks = [...weekExpiries].map((expiry) => ({ expiry, from: weekFrom(expiry, allExpiries) }));
  const rows = pickContracts([
    // (a week's first day is kept even if it's just before the window, as stale rows on it are dropped below)
    ...levelDays(result.setups, sessions, cfg, { nextSession, crossTimes }).filter((r) => r.day >= since || weeks.some((w) => w.from === r.day)),
    ...carriedLevels(result.setups, weeks, { crossTimes }),
  ], options, cfg, { known, today });

  const saveContract = db.prepare(`INSERT INTO option_contracts (instrument_token, tradingsymbol, underlying, expiry, strike, type, lot_size, first_saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(instrument_token) DO NOTHING`);
  const saveLevel = db.prepare(`INSERT INTO option_levels (cross_ts, day, side, level, touch_ts, until_ts, expiry, strike_below, strike_above, stretch_from_ts, gift_stop, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(cross_ts, day) DO UPDATE SET until_ts = excluded.until_ts, expiry = COALESCE(excluded.expiry, option_levels.expiry),
      strike_below = excluded.strike_below, strike_above = excluded.strike_above,
      stretch_from_ts = excluded.stretch_from_ts, gift_stop = excluded.gift_stop`);
  // Rows in the window are recomputed each run; drop the ones that no longer apply (a later
  // cross ended the level, or a newer touch replaced a carried-over one).
  const dropStale = db.prepare(`DELETE FROM option_levels WHERE (day >= ? OR day IN (SELECT value FROM json_each(?)))
    AND (cross_ts || ':' || day) NOT IN (SELECT value FROM json_each(?))`);

  // Contracts to bring up to date: this run's level contracts, plus every
  // earlier level contract that hasn't expired yet (they get each new day).
  const wanted = new Map();
  const missing = [];
  for (const r of rows) {
    saveLevel.run(r.crossTs, r.day, r.side, r.level, r.touchTs, r.until, r.expiry, r.strikeBelow, r.strikeAbove, r.stretchFrom, r.giftStop, Date.now());
    if (!r.expiry) { missing.push(`${r.day} ${r.level.toFixed(1)} (week's expiry no longer listed)`); continue; }
    for (const { contract: c, strike, type } of r.contracts) {
      if (!c) missing.push(`${r.day} ${strike} ${type}`);
      else wanted.set(c.token, c);
    }
  }
  const live = new Map(options.map((o) => [o.token, o]));
  const earlier = db.prepare(`SELECT DISTINCT oc.instrument_token AS token FROM option_contracts oc
    JOIN candle_days d ON d.instrument_token = oc.instrument_token AND d.interval = ?
    WHERE oc.underlying = ? AND oc.expiry >= ?`).all(cfg.interval, cfg.underlying, today);
  for (const { token } of earlier) if (live.has(token) && !wanted.has(token)) wanted.set(token, live.get(token));

  dropStale.run(since, JSON.stringify(weeks.map((w) => w.from)), JSON.stringify(rows.map((r) => `${r.crossTs}:${r.day}`)));

  // New contracts get their whole history at once. Known ones are refreshed
  // while the market is open, and once more after the close for the final candles.
  const finalKey = 'options_final_refresh_day';
  const afterClose = !marketOpen(now, cfg) && getMeta(db, finalKey) !== today && istMin(now) >= cfg.sessionEndMin;
  const refreshLive = marketOpen(now, cfg) || afterClose;
  const hasCandles = db.prepare('SELECT 1 FROM candle_days WHERE instrument_token = ? AND interval = ? LIMIT 1');
  let requests = 0, failed = 0;
  for (const c of wanted.values()) {
    saveContract.run(c.token, c.symbol, cfg.underlying, c.expiry, c.strike, c.type, c.lotSize, Date.now());
    if (!refreshLive && hasCandles.get(c.token, cfg.interval)) continue;
    try {
      // Whole life: Kite returns candles from the day the contract was listed.
      requests += (await ensureCandles(db, fetchHistorical, { token: c.token, interval: cfg.interval, from: back(cfg.fullHistoryDays), to: today, now })).requests;
    } catch (e) {
      failed += 1;
      log(`[OPTIONS] ${c.symbol}: ${e.message}`);
    }
  }
  if (missing.length) log(`[OPTIONS] Not in Kite's list (expired or no such strike): ${missing.join(', ')}`);

  const summary = {
    day: today, at: now, since,
    levels: [...new Set(rows.map((r) => r.crossTs))].length,
    carried: rows.filter((r) => r.carried).length,
    contracts: wanted.size, requests, failed, missing: missing.length,
    tookSec: Math.round((Date.now() - started) / 1000),
  };
  if (!failed) {
    setMeta(db, LAST_RUN_KEY, summary); // a failed run is retried on the next check
    if (afterClose) setMeta(db, finalKey, today);
  }
  return summary;
}

/** For /api/health: what has been saved. */
export function archiveStatus(db, cfg = OPTIONS_ARCHIVE) {
  const contracts = db.prepare('SELECT COUNT(*) n FROM option_contracts').get().n;
  const candles = db.prepare('SELECT COUNT(*) n FROM candles WHERE instrument_token IN (SELECT instrument_token FROM option_contracts)').get().n;
  const last = getMeta(db, LAST_RUN_KEY);
  return {
    contracts, candles, interval: cfg.interval,
    lastRun: last && { day: last.day, levels: last.levels, contracts: last.contracts, missing: last.missing, tookSec: last.tookSec },
  };
}

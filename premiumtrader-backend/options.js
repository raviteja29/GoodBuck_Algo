// /api/options — the saved Cross Pullback levels with their option strikes,
// and chart data (candles + HMA 50 / HMA 130 / SMA 50) for any saved contract
// or for GIFT NIFTY itself.

import express from 'express';
import { requireSession } from './strategies.js';
import { OPTIONS_ARCHIVE, knownExpiries, weekStart, weekFrom } from './optionsArchive.js';
import { DEFAULT_CROSS_CONFIG, normalizeConfig } from './strategy/config.js';
import { runCrossPullback } from './strategy/rules/crossPullback.js';
import { getCandles, todayIST } from './candles.js';
import { computeHMASeries, computeSMASeries } from './strategy/indicators.js';
import { similarWeeks, optionSimilarityStatus } from './similarity.js';

const IST_OFFSET_MS = 330 * 60000;
const SESSION_START_MIN = 9 * 60 + 15;
const GIFT = DEFAULT_CROSS_CONFIG.instrument; // { token, symbol, exchange }
const GIFT_INTERVAL = DEFAULT_CROSS_CONFIG.timeframe; // '15minute'
const dayStart = (day) => Date.parse(`${day}T00:00:00+05:30`);
const dayEnd = (day) => Date.parse(`${day}T23:59:59.999+05:30`);

export { weekStart };

/**
 * Levels grouped into expiry weeks (Wednesday → Tuesday, moved for holidays),
 * newest first. One row per level: the first touches made in the week, plus
 * the latest short and latest long from before it ("carried over"), all with
 * that week's strikes.
 */
export function listLevelWeeks(db, { weeks = 8, cfg = OPTIONS_ARCHIVE, today = todayIST() } = {}) {
  const rows = db.prepare(`SELECT * FROM option_levels ORDER BY COALESCE(expiry, day) DESC, day, touch_ts DESC`).all();
  const known = knownExpiries(db, cfg);
  const dayAdd = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const findContract = db.prepare('SELECT instrument_token AS token, tradingsymbol AS symbol FROM option_contracts WHERE underlying = ? AND expiry = ? AND strike = ? AND type = ?');
  const coverage = db.prepare(`SELECT interval, COUNT(*) AS bars, MIN(ts) AS first, MAX(ts) AS last FROM candles
    WHERE instrument_token = ? AND interval IN ('5minute', '15minute') GROUP BY interval`);

  // Week → one row per level (its first day in the week).
  const byWeek = new Map();
  for (const r of rows) {
    const key = r.expiry ? `exp:${r.expiry}` : `wk:${weekStart(r.day)}`;
    if (!byWeek.has(key)) {
      if (byWeek.size >= weeks) break;
      byWeek.set(key, new Map());
    }
    const levels = byWeek.get(key);
    if (!levels.has(r.cross_ts)) levels.set(r.cross_ts, r);
  }

  const toLevel = (r, carried) => {
    const strikes = [...new Set([r.strike_below, r.strike_above])];
    const contracts = strikes.flatMap((strike) => ['CE', 'PE'].map((type) => {
      const c = r.expiry ? findContract.get(cfg.underlying, r.expiry, strike, type) : null;
      const cov = c ? coverage.all(c.token) : [];
      const best = cov.find((x) => x.interval === '15minute') || cov[0] || null;
      return {
        strike, type, token: c?.token ?? null, symbol: c?.symbol ?? null,
        bars: best?.bars ?? 0, interval: best?.interval ?? null, from: best?.first ?? null, to: best?.last ?? null,
      };
    }));
    const pick = (strike, type) => contracts.find((c) => c.strike === strike && c.type === type);
    return {
      day: r.day, side: r.side, level: r.level, touchTs: r.touch_ts, crossTs: r.cross_ts, untilTs: r.until_ts, expiry: r.expiry,
      carried,
      strikeBelow: r.strike_below, strikeAbove: r.strike_above, giftStop: r.gift_stop, stretchFromTs: r.stretch_from_ts,
      // The trade view: CE at the strike below the level, PE at the strike above.
      ce: optionStop(db, pick(r.strike_below, 'CE'), r),
      pe: optionStop(db, pick(r.strike_above, 'PE'), r),
      saved: contracts.filter((c) => c.bars > 0).length,
      historyFrom: contracts.reduce((m, c) => (c.from && (!m || c.from < m) ? c.from : m), null),
      contracts,
    };
  };

  return [...byWeek.entries()].map(([key, map]) => {
    const all = [...map.values()];
    const expiry = all.find((r) => r.expiry)?.expiry ?? null;
    const from = expiry ? weekFrom(expiry, known) : key.slice(3);
    const to = expiry || dayAdd(from, 6);
    const cutoff = dayStart(from);
    // Touched in this week, newest first; then the latest short and long from before it.
    const own = all.filter((r) => r.touch_ts >= cutoff).sort((a, b) => b.touch_ts - a.touch_ts);
    const before = all.filter((r) => r.touch_ts < cutoff).sort((a, b) => b.touch_ts - a.touch_ts);
    const carried = ['short', 'long'].map((side) => before.find((r) => r.side === side)).filter(Boolean).sort((a, b) => b.touch_ts - a.touch_ts);
    return {
      key, weekStart: from, weekEnd: to, expiry, current: today >= from && today <= to,
      levels: [...own.map((r) => toLevel(r, false)), ...carried.map((r) => toLevel(r, true))],
    };
  });
}

/**
 * For one contract at a level: its price at the first touch, and the stop-loss
 * = the lowest low of the option during the previous stretch (from the previous
 * cross candle to this level's cross candle, the same window as the GIFT NIFTY stop).
 */
export function optionStop(db, contract, level) {
  if (!contract?.token || !contract.interval) return contract ? { strike: contract.strike, type: contract.type, symbol: contract.symbol, entry: null, sl: null, gap: null } : null;
  const ms = contract.interval === '15minute' ? 15 * 60000 : 5 * 60000;
  const q = (sql, ...a) => db.prepare(sql).get(contract.token, contract.interval, ...a);
  // Price at the touch: the close of the candle the touch happened in; if the
  // touch was outside market hours, the open of the next candle.
  let entry = null, entryAt = null, entryBasis = null;
  const inBar = q('SELECT ts, close FROM candles WHERE instrument_token = ? AND interval = ? AND ts <= ? AND ts + ? > ? ORDER BY ts DESC LIMIT 1', level.touch_ts, ms, level.touch_ts);
  if (inBar) { entry = inBar.close; entryAt = inBar.ts; entryBasis = 'touch candle close'; }
  else {
    const next = q('SELECT ts, open FROM candles WHERE instrument_token = ? AND interval = ? AND ts >= ? ORDER BY ts LIMIT 1', level.touch_ts);
    if (next) { entry = next.open; entryAt = next.ts; entryBasis = 'next open'; }
  }
  let sl = null;
  if (level.stretch_from_ts != null) {
    const r = q('SELECT MIN(low) AS low FROM candles WHERE instrument_token = ? AND interval = ? AND ts >= ? AND ts < ?', level.stretch_from_ts, level.cross_ts + 15 * 60000);
    sl = r?.low ?? null;
  }
  const round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  return {
    strike: contract.strike, type: contract.type, symbol: contract.symbol,
    entry: round(entry), entryAt, entryBasis, sl: round(sl), gap: entry != null && sl != null ? round(entry - sl) : null,
  };
}

/**
 * Every HMA 50 / HMA 130 cross over the last `days` (completed GIFT NIFTY
 * candles). Each starts a setup; its first touch counts only once HMA 50
 * slopes the setup's way (down for a short, up for a long).
 */
export function listCrosses(db, { days = 10, now = Date.now() } = {}) {
  const { config } = normalizeConfig(DEFAULT_CROSS_CONFIG);
  const today = todayIST(now);
  const back = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
  const candles = getCandles(db, { token: GIFT.token, interval: GIFT_INTERVAL, from: back(days + 120), to: today })
    .filter((c) => c.time + 15 * 60000 <= now);
  if (!candles.length) return { crosses: [], lastCandle: null };
  const r = runCrossPullback({ candles, from: back(days + 30), to: today, config, trackAll: true });
  const { fast, slow } = r.series;
  const since = Date.parse(`${back(days - 1)}T00:00:00+05:30`);
  const setupAt = new Map(r.setups.map((s) => [s.crossTs, s]));
  const round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const out = [];
  for (let i = 1; i < r.bars.length; i++) {
    if (![fast[i], fast[i - 1], slow[i], slow[i - 1]].every(Number.isFinite)) continue;
    const bear = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
    const bull = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    if (!bear && !bull) continue;
    const b = r.bars[i];
    if (b.ts < since) continue;
    const s = setupAt.get(b.ts);
    out.push({
      ts: b.ts, side: bear ? 'short' : 'long',
      hma50: round(fast[i]), hma50Prev: round(fast[i - 1]), hma130: round(slow[i]),
      slopedAtCross: s ? s.slopedAtCross !== false : null,
      touchTs: s?.touchTs ?? null, touch: round(s?.touch), stop: round(s?.stop),
    });
  }
  return { crosses: out.reverse(), lastCandle: candles.at(-1).time };
}

/** Group bars into `minutes` buckets aligned to 09:15 IST (like NSE charts). */
export function resample(bars, minutes) {
  if (minutes <= 5) return bars;
  const out = [];
  let cur = null, curKey = null;
  for (const b of bars) {
    const ist = b.ts + IST_OFFSET_MS;
    const dayMs = Math.floor(ist / 86400000) * 86400000;
    const minOfDay = Math.floor((ist - dayMs) / 60000);
    const bucket = Math.floor((minOfDay - SESSION_START_MIN) / minutes);
    const key = `${dayMs}:${bucket}`;
    if (key !== curKey) {
      if (cur) out.push(cur);
      curKey = key;
      cur = { ts: dayMs - IST_OFFSET_MS + (SESSION_START_MIN + bucket * minutes) * 60000, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0, oi: b.oi };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume ?? 0;
      if (b.oi != null) cur.oi = b.oi;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const INTERVALS = { 5: '5minute', 15: '15minute', 30: '30minute', 60: '60minute' };

/** Candles + indicators for a saved option contract (15m when saved, else 5m) or GIFT NIFTY. */
export function chartData(db, { token, minutes = 15 }) {
  const isGift = token === GIFT.token;
  const contract = isGift ? null : db.prepare('SELECT * FROM option_contracts WHERE instrument_token = ?').get(token);
  if (!isGift && !contract) return null;
  const load = (interval) => db.prepare('SELECT ts, open, high, low, close, volume, oi FROM candles WHERE instrument_token = ? AND interval = ? ORDER BY ts').all(token, interval);
  let sourceMinutes = 15;
  let raw = load(isGift ? GIFT_INTERVAL : '15minute');
  if (!isGift && !raw.length) { raw = load('5minute'); sourceMinutes = 5; }
  if (!raw.length) return null;
  // GIFT NIFTY can be long; keep the last ~120 days.
  const tf = Math.max(minutes, sourceMinutes);
  const bars = resample(isGift ? raw.filter((b) => b.ts >= Date.now() - 120 * 86400000) : raw, tf);
  const hma50 = computeHMASeries(bars, 50);
  const hma130 = computeHMASeries(bars, 130);
  const sma50 = computeSMASeries(bars, 50);
  return {
    instrument: isGift
      ? { token, symbol: 'GIFT NIFTY', kind: 'index' }
      : { token, symbol: contract.tradingsymbol, kind: 'option', strike: contract.strike, type: contract.type, expiry: contract.expiry, lotSize: contract.lot_size },
    minutes: tf,
    sourceMinutes,
    bars: bars.map((b, i) => ({ t: b.ts, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume ?? 0, oi: b.oi ?? null, hma50: hma50[i] ?? null, hma130: hma130[i] ?? null, sma50: sma50[i] ?? null })),
  };
}

export function optionsRouter(db, { verifyToken }) {
  const r = express.Router();
  r.use(requireSession(db, verifyToken));

  r.get('/levels', (req, res) => {
    res.json({ giftToken: GIFT.token, weeks: listLevelWeeks(db, { weeks: Math.min(Number(req.query.weeks) || 8, 52) }) });
  });

  r.get('/crosses', (req, res) => {
    res.json(listCrosses(db, { days: Math.min(Number(req.query.days) || 10, 60) }));
  });

  r.get('/similar', (req, res) => {
    res.json({ gift: similarWeeks(db), options: optionSimilarityStatus(db) });
  });

  r.get('/chart', (req, res) => {
    const token = Number(req.query.token);
    const minutes = Number(req.query.minutes) || 15;
    if (!Number.isFinite(token)) return res.status(400).json({ error: 'token is required' });
    if (!INTERVALS[minutes]) return res.status(400).json({ error: 'minutes must be 5, 15, 30 or 60' });
    const data = chartData(db, { token, minutes });
    if (!data) return res.status(404).json({ error: 'No saved data for this instrument' });
    res.json(data);
  });

  return r;
}

// /api/options — the saved Cross Pullback levels with their option strikes,
// and chart data (candles + HMA 50 / HMA 130 / SMA 50) for any saved contract
// or for GIFT NIFTY itself.

import express from 'express';
import { requireSession } from './strategies.js';
import { OPTIONS_ARCHIVE } from './optionsArchive.js';
import { DEFAULT_CROSS_CONFIG } from './strategy/config.js';
import { computeHMASeries, computeSMASeries } from './strategy/indicators.js';

const IST_OFFSET_MS = 330 * 60000;
const SESSION_START_MIN = 9 * 60 + 15;
const GIFT = DEFAULT_CROSS_CONFIG.instrument; // { token, symbol, exchange }
const GIFT_INTERVAL = DEFAULT_CROSS_CONFIG.timeframe; // '15minute'
const dayStart = (day) => Date.parse(`${day}T00:00:00+05:30`);
const dayEnd = (day) => Date.parse(`${day}T23:59:59.999+05:30`);

/** Wednesday that starts the expiry week containing `day` (YYYY-MM-DD). */
export function weekStart(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() - 3 + 7) % 7; // 3 = Wednesday
  return new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
}

/** Levels grouped into Wednesday → Tuesday weeks, newest first, with what's saved for each. */
export function listLevelWeeks(db, { weeks = 8, cfg = OPTIONS_ARCHIVE } = {}) {
  const rows = db.prepare('SELECT * FROM option_levels ORDER BY day DESC, touch_ts DESC').all();
  const saved = db.prepare(`SELECT oc.instrument_token AS token, oc.strike, oc.type, COUNT(c.ts) AS bars
    FROM option_contracts oc JOIN candles c ON c.instrument_token = oc.instrument_token AND c.interval = ? AND c.ts BETWEEN ? AND ?
    WHERE oc.underlying = ? AND oc.expiry = ? GROUP BY oc.instrument_token`);
  const byWeek = new Map();
  for (const r of rows) {
    const key = weekStart(r.day);
    if (!byWeek.has(key)) {
      if (byWeek.size >= weeks) break;
      byWeek.set(key, []);
    }
    const low = r.ce_strike - cfg.strikesEachSide * cfg.strikeStep;
    const high = r.pe_strike + cfg.strikesEachSide * cfg.strikeStep;
    const contracts = r.expiry ? saved.all(cfg.interval, dayStart(r.day), dayEnd(r.day), cfg.underlying, r.expiry) : [];
    const inBand = contracts.filter((c) => c.strike >= low && c.strike <= high);
    byWeek.get(key).push({
      day: r.day, side: r.side, level: r.level, touchTs: r.touch_ts, crossTs: r.cross_ts, untilTs: r.until_ts, expiry: r.expiry,
      ceStrike: r.ce_strike, peStrike: r.pe_strike, bandLow: low, bandHigh: high,
      bandSaved: inBand.length, bandTotal: ((high - low) / cfg.strikeStep + 1) * 2,
      // Every contract with candles that day (the band, plus any wider data saved earlier)
      contracts: contracts.sort((a, b) => a.strike - b.strike || a.type.localeCompare(b.type)).map(({ token, strike, type, bars }) => ({ token, strike, type, bars })),
    });
  }
  return [...byWeek.entries()].map(([start, levels]) => ({
    weekStart: start,
    weekEnd: new Date(Date.parse(`${start}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10),
    expiry: levels.find((l) => l.expiry)?.expiry ?? null,
    levels,
  }));
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

/** Candles + indicators for a saved option contract or GIFT NIFTY. */
export function chartData(db, { token, minutes = 5, cfg = OPTIONS_ARCHIVE }) {
  const isGift = token === GIFT.token;
  const contract = isGift ? null : db.prepare('SELECT * FROM option_contracts WHERE instrument_token = ?').get(token);
  if (!isGift && !contract) return null;
  const sourceInterval = isGift ? GIFT_INTERVAL : cfg.interval;
  const sourceMinutes = isGift ? 15 : 5;
  const raw = db.prepare('SELECT ts, open, high, low, close, volume, oi FROM candles WHERE instrument_token = ? AND interval = ? ORDER BY ts')
    .all(token, sourceInterval);
  // GIFT NIFTY can be long; keep the last ~120 days.
  const bars = resample(isGift ? raw.filter((b) => b.ts >= Date.now() - 120 * 86400000) : raw, Math.max(minutes, sourceMinutes));
  const hma50 = computeHMASeries(bars, 50);
  const hma130 = computeHMASeries(bars, 130);
  const sma50 = computeSMASeries(bars, 50);
  return {
    instrument: isGift
      ? { token, symbol: 'GIFT NIFTY', kind: 'index' }
      : { token, symbol: contract.tradingsymbol, kind: 'option', strike: contract.strike, type: contract.type, expiry: contract.expiry, lotSize: contract.lot_size },
    minutes: Math.max(minutes, sourceMinutes),
    bars: bars.map((b, i) => ({ t: b.ts, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume ?? 0, oi: b.oi ?? null, hma50: hma50[i] ?? null, hma130: hma130[i] ?? null, sma50: sma50[i] ?? null })),
  };
}

export function optionsRouter(db, { verifyToken }) {
  const r = express.Router();
  r.use(requireSession(db, verifyToken));

  r.get('/levels', (req, res) => {
    res.json({ giftToken: GIFT.token, weeks: listLevelWeeks(db, { weeks: Math.min(Number(req.query.weeks) || 8, 52) }) });
  });

  r.get('/chart', (req, res) => {
    const token = Number(req.query.token);
    const minutes = Number(req.query.minutes) || 5;
    if (!Number.isFinite(token)) return res.status(400).json({ error: 'token is required' });
    if (!INTERVALS[minutes]) return res.status(400).json({ error: 'minutes must be 5, 15, 30 or 60' });
    const data = chartData(db, { token, minutes });
    if (!data) return res.status(404).json({ error: 'No saved data for this instrument' });
    res.json(data);
  });

  return r;
}

// Server-side backtests of saved strategies: fetch (cached) candles, run the
// shared engine, save metrics + equity + every trade. /api/backtests routes.

import express from 'express';
import { randomUUID } from 'node:crypto';
import { runStrategy } from './strategy/backtest.js';
import { buildWeeklyWindows, addDays, toInputDate } from './strategy/session.js';
import { trendWarmup, computeTrendSeries } from './strategy/indicators.js';
import { describeTrend, INDICATOR_LABEL } from './strategy/config.js';
import { ensureCandles, getCandles, todayIST } from './candles.js';
import { getStrategy, requireSession } from './strategies.js';

export class BacktestError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_YEARS = 5;

// Conservative bars per trading day (NSE hours; GIFT NIFTY trades longer, so this over-fetches safely).
const BARS_PER_DAY = { minute: 375, '3minute': 125, '5minute': 75, '10minute': 37, '15minute': 25, '30minute': 12, '60minute': 6 };

/**
 * Calendar days of history to load before the first base week so both HMAs
 * are warm. Both indicators depend only on a fixed window of recent bars (HMA:
 * period + sqrt(period); SMA: period), so
 * any start at least this far back yields identical values - matching the
 * browser backtest, which warmed up from 2017.
 */
export function warmupDays(config) {
  const { fastType = 'hma', fastPeriod, slowType = 'hma', slowPeriod } = config.trend;
  const bars = Math.max(trendWarmup(fastType, fastPeriod), trendWarmup(slowType, slowPeriod)) + 2;
  const tradingDays = Math.ceil(bars / (BARS_PER_DAY[config.timeframe] || 25));
  return Math.max(30, Math.ceil(tradingDays * 7 / 5) + 10);
}

function validateRange(from, to, now) {
  if (!YMD.test(from || '') || !YMD.test(to || '')) throw new BacktestError('Dates must be YYYY-MM-DD');
  if (from >= to) throw new BacktestError('Start date must be before end date');
  if (to > todayIST(now)) throw new BacktestError("End date can't be in the future");
  const years = (Date.parse(to) - Date.parse(from)) / (365.25 * 86400000);
  if (years > MAX_YEARS) throw new BacktestError(`Backtests are limited to ${MAX_YEARS} years`);
}

const equityCurve = (trades) => {
  let equity = 0;
  return trades.map((t) => { equity += t.points; return { ts: t.exitTs, equity: Math.round(equity * 100) / 100 }; });
};

const running = new Set(); // strategy ids with a backtest in progress

/**
 * Run and persist a backtest.
 * @param {function} fetchHistorical (token, interval, from, to) => Promise<candles> — Kite, or a stub in tests
 */
export async function runStrategyBacktest(db, fetchHistorical, { strategyId, from, to, now = Date.now() }) {
  const strategy = getStrategy(db, strategyId);
  if (!strategy) throw new BacktestError('Strategy not found', 404);
  validateRange(from, to, now);
  const { config } = strategy;
  const weekly = config.type === 'level-touch';
  const windows = weekly ? buildWeeklyWindows(from, to) : null;
  if (weekly && !windows.length) throw new BacktestError('Pick a range with at least one full Wednesday-to-Tuesday base week plus its trading week (14 days)');
  if (running.has(strategyId)) throw new BacktestError('A backtest for this strategy is already running', 409);

  const id = randomUUID();
  const started = Date.now();
  db.prepare("INSERT INTO backtests (id, strategy_id, params, status, created_at) VALUES (?, ?, ?, 'running', ?)")
    .run(id, strategyId, JSON.stringify({ from, to, config, strategyName: strategy.name }), started);

  running.add(strategyId);
  try {
    // Cross Pullback also needs the previous cross (for the stop), so it loads extra history.
    const loadFrom = weekly
      ? toInputDate(addDays(windows[0].baseStart, -warmupDays(config)))
      : toInputDate(addDays(new Date(`${from}T00:00:00`), -(warmupDays(config) + 45)));
    const loadTo = weekly ? toInputDate(windows[windows.length - 1].expiryDate) : to;
    const source = { token: config.instrument.token, interval: config.timeframe, from: loadFrom, to: loadTo };

    const fetchStarted = Date.now();
    const fetchInfo = await ensureCandles(db, fetchHistorical, { ...source, now });
    const candles = getCandles(db, source);
    if (!candles.length) {
      throw new BacktestError(`No ${config.timeframe} candles for ${config.instrument.symbol} between ${loadFrom} and ${loadTo}. Check the instrument and your Kite historical-data access.`);
    }

    const computeStarted = Date.now();
    const result = runStrategy({ candles, from, to, config });
    const finished = Date.now();

    const info = {
      type: config.type,
      windows: windows ? windows.length : null,
      setups: result.setups ? result.setups.length : null,
      skipped: result.skipped,
      candles: candles.length,
      loadedFrom: loadFrom,
      loadedTo: loadTo,
      overlaySummary: result.overlaySummary || null,
      kiteRequests: fetchInfo.requests,
      fetchedDays: fetchInfo.fetchedDays,
      fetchMs: computeStarted - fetchStarted,
      computeMs: finished - computeStarted,
      totalMs: finished - started,
    };

    const insertTrade = db.prepare('INSERT INTO backtest_trades (backtest_id, seq, setup_key, side, entry_ts, points, data) VALUES (?, ?, ?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    try {
      result.trades.forEach((t, i) => insertTrade.run(id, i, t.setupKey, t.side, t.entryTs, t.points, JSON.stringify(t)));
      db.prepare("UPDATE backtests SET status = 'done', metrics = ?, equity = ?, summary = ?, info = ?, finished_at = ? WHERE id = ?")
        .run(JSON.stringify(result.metrics), JSON.stringify(equityCurve(result.trades)), JSON.stringify(result.summary), JSON.stringify(info), finished, id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return getBacktest(db, id, { withTrades: true });
  } catch (e) {
    db.prepare("UPDATE backtests SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run(e.message, Date.now(), id);
    throw e;
  } finally {
    running.delete(strategyId);
  }
}

const parse = (v) => (v == null ? null : JSON.parse(v));

function rowToBacktest(r) {
  if (!r) return null;
  const params = parse(r.params);
  return {
    id: r.id,
    strategyId: r.strategy_id,
    strategyName: params.strategyName,
    from: params.from,
    to: params.to,
    config: params.config,
    status: r.status,
    error: r.error,
    metrics: parse(r.metrics),
    summary: parse(r.summary),
    equity: parse(r.equity),
    info: parse(r.info),
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  };
}

export function getBacktest(db, id, { withTrades = false } = {}) {
  const b = rowToBacktest(db.prepare('SELECT * FROM backtests WHERE id = ?').get(id));
  if (b && withTrades) {
    b.trades = db.prepare('SELECT data FROM backtest_trades WHERE backtest_id = ? ORDER BY seq').all(id).map((r) => JSON.parse(r.data));
  }
  return b;
}

export function listBacktests(db, { strategyId = null, limit = 20 } = {}) {
  const rows = strategyId
    ? db.prepare('SELECT * FROM backtests WHERE strategy_id = ? ORDER BY created_at DESC LIMIT ?').all(strategyId, limit)
    : db.prepare('SELECT * FROM backtests ORDER BY created_at DESC LIMIT ?').all(limit);
  // Lists don't need the equity curve.
  return rows.map(rowToBacktest).map(({ equity, ...b }) => b); // eslint-disable-line no-unused-vars
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const isoIST = (ms) => new Date(ms + 330 * 60000).toISOString().replace('T', ' ').slice(0, 16);

export function tradesCsv(backtest) {
  const ma = backtest.trades.find((t) => t.overlay)?.overlay.label.toLowerCase().replace(' ', '') || 'ma';
  const head = ['entry_time_ist', 'exit_time_ist', 'setup', 'side', 'entry_price', 'exit_price', 'exit_reason', 'points', 'stop', 'target', 'touch_point',
    `${ma}_at_entry`, `entry_minus_${ma}`, `${ma}_at_exit`, `exit_minus_${ma}`, 'week_base_start', 'expiry_date', 'legs'];
  const lines = backtest.trades.map((t) => [
    isoIST(t.entryTs), isoIST(t.exitTs), t.setupName, t.side, t.entryPrice, t.exitPrice, t.exitReason,
    Math.round(t.points * 100) / 100, t.stop ?? '', t.target ?? '', t.touchPoint ?? '',
    t.overlay?.atEntry ?? '', t.overlay?.entryVsLine ?? '', t.overlay?.atExit ?? '', t.overlay?.exitVsLine ?? '', t.baseStart ?? '', t.expiryDate ?? '', t.legs?.length ?? 0,
  ].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n') + '\n';
}

/**
 * Bars around `at` (epoch ms) from the candle cache, with the fast/slow lines
 * computed over the backtest's full loaded range (so values match the run).
 */
export function chartWindow(db, backtest, { at = null, before = 120, after = 80 } = {}) {
  const { config, info } = backtest;
  const candles = getCandles(db, { token: config.instrument.token, interval: config.timeframe, from: info.loadedFrom, to: info.loadedTo });
  if (!candles.length) return { bars: [], fast: [], slow: [], trades: [], labels: {} };
  const { fastType = 'hma', fastPeriod, slowType = 'hma', slowPeriod } = config.trend;
  const fast = computeTrendSeries(candles, fastType, fastPeriod);
  const slow = computeTrendSeries(candles, slowType, slowPeriod);
  const overlay = config.overlay?.enabled ? computeTrendSeries(candles, config.overlay.type, config.overlay.period) : null;
  const target = at ?? backtest.trades.at(-1)?.entryTs ?? candles.at(-1).time;
  let idx = candles.findIndex((c) => c.time >= target);
  if (idx < 0) idx = candles.length - 1;
  const lo = Math.max(0, idx - Math.min(before, 400));
  const hi = Math.min(candles.length, idx + Math.min(after, 400) + 1);
  const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  const t0 = candles[lo].time, t1 = candles[hi - 1].time;
  return {
    bars: candles.slice(lo, hi).map((c) => ({ t: c.time, o: c.open, h: c.high, l: c.low, c: c.close })),
    fast: fast.slice(lo, hi).map(r2),
    slow: slow.slice(lo, hi).map(r2),
    overlay: overlay ? overlay.slice(lo, hi).map(r2) : null,
    labels: { overlay: overlay ? `${INDICATOR_LABEL[config.overlay.type]} ${config.overlay.period}` : null, fast: `${INDICATOR_LABEL[fastType]} ${fastPeriod}`, slow: `${INDICATOR_LABEL[slowType]} ${slowPeriod}`, trend: describeTrend(config.trend) },
    trades: backtest.trades
      .filter((t) => t.exitTs >= t0 && t.entryTs <= t1)
      .map((t) => ({ entryTs: t.entryTs, exitTs: t.exitTs, side: t.side, entryPrice: t.entryPrice, exitPrice: t.exitPrice, exitReason: t.exitReason, stop: t.stop ?? null, target: t.target ?? null, touchPoint: t.touchPoint ?? null, overlay: t.overlay ?? null, setupName: t.setupName, points: t.points })),
  };
}

export function backtestsRouter(db, { verifyToken, kiteFor }) {
  const r = express.Router();
  r.use(requireSession(db, verifyToken));

  const fail = (res, e) => {
    if (e instanceof BacktestError) return res.status(e.status).json({ error: e.message });
    if (e?.error_type === 'TokenException') return res.status(401).json({ error: 'Your Kite session has expired. Log in again.' });
    console.error('[BACKTESTS]', e);
    res.status(502).json({ error: e?.message ? `Backtest failed: ${e.message}` : 'Backtest failed' });
  };

  r.post('/', async (req, res) => {
    try {
      const { strategyId, from, to } = req.body || {};
      const token = req.headers.authorization.slice(7);
      const kc = kiteFor(token);
      const fetchHistorical = (instrumentToken, interval, f, t) => kc.getHistoricalData(instrumentToken, interval, f, t, false, false);
      res.status(201).json(await runStrategyBacktest(db, fetchHistorical, { strategyId, from, to }));
    } catch (e) { fail(res, e); }
  });

  r.get('/', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json(listBacktests(db, { strategyId: req.query.strategyId || null, limit }));
  });

  r.get('/:id', (req, res) => {
    const b = getBacktest(db, req.params.id, { withTrades: true });
    return b ? res.json(b) : res.status(404).json({ error: 'Backtest not found' });
  });

  // Candles around a moment (default: the latest trade) with both trend lines and the trades in view.
  r.get('/:id/chart', (req, res) => {
    const b = getBacktest(db, req.params.id, { withTrades: true });
    if (!b) return res.status(404).json({ error: 'Backtest not found' });
    res.json(chartWindow(db, b, { at: Number(req.query.at) || null, before: Number(req.query.before) || 120, after: Number(req.query.after) || 80 }));
  });

  r.get('/:id/trades.csv', (req, res) => {
    const b = getBacktest(db, req.params.id, { withTrades: true });
    if (!b) return res.status(404).json({ error: 'Backtest not found' });
    const name = `${(b.strategyName || 'backtest').replace(/[^\w-]+/g, '_')}_${b.from}_${b.to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send(tradesCsv(b));
  });

  r.delete('/:id', (req, res) => {
    const n = db.prepare('DELETE FROM backtests WHERE id = ?').run(req.params.id).changes;
    return n ? res.status(204).end() : res.status(404).json({ error: 'Backtest not found' });
  });

  return r;
}

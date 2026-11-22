/**
 * Backtest runner.
 *
 * Replays stored candles through the SAME createTradeMachine the live runner
 * uses, so a backtested edge and a live alert come from one implementation.
 * Nothing here knows about Kite or HTTP - hand it candles, get trades back.
 */

import { computeTrendSeries, getHmaState } from './indicators.js';
import { STRATEGY_SETUPS, getSetup } from './rules/levelTouch.js';
import { createTradeMachine } from './engine.js';
import {
  buildWeeklyWindows, formatCandleTimestamp, getCandleSessionMinutes,
  normalizeCandle, parseCandleTime, toInputDate, addDays,
} from './session.js';
import { DEFAULT_CONFIG, INDICATOR_LABEL, toMinutes } from './config.js';
import { runCrossPullback } from './rules/crossPullback.js';

// Windows are built from local calendar dates (buildWeeklyWindows), so key them
// with toInputDate - the same convention the browser backtest used. Converting
// local midnight to IST instead would shift a day on servers east of IST.
const dateKeysBetween = (start, end) => {
  const keys = new Set();
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) keys.add(toInputDate(d));
  return keys;
};

/**
 * @param {object}   opts
 * @param {Array}    opts.candles   raw candles (Kite arrays or objects)
 * @param {string}   opts.from      YYYY-MM-DD
 * @param {string}   opts.to        YYYY-MM-DD
 * @param {object}   [opts.config]  saved strategy config (strategy/config.js); defaults
 *                                  reproduce the original hard-coded strategy
 * @param {string[]} [opts.setupKeys] limit to these setups (overrides config.setups)
 * @returns {{trades:Array, summary:Array, metrics:object, skipped:Array}}
 */
export function runBacktest({ candles, from, to, config = DEFAULT_CONFIG, setupKeys = null }) {
  const { fastPeriod, slowPeriod, fastType = 'hma', slowType = 'hma' } = config.trend;
  const sessionStart = toMinutes(config.session.start);
  const sessionEnd = toMinutes(config.session.end);
  const inSession = (c) => {
    const m = getCandleSessionMinutes(c.time);
    return m != null && m >= sessionStart && m <= sessionEnd;
  };

  const normalized = candles.map(normalizeCandle).filter((c) => Number.isFinite(c.close));
  normalized.sort((a, b) => parseCandleTime(a.time) - parseCandleTime(b.time));

  const candleIndexMap = new Map(normalized.map((c, i) => [c, i]));
  // hma50/hma200 are the fast/slow trend lines (names kept from the original);
  // each is an HMA or SMA with the period from the config.
  const hma50 = computeTrendSeries(normalized, fastType, fastPeriod);
  const hma200 = computeTrendSeries(normalized, slowType, slowPeriod);

  const keys = setupKeys || config.setups;
  const setups = keys ? keys.map(getSetup).filter(Boolean) : STRATEGY_SETUPS;
  const trades = [];
  const skipped = [];

  for (const window of buildWeeklyWindows(from, to)) {
    const baseKeys = dateKeysBetween(window.baseStart, window.baseEnd);
    const expiryKeys = dateKeysBetween(window.expiryStart, window.expiryDate);
    const deadline = new Date(`${toInputDate(window.expiryDate)}T${config.session.exitTime}:00+05:30`);

    const baseCandles = normalized.filter((c) => baseKeys.has(c.dateKey));
    const tradeCandles = normalized.filter(
      (c) => expiryKeys.has(c.dateKey)
        && inSession(c)
        && parseCandleTime(c.time) <= deadline,
    );

    if (!baseCandles.length || !tradeCandles.length) {
      skipped.push({
        baseStart: toInputDate(window.baseStart),
        expiryDate: toInputDate(window.expiryDate),
        reason: !baseCandles.length ? 'no base candles' : 'no tradable expiry candles',
      });
      continue;
    }

    const low = Math.min(...baseCandles.map((c) => c.low));
    const high = Math.max(...baseCandles.map((c) => c.high));
    const levels = { low, high, mid: low + (high - low) / 2 };

    // One trigger per setup per week, matching the original behaviour.
    const triggered = new Set();

    tradeCandles.forEach((candle, tradeIndex) => {
      const ci = candleIndexMap.get(candle);
      const s50 = getHmaState(hma50, ci, levels);
      const s200 = getHmaState(hma200, ci, levels);
      if (!s50 || !s200) return;

      for (const setup of setups) {
        if (triggered.has(setup.key)) continue;
        if (!setup.matches({ candle, levels, hma50State: s50, hma200State: s200 })) continue;

        const entryPrice = setup.entry(candle, levels);
        if (!Number.isFinite(entryPrice)) continue;
        triggered.add(setup.key);

        const machine = createTradeMachine({
          setup, levels, entryPrice,
          entryTime: formatCandleTimestamp(candle.time),
          formatTime: formatCandleTimestamp,
        });

        let exitBar = null;
        for (let i = tradeIndex + 1; i < tradeCandles.length && machine.isOpen; i += 1) {
          const next = tradeCandles[i];
          const ni = candleIndexMap.get(next);
          machine.onBar(next, getHmaState(hma50, ni, levels), getHmaState(hma200, ni, levels));
          exitBar = next;
        }
        const last = tradeCandles[tradeCandles.length - 1];
        if (machine.isOpen) exitBar = last;
        machine.settle(last.close, last.time);

        const points = machine.points();
        const legs = machine.legs;
        trades.push({
          setupKey: setup.key,
          setupName: setup.name,
          side: setup.side,
          baseStart: toInputDate(window.baseStart),
          expiryDate: toInputDate(window.expiryDate),
          entryTime: legs[0]?.entryTime,
          entryPrice,
          exitTime: legs[legs.length - 1]?.exitTime,
          exitPrice: legs[legs.length - 1]?.exitPrice,
          exitReason: machine.exitReason,
          points,
          result: points > 0 ? 'win' : points < 0 ? 'loss' : 'flat',
          legs,
          // Epoch ms of the entry and final exit bars, for charts, sorting and CSV.
          entryTs: parseCandleTime(candle.time).getTime(),
          exitTs: parseCandleTime((exitBar || candle).time).getTime(),
        });
      }
    });
  }

  return { trades, summary: buildSummary(trades), metrics: buildMetrics(trades), skipped };
}

/**
 * Run any strategy type. Level-touch goes through runBacktest (unchanged);
 * other types have their own engine but share the summary and metrics.
 */
export function runStrategy({ candles, from, to, config }) {
  let result;
  if (config.type === 'hma-cross-pullback') {
    const { trades, setups } = runCrossPullback({ candles, from, to, config });
    result = { trades, summary: buildSummary(trades), metrics: buildMetrics(trades), skipped: [], setups };
  } else {
    result = runBacktest({ candles, from, to, config });
  }
  if (config.overlay?.enabled) {
    annotateWithOverlay(result.trades, candles, config.overlay);
    result.overlaySummary = buildOverlaySummary(result.trades, config.overlay);
  }
  return result;
}

const overlayLabel = (o) => `${INDICATOR_LABEL[o.type]} ${o.period}`;

/**
 * Analysis only: record the overlay line (e.g. SMA 50) on each trade - its value
 * at the last COMPLETED bar before the entry bar and before the exit bar (the
 * same convention the entry line uses) - and where price was relative to it.
 */
export function annotateWithOverlay(trades, candles, overlay) {
  const bars = candles.map(normalizeCandle).filter((c) => Number.isFinite(c.close))
    .map((c) => ({ ...c, ts: parseCandleTime(c.time).getTime() }))
    .sort((a, b) => a.ts - b.ts);
  const series = computeTrendSeries(bars, overlay.type, overlay.period);
  const indexAt = (ts) => { // first bar with ts >= target (binary search)
    let lo = 0, hi = bars.length - 1, ans = bars.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid].ts >= ts) { ans = mid; hi = mid - 1; } else lo = mid + 1; }
    return ans;
  };
  const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  for (const t of trades) {
    const atEntry = r2(series[indexAt(t.entryTs) - 1]);
    const atExit = r2(series[indexAt(t.exitTs) - 1]);
    t.overlay = {
      label: overlayLabel(overlay),
      atEntry,
      atExit,
      entryVsLine: atEntry == null ? null : r2(t.entryPrice - atEntry), // + = price above the line
      exitVsLine: atExit == null ? null : r2(t.exitPrice - atExit),
    };
  }
}

/** Results grouped by side and whether the entry was above or below the overlay line. */
export function buildOverlaySummary(trades, overlay) {
  const label = overlayLabel(overlay);
  const groups = new Map();
  for (const t of trades) {
    const v = t.overlay?.entryVsLine;
    if (v == null) continue;
    const where = v >= 0 ? 'above' : 'below';
    const key = `${t.side}-${where}`;
    if (!groups.has(key)) groups.set(key, { key, side: t.side, where, name: `${t.side === 'short' ? 'Short' : 'Long'} · entry ${where} ${label}`, trades: [] });
    groups.get(key).trades.push(t);
  }
  return [...groups.values()].map(({ trades: ts, ...g }) => {
    const m = buildMetrics(ts);
    return { ...g, label, trades: m.trades, winRate: m.winRate, points: m.points, avgPoints: m.trades ? m.points / m.trades : 0 };
  }).sort((a, b) => (a.side + a.where).localeCompare(b.side + b.where));
}

export function buildSummary(trades) {
  const by = new Map();
  for (const t of trades) {
    if (!by.has(t.setupKey)) {
      by.set(t.setupKey, { setupKey: t.setupKey, setupName: t.setupName, side: t.side, trades: 0, wins: 0, losses: 0, flats: 0, points: 0 });
    }
    const row = by.get(t.setupKey);
    row.trades += 1;
    row.points += t.points;
    if (t.result === 'win') row.wins += 1;
    else if (t.result === 'loss') row.losses += 1;
    else row.flats += 1;
  }
  return [...by.values()].map((r) => ({
    ...r,
    winRate: r.trades ? r.wins / r.trades : 0,
    avgPoints: r.trades ? r.points / r.trades : 0,
  }));
}

export function buildMetrics(trades) {
  if (!trades.length) return { trades: 0, points: 0, winRate: 0, avgWin: 0, avgLoss: 0, profitFactor: null, maxDrawdown: 0 };

  const wins = trades.filter((t) => t.points > 0);
  const losses = trades.filter((t) => t.points < 0);
  const grossWin = wins.reduce((s, t) => s + t.points, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.points, 0));

  let equity = 0, peak = 0, maxDrawdown = 0;
  for (const t of trades) {
    equity += t.points;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  return {
    trades: trades.length,
    points: equity,
    winRate: wins.length / trades.length,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : null,
    maxDrawdown,
  };
}

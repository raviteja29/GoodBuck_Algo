/**
 * Backtest runner.
 *
 * Replays stored candles through the SAME createTradeMachine the live runner
 * uses, so a backtested edge and a live alert come from one implementation.
 * Nothing here knows about Kite or HTTP - hand it candles, get trades back.
 */

import { computeHMASeries, getHmaState } from './indicators.js';
import { STRATEGY_SETUPS, getSetup } from './rules/levelTouch.js';
import { createTradeMachine } from './engine.js';
import {
  buildWeeklyWindows, formatCandleTimestamp, getCandleSessionMinutes,
  normalizeCandle, parseCandleTime, toInputDate, addDays,
} from './session.js';
import { DEFAULT_CONFIG, toMinutes } from './config.js';

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
  const { fastPeriod, slowPeriod } = config.trend;
  const sessionStart = toMinutes(config.session.start);
  const sessionEnd = toMinutes(config.session.end);
  const inSession = (c) => {
    const m = getCandleSessionMinutes(c.time);
    return m != null && m >= sessionStart && m <= sessionEnd;
  };

  const normalized = candles.map(normalizeCandle).filter((c) => Number.isFinite(c.close));
  normalized.sort((a, b) => parseCandleTime(a.time) - parseCandleTime(b.time));

  const candleIndexMap = new Map(normalized.map((c, i) => [c, i]));
  // Named hma50/hma200 for history; periods now come from the config.
  const hma50 = computeHMASeries(normalized, fastPeriod);
  const hma200 = computeHMASeries(normalized, slowPeriod);

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

function buildSummary(trades) {
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

function buildMetrics(trades) {
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

/**
 * Proves createTradeMachine reproduces simulateStrategyTrade from
 * src/components/GiftNiftyBacktest.jsx leg for leg.
 *
 * The original is copied in verbatim below and run side by side with the
 * extracted engine over the same candles, levels and HMA series.
 */
import { computeHMASeries, getHmaState } from '../indicators.js';
import { STRATEGY_SETUPS, getTouchedLevelSignals } from '../rules/levelTouch.js';
import { createTradeMachine } from '../engine.js';

const fmt = (t) => `T${t}`;

// ---------------- ORIGINAL, copied from the component ----------------
const getTradePoints = (side, e, x) => (side === 'long' ? x - e : e - x);
const isTargetHit = (side, c, t) => Number.isFinite(t) && (side === 'long' ? c.high >= t : c.low <= t);
const isStopHit = (side, c, s) => Number.isFinite(s) && (side === 'long' ? c.low <= s : c.high >= s);
const getSideLevels = (side, l) => (side === 'long' ? { target: l.high, stop: l.low } : { target: l.low, stop: l.high });
const normalizeTradeLevels = (side, entryPrice, levels) => {
  const target = Number.isFinite(levels.target) && ((side === 'long' && levels.target > entryPrice) || (side === 'short' && levels.target < entryPrice)) ? levels.target : null;
  const stop = Number.isFinite(levels.stop) && ((side === 'long' && levels.stop < entryPrice) || (side === 'short' && levels.stop > entryPrice)) ? levels.stop : null;
  return { target, stop };
};
const createLeg = (side, entryPrice, entryTime, levels, tradeLevels = getSideLevels(side, levels)) => ({
  side, entryPrice, entryTime, ...normalizeTradeLevels(side, entryPrice, tradeLevels),
});
const closeLeg = (leg, exitPrice, exitTime, exitReason) => ({
  ...leg, exitPrice, exitTime, exitReason, points: getTradePoints(leg.side, leg.entryPrice, exitPrice),
});

const origSimulate = ({ setup, triggerIndex, candles, hma50, hma200, candleIndexMap, levels }) => {
  const triggerCandle = candles[triggerIndex];
  const entryPrice = setup.entry(triggerCandle, levels);
  if (!Number.isFinite(entryPrice)) return null;
  const legs = [];
  let activeLeg = createLeg(setup.side, entryPrice, fmt(triggerCandle.time), levels, {
    target: setup.target(levels), stop: setup.stop(levels),
  });
  let exitReason = 'expiry';
  for (let index = triggerIndex + 1; index < candles.length; index += 1) {
    const candle = candles[index];
    if (isStopHit(activeLeg.side, candle, activeLeg.stop)) {
      legs.push(closeLeg(activeLeg, activeLeg.stop, fmt(candle.time), 'stop loss'));
      exitReason = 'stop loss'; activeLeg = null; break;
    }
    if (isTargetHit(activeLeg.side, candle, activeLeg.target)) {
      legs.push(closeLeg(activeLeg, activeLeg.target, fmt(candle.time), 'target'));
      exitReason = 'target'; activeLeg = null; break;
    }
    const ci = candleIndexMap.get(candle);
    const s50 = getHmaState(hma50, ci, levels);
    const s200 = getHmaState(hma200, ci, levels);
    if (!s50 || !s200) continue;
    const opposite = getTouchedLevelSignals(candle, levels, s50, s200).find((s) => s.side !== activeLeg.side);
    if (opposite) {
      legs.push(closeLeg(activeLeg, opposite.price, fmt(candle.time), `${opposite.levelLabel} ${opposite.side} signal`));
      activeLeg = createLeg(opposite.side, opposite.price, fmt(candle.time), levels);
      exitReason = `${opposite.levelLabel} ${opposite.side} signal`;
    }
  }
  if (activeLeg) {
    const last = candles[candles.length - 1];
    legs.push(closeLeg(activeLeg, last.close, fmt(last.time), 'expiry'));
    exitReason = 'expiry';
  }
  return { legs, exitReason, points: legs.reduce((s, l) => s + l.points, 0) };
};
// ---------------------------------------------------------------------

function makeCandles(n, seed) {
  let s = seed, price = 22000;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: n }, (_, i) => {
    price += (22000 - price) * 0.03 + (rnd() - 0.5) * 70;
    const high = price + rnd() * 40, low = price - rnd() * 40;
    return { time: i, open: price, high, low, close: price };
  });
}

let failures = 0, compared = 0, withReversals = 0;
const fail = (msg) => { console.log('FAIL  ' + msg); failures++; };

for (const seed of [3, 11, 29, 101, 977, 1511, 2027, 3313, 4099, 5077, 6151, 7919]) {
  const candles = makeCandles(1400, seed);
  const candleIndexMap = new Map(candles.map((c, i) => [c, i]));
  const hma50 = computeHMASeries(candles, 50);
  const hma200 = computeHMASeries(candles, 200);

  const window = candles.slice(220, 320);
  const high = Math.max(...window.map((c) => c.high));
  const low = Math.min(...window.map((c) => c.low));
  const levels = { high, low, mid: (high + low) / 2 };

  for (const setup of STRATEGY_SETUPS) {
    for (let t = 320; t < candles.length - 1; t += 1) {
      const s50 = getHmaState(hma50, t, levels);
      const s200 = getHmaState(hma200, t, levels);
      if (!s50 || !s200) continue;
      if (!setup.matches({ candle: candles[t], levels, hma50State: s50, hma200State: s200 })) continue;

      const expected = origSimulate({ setup, triggerIndex: t, candles, hma50, hma200, candleIndexMap, levels });

      const m = createTradeMachine({
        setup, levels,
        entryPrice: setup.entry(candles[t], levels),
        entryTime: fmt(candles[t].time),
        formatTime: fmt,
      });
      for (let i = t + 1; i < candles.length && m.isOpen; i += 1) {
        m.onBar(candles[i], getHmaState(hma50, i, levels), getHmaState(hma200, i, levels));
      }
      const last = candles[candles.length - 1];
      m.settle(last.close, last.time);

      compared++;
      if (m.legs.length > 1) withReversals++;

      if (JSON.stringify(m.legs) !== JSON.stringify(expected.legs)) {
        fail(`seed ${seed} ${setup.key}@${t}: legs differ (${expected.legs.length} vs ${m.legs.length})`);
      } else if (Math.abs(m.points() - expected.points) > 1e-9) {
        fail(`seed ${seed} ${setup.key}@${t}: points ${expected.points} vs ${m.points()}`);
      } else if (m.exitReason !== expected.exitReason) {
        fail(`seed ${seed} ${setup.key}@${t}: reason "${expected.exitReason}" vs "${m.exitReason}"`);
      }
    }
  }
}

console.log(`compared ${compared} simulated trades (${withReversals} involving reversals)`);
console.log(failures ? `\n${failures} MISMATCH(ES)` : '\nALL TRADES IDENTICAL');
process.exit(failures ? 1 : 0);

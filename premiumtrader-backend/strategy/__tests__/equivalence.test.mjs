/**
 * Proves the extracted indicators are numerically identical to the
 * implementation that still lives in src/components/GiftNiftyBacktest.jsx.
 *
 * Run: node premiumtrader-backend/strategy/__tests__/equivalence.test.mjs
 *
 * This is the guard that keeps backtest and live alerts honest. If it fails,
 * the two code paths have diverged and backtested numbers no longer describe
 * what the live runner will do.
 */
import { computeHMASeries, computeWMA } from '../indicators.js';

// ---- ORIGINAL implementation, copied verbatim from the component ----
const origComputeWMA = (values, period, endIndex) => {
  if (endIndex + 1 < period) return null;
  const weightSum = period * (period + 1) / 2;
  let weightedSum = 0;
  let weight = 1;
  for (let index = endIndex - period + 1; index <= endIndex; index += 1) {
    weightedSum += values[index] * weight;
    weight += 1;
  }
  return weightedSum / weightSum;
};

const origComputeHMASeries = (candles, period) => {
  const closes = candles.map(candle => candle.close);
  const half = Math.floor(period / 2);
  const sqrtPeriod = Math.max(1, Math.floor(Math.sqrt(period)));
  const diffSeries = [];
  for (let index = 0; index < closes.length; index += 1) {
    const full = origComputeWMA(closes, period, index);
    const halfValue = origComputeWMA(closes, half, index);
    diffSeries.push(full == null || halfValue == null ? null : 2 * halfValue - full);
  }
  return diffSeries.map((value, index) => {
    if (value == null || index + 1 < period + sqrtPeriod - 1) return null;
    const validDiffs = diffSeries.slice(0, index + 1).filter(v => v != null);
    return origComputeWMA(validDiffs, sqrtPeriod, validDiffs.length - 1);
  });
};
// ---------------------------------------------------------------------

function makeCandles(n, seed = 7) {
  // Deterministic pseudo-random walk so failures are reproducible.
  let s = seed, price = 22000;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return Array.from({ length: n }, () => {
    price += (rnd() - 0.48) * 40;
    const high = price + rnd() * 15;
    const low = price - rnd() * 15;
    return { close: price, high, low, open: price, time: 0 };
  });
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
};

for (const period of [50, 200]) {
  for (const n of [0, 1, 49, 260, 1200]) {
    const candles = makeCandles(n);
    const a = origComputeHMASeries(candles, period);
    const b = computeHMASeries(candles, period);

    let same = a.length === b.length;
    let worst = 0, at = -1;
    if (same) {
      for (let i = 0; i < a.length; i++) {
        const x = a[i], y = b[i];
        if (x == null || y == null) { if (x !== y) { same = false; at = i; break; } continue; }
        const d = Math.abs(x - y);
        if (d > worst) { worst = d; at = i; }
        if (d > 1e-9) { same = false; break; }
      }
    }
    check(`HMA ${period} over ${n} candles`, same,
      same ? `max delta ${worst.toExponential(2)}` : `first mismatch at index ${at}`);
  }
}

// WMA edge cases
check('WMA before warmup returns null', computeWMA([1, 2, 3], 5, 2) === null);
check('WMA matches original on a known window',
  Math.abs(computeWMA([1, 2, 3, 4], 4, 3) - origComputeWMA([1, 2, 3, 4], 4, 3)) < 1e-12);

// Performance: the original is O(n^2); the extraction should be far faster.
const big = makeCandles(6000);
const t0 = performance.now(); origComputeHMASeries(big, 200); const tOrig = performance.now() - t0;
const t1 = performance.now(); computeHMASeries(big, 200);     const tNew  = performance.now() - t1;
console.log(`\n6000 candles, HMA 200:  original ${tOrig.toFixed(0)}ms   extracted ${tNew.toFixed(0)}ms   (${(tOrig / tNew).toFixed(1)}x faster)`);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);

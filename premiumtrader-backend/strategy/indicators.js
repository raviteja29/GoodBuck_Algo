/**
 * Indicators shared by the backtester and the live alert runner.
 *
 * These are a behaviour-preserving extraction of the implementations that
 * lived in src/components/GiftNiftyBacktest.jsx. Numerically identical
 * output is enforced by strategy/__tests__/equivalence.test.js - if you
 * change the maths here, that test must be updated deliberately, because
 * backtest results and live signals both depend on it.
 */

/** Weighted moving average ending at endIndex. Returns null before warmup. */
export function computeWMA(values, period, endIndex) {
  if (endIndex + 1 < period) return null;
  const weightSum = (period * (period + 1)) / 2;
  let weightedSum = 0;
  let weight = 1;
  for (let index = endIndex - period + 1; index <= endIndex; index += 1) {
    weightedSum += values[index] * weight;
    weight += 1;
  }
  return weightedSum / weightSum;
}

/**
 * Hull Moving Average over candle CLOSE prices.
 *
 * Note the two conventions inherited from the original: it uses close
 * (not typical price), and Math.floor for the sqrt length. Both are kept
 * deliberately so historical backtest numbers stay comparable.
 *
 * The original rebuilt a filtered copy of the diff series on every bar,
 * which made it O(n^2) and dominated long backtests. This version is
 * O(n * period) and allocation-free in the tail, while producing the
 * same values - see the equivalence test.
 */
export function computeHMASeries(candles, period) {
  const closes = candles.map((candle) => candle.close);
  const half = Math.floor(period / 2);
  const sqrtPeriod = Math.max(1, Math.floor(Math.sqrt(period)));

  const diffSeries = new Array(closes.length);
  // Compacted diff values, in order, with their source index. The original
  // filtered nulls out of the diff series before the final WMA, so the
  // smoothing runs over the compacted sequence - replicated here.
  const validDiffs = [];
  const validCountAt = new Array(closes.length);

  for (let index = 0; index < closes.length; index += 1) {
    const full = computeWMA(closes, period, index);
    const halfValue = computeWMA(closes, half, index);
    const diff = full == null || halfValue == null ? null : 2 * halfValue - full;
    diffSeries[index] = diff;
    if (diff != null) validDiffs.push(diff);
    validCountAt[index] = validDiffs.length;
  }

  const out = new Array(closes.length);
  for (let index = 0; index < closes.length; index += 1) {
    if (diffSeries[index] == null || index + 1 < period + sqrtPeriod - 1) {
      out[index] = null;
      continue;
    }
    out[index] = computeWMA(validDiffs, sqrtPeriod, validCountAt[index] - 1);
  }
  return out;
}

/** Bars of history required before computeHMASeries yields a value. */
export function hmaWarmup(period) {
  return period + Math.max(1, Math.floor(Math.sqrt(period))) - 1;
}

/**
 * Simple Moving Average of CLOSE prices; null until `period` bars exist.
 *
 * Each value is summed over its own window (not a running sum) so the result
 * at a bar depends only on the last `period` closes - identical no matter how
 * much earlier history was loaded, which keeps backtest and live in step.
 */
export function computeSMASeries(candles, period) {
  const closes = candles.map((candle) => candle.close);
  const out = new Array(closes.length);
  for (let index = 0; index < closes.length; index += 1) {
    if (index + 1 < period) { out[index] = null; continue; }
    let sum = 0;
    for (let k = index - period + 1; k <= index; k += 1) sum += closes[k];
    out[index] = sum / period;
  }
  return out;
}

export const INDICATOR_TYPES = ['hma', 'sma'];

/** Series for a trend line of the given type. */
export function computeTrendSeries(candles, type, period) {
  return type === 'sma' ? computeSMASeries(candles, period) : computeHMASeries(candles, period);
}

/** Bars of history required before a trend line of this type yields a value. */
export function trendWarmup(type, period) {
  return type === 'sma' ? period : hmaWarmup(period);
}

export const getTrend = (currentValue, previousValue) => {
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return 'missing';
  return currentValue > previousValue ? 'increasing' : 'decreasing';
};

export const getZone = (value, levels) => {
  if (!Number.isFinite(value)) return 'missing';
  if (value < levels.low) return 'below-low';
  if (value < levels.mid) return 'low-mid';
  if (value <= levels.high) return 'mid-high';
  return 'above-high';
};

/** Trend + zone of an HMA series at one index, or null before warmup. */
export function getHmaState(series, index, levels) {
  const current = series[index];
  const previous = series[index - 1];
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return {
    value: current,
    previousValue: previous,
    zone: getZone(current, levels),
    trend: getTrend(current, previous),
  };
}


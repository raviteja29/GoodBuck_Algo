/**
 * Strategy config: the saved, parameterised description of a strategy.
 *
 * One config drives the backtest (Phase 2), the live runner (Phase 3) and the
 * alerts (Phase 5). Only parameters the engine actually honours belong here;
 * adding a field without wiring it into the engine would make backtests lie.
 *
 * DEFAULT_CONFIG reproduces the strategy that used to be hard-coded in
 * GiftNiftyBacktest.jsx, so it loads and backtests identically.
 */

import { STRATEGY_SETUPS } from './rules/levelTouch.js';
import { INDICATOR_TYPES } from './indicators.js';

export const CONFIG_VERSION = 1;

export { INDICATOR_TYPES };
export const INDICATOR_LABEL = { hma: 'HMA', sma: 'SMA' };

export const TIMEFRAMES = ['minute', '3minute', '5minute', '10minute', '15minute', '30minute', '60minute'];

export const SETUP_CATALOGUE = STRATEGY_SETUPS.map(({ key, name, side }) => ({ key, name, side }));

export const DEFAULT_CONFIG = Object.freeze({
  version: CONFIG_VERSION,
  type: 'level-touch',
  instrument: { token: 291849, symbol: 'GIFTNIFTY', exchange: 'NSEIX' },
  timeframe: '15minute',
  // Levels = high / mid / low of the previous Wed→Tue week; traded the following week.
  levels: { source: 'weekly-range' },
  // Two trend lines, each an HMA or SMA. Long when both are rising, else short.
  trend: { fastType: 'hma', fastPeriod: 50, slowType: 'hma', slowPeriod: 200 },
  setups: SETUP_CATALOGUE.map((s) => s.key),
  session: { start: '09:15', end: '15:30', exitTime: '15:15' },
  risk: { lots: 1, lotSize: 1 },
  alerts: { touch: true, confirmed: true },
});

const clone = (v) => JSON.parse(JSON.stringify(v));
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

/**
 * Fill defaults and validate. Returns { config, errors } — errors is an array
 * of { field, message }; config is only safe to use when errors is empty.
 */
export function normalizeConfig(input = {}) {
  const errors = [];
  const err = (field, message) => errors.push({ field, message });
  const src = input && typeof input === 'object' ? input : {};
  const d = DEFAULT_CONFIG;

  const config = {
    version: CONFIG_VERSION,
    type: src.type ?? d.type,
    instrument: { ...d.instrument, ...(src.instrument || {}) },
    timeframe: src.timeframe ?? d.timeframe,
    levels: { ...d.levels, ...(src.levels || {}) },
    trend: { ...d.trend, ...(src.trend || {}) },
    setups: Array.isArray(src.setups) ? [...new Set(src.setups)] : clone(d.setups),
    session: { ...d.session, ...(src.session || {}) },
    risk: { ...d.risk, ...(src.risk || {}) },
    alerts: { ...d.alerts, ...(src.alerts || {}) },
  };

  if (config.type !== 'level-touch') err('type', 'Only the level-touch strategy type is supported');

  const token = Number(config.instrument.token);
  if (!isInt(token, 1, Number.MAX_SAFE_INTEGER)) err('instrument.token', 'Instrument token must be a positive whole number');
  config.instrument.token = token;
  config.instrument.symbol = String(config.instrument.symbol || '').trim().toUpperCase();
  if (!config.instrument.symbol) err('instrument.symbol', 'Instrument symbol is required');
  config.instrument.exchange = String(config.instrument.exchange || '').trim().toUpperCase();

  if (!TIMEFRAMES.includes(config.timeframe)) err('timeframe', `Timeframe must be one of ${TIMEFRAMES.join(', ')}`);
  if (config.levels.source !== 'weekly-range') err('levels.source', 'Only weekly-range levels are supported');

  const { fastType, fastPeriod, slowType, slowPeriod } = config.trend;
  if (!INDICATOR_TYPES.includes(fastType)) err('trend.fastType', 'Fast line must be HMA or SMA');
  if (!INDICATOR_TYPES.includes(slowType)) err('trend.slowType', 'Slow line must be HMA or SMA');
  if (!isInt(fastPeriod, 2, 500)) err('trend.fastPeriod', 'Fast line period must be 2–500');
  if (!isInt(slowPeriod, 2, 1000)) err('trend.slowPeriod', 'Slow line period must be 2–1000');
  // Same indicator twice only makes sense with a longer slow line; mixed types may share a period.
  if (fastType === slowType && isInt(fastPeriod, 2, 500) && isInt(slowPeriod, 2, 1000) && fastPeriod >= slowPeriod) {
    err('trend.slowPeriod', 'Slow line period must be longer than the fast one');
  }

  const known = new Set(SETUP_CATALOGUE.map((s) => s.key));
  const unknown = config.setups.filter((k) => !known.has(k));
  if (unknown.length) err('setups', `Unknown setups: ${unknown.join(', ')}`);
  if (!config.setups.length) err('setups', 'Pick at least one setup');
  // Keep catalogue order so configs compare and display consistently.
  config.setups = SETUP_CATALOGUE.map((s) => s.key).filter((k) => config.setups.includes(k));

  const { start, end, exitTime } = config.session;
  for (const [k, v] of Object.entries({ start, end, exitTime })) {
    if (typeof v !== 'string' || !HHMM.test(v)) err(`session.${k}`, 'Use HH:MM (24-hour)');
  }
  if ([start, end, exitTime].every((v) => typeof v === 'string' && HHMM.test(v))) {
    if (toMinutes(start) >= toMinutes(end)) err('session.end', 'Session must end after it starts');
    if (toMinutes(exitTime) < toMinutes(start) || toMinutes(exitTime) > toMinutes(end)) {
      err('session.exitTime', 'Exit time must be inside the session');
    }
  }

  if (!isInt(config.risk.lots, 1, 1000)) err('risk.lots', 'Lots must be 1–1000');
  if (!isInt(config.risk.lotSize, 1, 100000)) err('risk.lotSize', 'Lot size must be a positive whole number');

  config.alerts.touch = !!config.alerts.touch;
  config.alerts.confirmed = !!config.alerts.confirmed;

  return { config, errors };
}

/** "HMA 50/200" when both lines share a type, else "HMA 50 + SMA 200". */
export function describeTrend(t) {
  const f = INDICATOR_LABEL[t.fastType || 'hma'];
  const s = INDICATOR_LABEL[t.slowType || 'hma'];
  return f === s ? `${f} ${t.fastPeriod}/${t.slowPeriod}` : `${f} ${t.fastPeriod} + ${s} ${t.slowPeriod}`;
}

/** Human summary for list rows, e.g. "GIFTNIFTY · 15m · HMA 50/200 · 6 setups". */
export function describeConfig(c) {
  const tf = c.timeframe === 'minute' ? '1m' : c.timeframe.replace('minute', 'm');
  return `${c.instrument.symbol} · ${tf} · ${describeTrend(c.trend)} · ${c.setups.length} setup${c.setups.length === 1 ? '' : 's'}`;
}

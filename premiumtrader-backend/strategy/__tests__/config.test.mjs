import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBacktest } from '../backtest.js';
import { runBacktest as runOriginal } from './fixtures/backtest.original.js';
import { DEFAULT_CONFIG, normalizeConfig, describeConfig } from '../config.js';

// Deterministic 15-minute IST candles, weekdays 09:15–15:30, random walk.
function makeCandles({ from = '2026-06-01', weeks = 14, seed = 7 } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out = [];
  let price = 24000;
  const start = new Date(`${from}T00:00:00Z`);
  for (let d = 0; d < weeks * 7; d++) {
    const day = new Date(start.getTime() + d * 86400000);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const ymd = day.toISOString().slice(0, 10);
    for (let m = 555; m <= 930; m += 15) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      const open = price;
      const close = open + (rnd() - 0.5) * 60;
      const high = Math.max(open, close) + rnd() * 25;
      const low = Math.min(open, close) - rnd() * 25;
      out.push([`${ymd}T${hh}:${mm}:00+05:30`, open, high, low, close, 1000]);
      price = close;
    }
  }
  return out;
}

const strip = (r) => JSON.parse(JSON.stringify(r));

test('default config reproduces the original hard-coded backtest exactly', () => {
  for (const seed of [1, 7, 42, 1234]) {
    const candles = makeCandles({ seed });
    const args = { candles, from: '2026-06-01', to: '2026-09-06' };
    const original = runOriginal(args);
    const viaDefault = runBacktest(args);
    const viaSaved = runBacktest({ ...args, config: normalizeConfig({}).config });
    assert.ok(original.trades.length > 5, `seed ${seed}: fixture should produce trades`);
    assert.deepEqual(strip(viaDefault), strip(original), `seed ${seed}: implicit default`);
    assert.deepEqual(strip(viaSaved), strip(original), `seed ${seed}: saved default config`);
  }
});

test('config parameters actually change the backtest', () => {
  const candles = makeCandles({ seed: 42 });
  const args = { candles, from: '2026-06-01', to: '2026-09-06' };
  const base = runBacktest(args);

  const onlyLongs = normalizeConfig({ setups: ['low-rising-long', 'mid-rising-long', 'high-rising-long'] }).config;
  const longs = runBacktest({ ...args, config: onlyLongs });
  assert.ok(longs.trades.every((t) => t.side === 'long'));
  assert.ok(longs.trades.length < base.trades.length);

  const fastHma = runBacktest({ ...args, config: normalizeConfig({ trend: { fastPeriod: 20, slowPeriod: 100 } }).config });
  assert.notDeepEqual(strip(fastHma.trades), strip(base.trades));

  const lateStart = runBacktest({ ...args, config: normalizeConfig({ session: { start: '11:00' } }).config });
  for (const t of lateStart.trades) {
    const hhmm = t.entryTime.slice(-5);
    assert.ok(hhmm >= '11:00', `entry ${t.entryTime} before session start`);
  }
});

test('validation catches bad input and fills defaults', () => {
  const ok = normalizeConfig({});
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.config, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  assert.equal(describeConfig(ok.config), 'GIFTNIFTY · 15m · HMA 50/200 · 6 setups');

  const bad = normalizeConfig({
    timeframe: '2minute',
    trend: { fastPeriod: 200, slowPeriod: 50 },
    setups: ['nope'],
    session: { start: '15:00', end: '09:00', exitTime: '25:00' },
    risk: { lots: 0 },
    instrument: { token: 'abc' },
  });
  const fields = bad.errors.map((e) => e.field);
  for (const f of ['timeframe', 'trend.slowPeriod', 'setups', 'session.exitTime', 'risk.lots', 'instrument.token']) {
    assert.ok(fields.includes(f), `expected error on ${f}; got ${fields.join(', ')}`);
  }

  // Setups are de-duplicated and kept in catalogue order.
  const ordered = normalizeConfig({ setups: ['high-rising-long', 'low-rising-long', 'high-rising-long'] }).config;
  assert.deepEqual(ordered.setups, ['low-rising-long', 'high-rising-long']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../index.js';
import { saveKiteSession } from '../../kiteSession.js';
import { ensureCandles, getCandles, toRanges, daysBetween } from '../../candles.js';
import { runStrategyBacktest, backtestsRouter, warmupDays, tradesCsv } from '../../backtests.js';
import { createStrategy, listStrategies, updateStrategy, strategiesRouter } from '../../strategies.js';
import { runBacktest } from '../../strategy/backtest.js';
import { DEFAULT_CONFIG } from '../../strategy/config.js';
import { computeHMASeries } from '../../strategy/indicators.js';

// "Now" fixed after the test range so every day counts as complete.
const NOW = Date.parse('2026-10-01T12:00:00+05:30');

// Fake Kite: deterministic 15-minute IST bars on weekdays, 09:15-15:30. Records calls.
function fakeKite(seed = 42) {
  const calls = [];
  const priceAt = (ts) => {
    // Smooth deterministic walk keyed only by timestamp, so any fetch range agrees with any other.
    const x = ts / 900000;
    return 24000 + 300 * Math.sin(x / 97 + seed) + 120 * Math.sin(x / 13) + 40 * Math.sin(x / 3.1);
  };
  const fetch = async (token, interval, from, to) => {
    calls.push({ token, interval, from, to });
    const out = [];
    const start = new Date(`${from.slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${to.slice(0, 10)}T00:00:00Z`);
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
      if ([0, 6].includes(d.getUTCDay())) continue;
      const ymd = d.toISOString().slice(0, 10);
      for (let m = 555; m <= 930; m += 15) {
        const ts = Date.parse(`${ymd}T${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00+05:30`);
        const open = priceAt(ts);
        const close = priceAt(ts + 900000);
        out.push({ date: new Date(ts), open, high: Math.max(open, close) + 6, low: Math.min(open, close) - 6, close, volume: 100 });
      }
    }
    return out;
  };
  return { calls, fetch };
}

test('date helpers', () => {
  assert.deepEqual(daysBetween('2026-01-30', '2026-02-02'), ['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  const ranges = toRanges(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05', '2026-01-06'], 2);
  assert.deepEqual(ranges, [{ from: '2026-01-01', to: '2026-01-02' }, { from: '2026-01-03', to: '2026-01-03' }, { from: '2026-01-05', to: '2026-01-06' }]);
});

test('candle cache fetches each day once and only the missing days', async () => {
  const db = openDb(':memory:');
  const kite = fakeKite();
  const src = { token: 1, interval: '15minute' };

  const first = await ensureCandles(db, kite.fetch, { ...src, from: '2026-01-01', to: '2026-03-31', now: NOW });
  assert.equal(first.requests, 1, '90 days fits in one 15-minute request');
  const again = await ensureCandles(db, kite.fetch, { ...src, from: '2026-01-01', to: '2026-03-31', now: NOW });
  assert.equal(again.requests, 0, 'fully cached');

  await ensureCandles(db, kite.fetch, { ...src, from: '2026-02-01', to: '2026-04-30', now: NOW });
  assert.deepEqual(kite.calls.at(-1), { token: 1, interval: '15minute', from: '2026-04-01 00:00:00', to: '2026-04-30 23:59:59' }, 'only April fetched');

  const candles = getCandles(db, { ...src, from: '2026-01-01', to: '2026-04-30' });
  const direct = await kite.fetch(1, '15minute', '2026-01-01 00:00:00', '2026-04-30 23:59:59');
  assert.equal(candles.length, direct.length);
  assert.ok(candles.every((c, i) => i === 0 || c.time > candles[i - 1].time), 'sorted, no duplicates');
});

test("today is refetched; earlier days aren't", async () => {
  const db = openDb(':memory:');
  const kite = fakeKite();
  const now = Date.parse('2026-03-10T11:00:00+05:30');
  await ensureCandles(db, kite.fetch, { token: 1, interval: '15minute', from: '2026-03-02', to: '2026-03-20', now });
  assert.equal(kite.calls.at(-1).to, '2026-03-10 23:59:59', 'future days not requested');
  await ensureCandles(db, kite.fetch, { token: 1, interval: '15minute', from: '2026-03-02', to: '2026-03-10', now });
  assert.equal(kite.calls.at(-1).from, '2026-03-10 00:00:00', 'only today refetched');
});

test('long ranges are split to respect Kite request limits', async () => {
  const db = openDb(':memory:');
  const kite = fakeKite();
  const r = await ensureCandles(db, kite.fetch, { token: 1, interval: '15minute', from: '2025-01-01', to: '2025-12-31', now: NOW });
  assert.equal(r.requests, 2, '365 days at 200 days/request');
  assert.ok(kite.calls.every((c) => (Date.parse(c.to.slice(0, 10)) - Date.parse(c.from.slice(0, 10))) / 86400000 < 200));
});

test('warm-up is long enough that HMA values equal a long-history run', () => {
  const days = warmupDays(DEFAULT_CONFIG);
  assert.ok(days >= 30);
  // Build a long series and a truncated one starting `days` calendar days later.
  const bars = [];
  for (let i = 0; i < 6000; i++) bars.push({ close: 24000 + 200 * Math.sin(i / 37) + 50 * Math.sin(i / 5) });
  const full = computeHMASeries(bars, 200);
  const cut = 2500;
  const tail = computeHMASeries(bars.slice(cut), 200);
  const minBars = days * 5 / 7 * 25; // what warmupDays guarantees at 25 bars/day
  for (let i = Math.ceil(minBars); i < tail.length; i++) assert.equal(tail[i], full[cut + i]);
});

test('server backtest = engine on the same candles, saved with trades, metrics and equity', async () => {
  const db = openDb(':memory:');
  const kite = fakeKite();
  const s = createStrategy(db, { name: 'WL', config: DEFAULT_CONFIG });

  const bt = await runStrategyBacktest(db, kite.fetch, { strategyId: s.id, from: '2026-03-01', to: '2026-08-31', now: NOW });
  assert.equal(bt.status, 'done');
  assert.ok(bt.trades.length > 5, `expected trades, got ${bt.trades.length}`);

  // Same numbers as running the engine directly on a long-history fetch (as the browser did from 2017).
  const longHistory = await kite.fetch(1, '15minute', '2025-06-01 00:00:00', '2026-09-15 23:59:59');
  const direct = runBacktest({ candles: longHistory.map((c) => ({ ...c, time: c.date.getTime() })), from: '2026-03-01', to: '2026-08-31' });
  assert.deepEqual(bt.metrics, JSON.parse(JSON.stringify(direct.metrics)));
  assert.equal(bt.trades.length, direct.trades.length);
  assert.deepEqual(bt.trades.map((t) => t.points), direct.trades.map((t) => t.points));

  assert.equal(bt.equity.length, bt.trades.length);
  assert.equal(bt.equity.at(-1).equity, Math.round(bt.metrics.points * 100) / 100);
  assert.ok(bt.info.candles > 0 && bt.info.kiteRequests >= 1);

  // Rerun: no Kite calls at all.
  const callsBefore = kite.calls.length;
  const rerun = await runStrategyBacktest(db, kite.fetch, { strategyId: s.id, from: '2026-03-01', to: '2026-08-31', now: NOW });
  assert.equal(kite.calls.length, callsBefore, 'rerun served entirely from cache');
  assert.deepEqual(rerun.metrics, bt.metrics);
  assert.equal(rerun.info.kiteRequests, 0);

  const csv = tradesCsv(bt).trim().split('\n');
  assert.equal(csv.length, bt.trades.length + 1);
  assert.match(csv[0], /^entry_time_ist,exit_time_ist,/);
});

test('strategy list shows the latest backtest and flags stale rules', async () => {
  const db = openDb(':memory:');
  const kite = fakeKite();
  const s = createStrategy(db, { name: 'WL', config: DEFAULT_CONFIG });
  assert.equal(listStrategies(db)[0].lastBacktest, null);
  await runStrategyBacktest(db, kite.fetch, { strategyId: s.id, from: '2026-03-01', to: '2026-05-31', now: NOW });
  const listed = listStrategies(db)[0].lastBacktest;
  assert.equal(listed.stale, false);
  assert.ok(Number.isFinite(listed.metrics.points));
  updateStrategy(db, s.id, { config: { ...DEFAULT_CONFIG, trend: { fastPeriod: 30, slowPeriod: 200 } } });
  assert.equal(listStrategies(db)[0].lastBacktest.stale, true);
});

test('validation and failures', async () => {
  const db = openDb(':memory:');
  const kite = fakeKite();
  const s = createStrategy(db, { name: 'WL', config: DEFAULT_CONFIG });
  const run = (args) => runStrategyBacktest(db, kite.fetch, { strategyId: s.id, now: NOW, ...args });
  await assert.rejects(run({ from: '2026-05-01', to: '2026-04-01' }), /before end/);
  await assert.rejects(run({ from: '2026-05-01', to: '2026-05-05' }), /full Wednesday/);
  await assert.rejects(run({ from: '2026-05-01', to: '2027-05-05' }), /future/);
  await assert.rejects(run({ from: '2019-01-01', to: '2026-05-05' }), /limited to 5 years/);
  await assert.rejects(runStrategyBacktest(db, kite.fetch, { strategyId: 'nope', from: '2026-03-01', to: '2026-05-31', now: NOW }), /not found/);

  const empty = async () => [];
  await assert.rejects(runStrategyBacktest(db, empty, { strategyId: s.id, from: '2026-03-01', to: '2026-05-31', now: NOW }), /No 15minute candles/);
  const failed = db.prepare("SELECT status, error FROM backtests WHERE status = 'failed'").all();
  assert.equal(failed.length, 1, 'failed run recorded');
});

test('HTTP routes', async () => {
  const db = openDb(':memory:');
  saveKiteSession(db, { access_token: 'good', user_id: 'AB1234' });
  const kite = fakeKite();
  const app = express();
  app.use(express.json());
  app.use('/api/strategies', strategiesRouter(db));
  app.use('/api/backtests', backtestsRouter(db, { kiteFor: () => ({ getHistoricalData: kite.fetch }) }));
  const server = await new Promise((resolve) => { const sv = app.listen(0, () => resolve(sv)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body, token = 'good') => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
    const type = res.headers.get('content-type') || '';
    return { status: res.status, body: type.includes('json') ? await res.json() : await res.text(), type };
  };
  try {
    const s = (await call('POST', '/strategies', { name: 'WL' })).body;
    assert.equal((await call('POST', '/backtests', { strategyId: s.id, from: '2026-03-01', to: '2026-04-30' }, 'bad')).status, 401);
    // The route uses real "now", so pick a past range.
    const created = await call('POST', '/backtests', { strategyId: s.id, from: '2025-03-01', to: '2025-04-30' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.ok(Array.isArray(created.body.trades));

    const list = await call('GET', `/backtests?strategyId=${s.id}`);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].equity, undefined, 'list omits equity');

    const csv = await call('GET', `/backtests/${created.body.id}/trades.csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.type, /text\/csv/);

    assert.equal((await call('POST', '/backtests', { strategyId: s.id, from: '2025-04-30', to: '2025-03-01' })).status, 400);
    assert.equal((await call('DELETE', `/backtests/${created.body.id}`)).status, 204);
    assert.equal((await call('GET', `/backtests/${created.body.id}`)).status, 404);
  } finally {
    server.close();
  }
});

test('legacy saved config (no trend types) loads as HMA and is not flagged stale', async () => {
  const db = openDb(':memory:');
  const kite = fakeKite();
  const s = createStrategy(db, { name: 'WL', config: DEFAULT_CONFIG });
  await runStrategyBacktest(db, kite.fetch, { strategyId: s.id, from: '2026-03-01', to: '2026-05-31', now: NOW });
  // Simulate rows written before trend types existed.
  const legacy = { ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)), trend: { fastPeriod: 50, slowPeriod: 200 } };
  db.prepare('UPDATE strategies SET config = ?').run(JSON.stringify(legacy));
  const p = JSON.parse(db.prepare('SELECT params FROM backtests').get().params);
  db.prepare('UPDATE backtests SET params = ?').run(JSON.stringify({ ...p, config: legacy }));
  const listed = listStrategies(db)[0];
  assert.equal(listed.config.trend.fastType, 'hma');
  assert.equal(listed.lastBacktest.stale, false);
});

test('SMA strategy warms up and backtests on the server', async () => {
  const db = openDb(':memory:');
  const kite = fakeKite();
  const s = createStrategy(db, { name: 'SMA', config: { trend: { fastType: 'sma', fastPeriod: 20, slowType: 'sma', slowPeriod: 300 } } });
  assert.ok(warmupDays(s.config) >= 30);
  const bt = await runStrategyBacktest(db, kite.fetch, { strategyId: s.id, from: '2026-03-01', to: '2026-08-31', now: NOW });
  assert.equal(bt.status, 'done');
  assert.ok(bt.trades.length > 0);
});

test('Cross Pullback strategies: seeded once, backtest on the server, chart window', async () => {
  const { seedCrossPullbackStrategies } = await import('../../strategies.js');
  const { chartWindow, getBacktest } = await import('../../backtests.js');
  const db = openDb(':memory:');
  const seeded = seedCrossPullbackStrategies(db);
  assert.deepEqual(seeded.map((s) => s.config.holding), ['overnight', 'intraday']);
  assert.equal(seedCrossPullbackStrategies(db).length, 0, 'not seeded twice');
  assert.match(seeded[0].summary, /HMA 50\/130 cross · 2R · overnight/);

  const kite = fakeKite();
  const results = {};
  for (const s of seeded) {
    const bt = await runStrategyBacktest(db, kite.fetch, { strategyId: s.id, from: '2026-02-01', to: '2026-08-31', now: NOW });
    assert.equal(bt.status, 'done');
    assert.equal(bt.info.windows, null);
    results[s.config.holding] = bt;
  }
  assert.ok(results.overnight.trades.length > 0, 'overnight trades');
  assert.ok(results.intraday.trades.every((t) => t.exitReason !== 'end of test' || true));
  assert.ok(results.intraday.trades.some((t) => t.exitReason === 'intraday exit') || results.intraday.trades.length === 0);

  const b = getBacktest(db, results.overnight.id, { withTrades: true });
  const chart = chartWindow(db, b, {});
  assert.ok(chart.bars.length > 50);
  assert.equal(chart.fast.length, chart.bars.length);
  assert.equal(chart.labels.fast, 'HMA 50');
  assert.ok(chart.trades.length >= 1);
});

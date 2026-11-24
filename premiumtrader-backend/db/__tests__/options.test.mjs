import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../index.js';
import { weekStart, resample, listLevelWeeks, chartData } from '../../options.js';

const IST = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh, mm) - 330 * 60000;

test('weeks start on Wednesday', () => {
  assert.equal(weekStart('2026-11-18'), '2026-11-18'); // Wed
  assert.equal(weekStart('2026-11-23'), '2026-11-18'); // Mon
  assert.equal(weekStart('2026-11-24'), '2026-11-18'); // Tue
  assert.equal(weekStart('2026-11-25'), '2026-11-25'); // next Wed
});

test('resample groups 5m bars into 15m buckets from 09:15 IST', () => {
  const bars = [0, 5, 10, 15, 20].map((m, i) => ({ ts: IST(2026, 11, 20, 9, 15 + m), open: 10 + i, high: 20 + i, low: 5 - i, close: 11 + i, volume: 1, oi: i }));
  const out = resample(bars, 15);
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].ts, out[0].open, out[0].high, out[0].low, out[0].close, out[0].volume, out[0].oi], [IST(2026, 11, 20, 9, 15), 10, 22, 3, 13, 3, 2]);
  assert.equal(out[1].ts, IST(2026, 11, 20, 9, 30));
});

test('levels are grouped by week with their 4 contracts; chart prefers 15m, falls back to 5m', () => {
  const db = openDb(':memory:');
  const c = db.prepare(`INSERT INTO option_contracts VALUES (?, ?, 'NIFTY', '2026-12-01', ?, ?, 75, 0)`);
  c.run(101, 'NIFTY26D0125150CE', 25150, 'CE');
  c.run(102, 'NIFTY26D0125150PE', 25150, 'PE');
  db.prepare(`INSERT INTO option_levels (cross_ts, day, side, level, touch_ts, until_ts, expiry, strike_below, strike_above, saved_at) VALUES (?, '2026-11-25', 'short', 25161.5, ?, NULL, '2026-12-01', 25150, 25200, 0)`).run(IST(2026, 11, 24, 17, 15), IST(2026, 11, 24, 20, 0));
  const ins = db.prepare(`INSERT INTO candles VALUES (?, ?, ?, 100, 110, 90, 105, 1, 5)`);
  ins.run(101, '15minute', IST(2026, 10, 1, 9, 15));
  ins.run(101, '15minute', IST(2026, 11, 25, 9, 15));
  for (let m = 0; m < 30; m += 5) ins.run(102, '5minute', IST(2026, 11, 25, 9, 15 + m));
  const [week] = listLevelWeeks(db, { today: '2026-11-26' });
  assert.equal(week.weekStart, '2026-11-25');
  assert.equal(week.current, true);
  // After a holiday-moved expiry (Mon 23 Nov), the next week starts the day after it.
  db.prepare(`INSERT INTO option_contracts VALUES (300, 'X', 'NIFTY', '2026-11-23', 25000, 'CE', 75, 0)`).run();
  assert.equal(listLevelWeeks(db, { today: '2026-11-24' })[0].weekStart, '2026-11-24');
  const [l] = week.levels;
  assert.deepEqual(l.contracts.map((x) => `${x.strike}${x.type}:${x.bars}`), ['25150CE:2', '25150PE:6', '25200CE:0', '25200PE:0']);
  assert.equal(l.saved, 2);
  assert.equal(l.historyFrom, IST(2026, 10, 1, 9, 15));
  const ce = chartData(db, { token: 101, minutes: 15 });
  assert.deepEqual([ce.sourceMinutes, ce.bars.length], [15, 2]);
  const pe = chartData(db, { token: 102, minutes: 5 });
  assert.deepEqual([pe.sourceMinutes, pe.bars.length], [5, 6]);
  assert.equal(chartData(db, { token: 999 }), null);
});

test('option stop-loss = lowest low in the previous stretch; entry = touch candle close (or next open)', async () => {
  const { optionStop } = await import('../../options.js');
  const db = openDb(':memory:');
  const ins = db.prepare(`INSERT INTO candles VALUES (201, '15minute', ?, ?, ?, ?, ?, 0, 0)`);
  // stretch: 24 Nov 10:00 → 25 Nov 10:00 cross; lows 120, 95, 110; touch at 25 Nov 11:05
  ins.run(IST(2026, 11, 24, 10, 0), 130, 140, 120, 135);
  ins.run(IST(2026, 11, 24, 14, 0), 100, 105, 95, 98);
  ins.run(IST(2026, 11, 25, 10, 0), 112, 118, 110, 115);
  ins.run(IST(2026, 11, 25, 10, 30), 90, 92, 80, 85); // after the cross: not in the stretch
  ins.run(IST(2026, 11, 25, 11, 0), 140, 150, 138, 142.5);
  const c = { token: 201, strike: 25150, type: 'CE', symbol: 'X', interval: '15minute' };
  const lvl = { touch_ts: IST(2026, 11, 25, 11, 5), cross_ts: IST(2026, 11, 25, 10, 0), stretch_from_ts: IST(2026, 11, 24, 10, 0) };
  const r = optionStop(db, c, lvl);
  assert.deepEqual([r.entry, r.entryBasis, r.sl, r.gap], [142.5, 'touch candle close', 95, 47.5]);
  const night = optionStop(db, c, { ...lvl, touch_ts: IST(2026, 11, 24, 20, 0) });
  assert.deepEqual([night.entry, night.entryBasis], [112, 'next open']);
});

test('one row per level; the latest short and long from before the week are carried over', () => {
  const db = openDb(':memory:');
  const lvl = db.prepare(`INSERT INTO option_levels (cross_ts, day, side, level, touch_ts, until_ts, expiry, strike_below, strike_above, saved_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)`);
  db.prepare(`INSERT INTO option_contracts VALUES (300, 'X', 'NIFTY', '2026-11-23', 25000, 'CE', 75, 0)`).run();
  // Older short (replaced), latest short Mon 23, older long Mon 16 — all carried into the 1 Dec week
  lvl.run(IST(2026, 11, 12, 10, 0), '2026-11-24', 'short', 25600, IST(2026, 11, 12, 11, 0), '2026-12-01', 25600, 25600);
  lvl.run(IST(2026, 11, 16, 10, 0), '2026-11-24', 'long', 25400, IST(2026, 11, 16, 12, 0), '2026-12-01', 25400, 25400);
  lvl.run(IST(2026, 11, 20, 23, 15), '2026-11-24', 'short', 25700, IST(2026, 11, 23, 10, 0), '2026-12-01', 25700, 25700);
  // A touch inside the week, valid on two days: still one row
  lvl.run(IST(2026, 11, 24, 2, 0), '2026-11-24', 'long', 25650, IST(2026, 11, 24, 9, 30), '2026-12-01', 25650, 25650);
  lvl.run(IST(2026, 11, 24, 2, 0), '2026-11-25', 'long', 25650, IST(2026, 11, 24, 9, 30), '2026-12-01', 25650, 25650);
  const [week] = listLevelWeeks(db, { today: '2026-11-25' });
  assert.equal(week.weekStart, '2026-11-24');
  assert.deepEqual(week.levels.map((l) => `${l.side}:${l.level}:${l.carried ? 'carried' : 'own'}`), ['long:25650:own', 'short:25700:carried', 'long:25400:carried']);
});

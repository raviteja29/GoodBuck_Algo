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
  db.prepare(`INSERT INTO option_levels VALUES (?, '2026-11-25', 'short', 25161.5, ?, NULL, '2026-12-01', 25150, 25200, 0)`).run(IST(2026, 11, 24, 17, 15), IST(2026, 11, 24, 20, 0));
  const ins = db.prepare(`INSERT INTO candles VALUES (?, ?, ?, 100, 110, 90, 105, 1, 5)`);
  ins.run(101, '15minute', IST(2026, 10, 1, 9, 15));
  ins.run(101, '15minute', IST(2026, 11, 25, 9, 15));
  for (let m = 0; m < 30; m += 5) ins.run(102, '5minute', IST(2026, 11, 25, 9, 15 + m));
  const [week] = listLevelWeeks(db);
  assert.equal(week.weekStart, '2026-11-25');
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

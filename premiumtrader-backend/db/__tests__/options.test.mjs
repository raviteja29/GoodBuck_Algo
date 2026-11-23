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

test('levels are grouped by week with saved band counts; chart serves saved contracts only', () => {
  const db = openDb(':memory:');
  db.prepare(`INSERT INTO option_contracts VALUES (101, 'NIFTY25N2325350CE', 'NIFTY', '2026-11-23', 25350, 'CE', 75, 0)`).run();
  db.prepare(`INSERT INTO option_levels VALUES (?, '2026-11-18', 'short', 25357.6, ?, NULL, '2026-11-23', 25350, 25400, 101, NULL, 0)`).run(IST(2026, 11, 17, 17, 15), IST(2026, 11, 17, 20, 0));
  const ins = db.prepare(`INSERT INTO candles VALUES (101, '5minute', ?, 100, 110, 90, 105, 1, 5)`);
  for (let m = 0; m < 30; m += 5) ins.run(IST(2026, 11, 18, 9, 15 + m));
  const [week] = listLevelWeeks(db);
  assert.equal(week.weekStart, '2026-11-18');
  assert.equal(week.weekEnd, '2026-11-24');
  const [l] = week.levels;
  assert.deepEqual([l.bandLow, l.bandHigh, l.bandSaved, l.bandTotal], [25100, 25650, 1, 24]);
  assert.deepEqual(l.contracts, [{ token: 101, strike: 25350, type: 'CE', bars: 6 }]);
  const chart = chartData(db, { token: 101, minutes: 15 });
  assert.equal(chart.bars.length, 2);
  assert.equal(chart.instrument.type, 'CE');
  assert.equal(chartData(db, { token: 999 }), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../index.js';
import { weekStartMs, buildWeeks, scoreWeek, similarWeeks, optionSimilarityStatus } from '../../similarity.js';

const IST = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh, mm) - 330 * 60000;

test('weeks start Wednesday 00:00 IST', () => {
  assert.equal(weekStartMs(IST(2026, 11, 24, 23, 0)), IST(2026, 11, 18, 0, 0)); // Tue
  assert.equal(weekStartMs(IST(2026, 11, 25, 0, 30)), IST(2026, 11, 25, 0, 0)); // Wed
});

test('identical shapes score higher than opposite ones; levels do not matter', () => {
  const mk = (base, sign) => {
    const bars = [];
    for (let h = 0; h < 30; h++) { const p = base * (1 + sign * 0.001 * Math.sin(h / 4) * h / 10); bars.push({ ts: IST(2026, 11, 18, 7, 0) + h * 3600e3, open: p, high: p, low: p, close: p }); }
    return buildWeeks(bars, bars.map(() => null), bars.map(() => null))[0];
  };
  const cur = mk(25000, 1), same = mk(20000, 1), opposite = mk(25000, -1);
  const a = scoreWeek(cur, same, 60), b = scoreWeek(cur, opposite, 60);
  assert.ok(a.score > b.score);
  assert.equal(a.parts.shape, 100);
});

test('similarWeeks finds the past week with the same pattern and reports what came next', () => {
  const db = openDb(':memory:');
  const ins = db.prepare(`INSERT INTO candles VALUES (291849, '15minute', ?, ?, ?, ?, ?, 0, NULL)`);
  // 30 weeks of 15m bars 07:00–23:45 on weekdays; week 20 copies the current week's shape.
  const start = IST(2026, 4, 29, 0, 0); // a Wednesday
  const now = IST(2026, 11, 26, 16, 0);  // Thu of the week starting 25 Nov
  const shape = (wk, t) => ((wk % 7) + 1) * Math.sin(t / (2.3 + (wk % 5) * 1.7)) * 20; // never the twin shape
  for (let t = start; t < now; t += 15 * 60000) {
    const d = new Date(t + 330 * 60000); const w = d.getUTCDay(); const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (w === 0 || w === 6 || m < 7 * 60) continue;
    const wk = Math.floor((t - start) / (7 * 86400000));
    const isCur = t >= IST(2026, 11, 25, 0, 0);
    const twin = wk === 20;
    const into = (t - weekStartMs(t)) / 3600e3;
    const p = 25000 + wk * 10 + ((isCur || twin) ? 120 * Math.sin(into / 5) : shape(wk, into));
    ins.run(t, p, p + 5, p - 5, p);
  }
  const r = similarWeeks(db, { now });
  assert.equal(r.status, 'ok');
  assert.equal(r.matches.length, 3);
  assert.equal(r.matches[0].weekStart, start + 20 * 7 * 86400000);
  assert.ok(['up', 'down', 'flat'].includes(r.matches[0].next.direction));
  assert.ok(r.matches[0].score >= r.matches[1].score);
  assert.deepEqual(optionSimilarityStatus(db), { status: 'collecting', weeksSaved: 0, weeksNeeded: 8 });
});

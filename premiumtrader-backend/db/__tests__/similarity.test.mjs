import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../index.js';
import { lastWeekWindow, rangeWindow, buildStretch, scoreWeek, similarWeeks, optionSimilarityStatus } from '../../similarity.js';

const IST = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh, mm) - 330 * 60000;

test('the window is the last 7 complete days (06:00 → 06:00 IST)', () => {
  // Wed 25 Nov: Wed 18 06:00 → Wed 25 06:00 (Wed 18 – Tue 24, Tue night included)
  assert.deepEqual(lastWeekWindow(IST(2026, 11, 25, 10, 0)), { start: IST(2026, 11, 18, 6, 0), end: IST(2026, 11, 25, 6, 0) });
  // Thu 26 Nov: Thu 19 – Wed 25
  assert.equal(lastWeekWindow(IST(2026, 11, 26, 9, 0)).start, IST(2026, 11, 19, 6, 0));
  // Thu 26 at 02:00 the Wed night session is still running: still Wed 18 – Tue 24
  assert.equal(lastWeekWindow(IST(2026, 11, 26, 2, 0)).start, IST(2026, 11, 18, 6, 0));
});

test('a chosen range: complete days only, 1–14 days, 06:00 → 06:00 IST', () => {
  const now = IST(2026, 11, 25, 10, 0);
  assert.deepEqual(rangeWindow({ from: '2026-11-18', to: '2026-11-24', now }), { start: IST(2026, 11, 18, 6, 0), end: IST(2026, 11, 25, 6, 0), from: '2026-11-18', to: '2026-11-24', lastDay: '2026-11-24' });
  assert.equal(rangeWindow({ now }).from, '2026-11-18'); // default: last 7 complete days
  assert.match(rangeWindow({ from: '2026-11-18', to: '2026-11-25', now }).error, /complete days/);
  assert.match(rangeWindow({ from: '2026-11-01', to: '2026-11-20', now }).error, /at most 14/);
  assert.match(rangeWindow({ from: '2026-11-20', to: '2026-11-19', now }).error, /on or after/);
  assert.equal(rangeWindow({ from: '2026-11-23', to: '2026-11-23', now }).end - IST(2026, 11, 23, 6, 0), 86400000);
});

test('identical shapes score higher than opposite ones; levels do not matter', () => {
  const mk = (base, sign) => {
    const bars = [];
    for (let h = 0; h < 30; h++) { const p = base * (1 + sign * 0.001 * Math.sin(h / 4) * h / 10); bars.push({ ts: IST(2026, 11, 18, 7, 0) + h * 3600e3, open: p, high: p, low: p, close: p }); }
    return buildStretch(bars, bars.map(() => null), bars.map(() => null), IST(2026, 11, 18, 6, 0), 7 * 86400000);
  };
  const cur = mk(25000, 1), same = mk(20000, 1), opposite = mk(25000, -1);
  const a = scoreWeek(cur, same, 60), b = scoreWeek(cur, opposite, 60);
  assert.ok(a.score > b.score);
  assert.equal(a.parts.shape, 100);
});

test('similarWeeks finds the past 7-day stretch with the same pattern as the last 7 days', () => {
  const db = openDb(':memory:');
  const ins = db.prepare(`INSERT INTO candles VALUES (291849, '15minute', ?, ?, ?, ?, ?, 0, NULL)`);
  // 30 weeks of 15m bars 07:00–23:45 on weekdays; the stretch 10 weeks before the window copies its shape.
  const now = IST(2026, 11, 26, 16, 0);              // Thu 26 Nov
  const winStart = IST(2026, 11, 19, 6, 0);          // window: Thu 19 – Wed 25
  const twinStart = winStart - 10 * 7 * 86400000;
  const W = 7 * 86400000;
  const shape = (wk, h) => ((wk % 7) + 1) * Math.sin(h / (2.3 + (wk % 5) * 1.7)) * 20; // never the twin shape
  for (let t = winStart - 30 * W; t < now; t += 15 * 60000) {
    const d = new Date(t + 330 * 60000); const w = d.getUTCDay(); const m = d.getUTCHours() * 60 + d.getUTCMinutes();
    if (w === 0 || w === 6 || m < 7 * 60) continue;
    const wk = Math.floor((t - winStart) / W) + 100;
    const into = ((t - winStart) % W + W) % W / 3600e3;
    const twin = (t >= winStart && t < winStart + W) || (t >= twinStart && t < twinStart + W);
    const p = 25000 + wk * 10 + (twin ? 120 * Math.sin(into / 5) : shape(wk, into));
    ins.run(t, p, p + 5, p - 5, p);
  }
  const r = similarWeeks(db, { now });
  assert.equal(r.status, 'ok');
  assert.equal(r.weekStart, winStart);
  assert.equal(r.matches.length, 3);
  assert.equal(r.matches[0].weekStart, twinStart);
  assert.ok(r.matches[0].score >= r.matches[1].score);
  assert.ok(r.matches.every((m) => m.weekStart < winStart));
  assert.deepEqual(optionSimilarityStatus(db), { status: 'collecting', weeksSaved: 0, weeksNeeded: 8 });
  // The same stretch picked by date later on gives the same best match; a 2-day range is low confidence.
  const later = similarWeeks(db, { now: now + 3 * 86400000, from: '2026-11-19', to: '2026-11-25' });
  assert.equal(later.matches[0].weekStart, twinStart);
  const two = similarWeeks(db, { now, from: '2026-11-23', to: '2026-11-24' });
  assert.equal(two.status, 'ok');
  assert.equal(two.lowConfidence, true);
  assert.ok(two.matches.every((m) => (m.weekStart - IST(2026, 11, 23, 6, 0)) % (7 * 86400000) === 0), 'same weekday');
});

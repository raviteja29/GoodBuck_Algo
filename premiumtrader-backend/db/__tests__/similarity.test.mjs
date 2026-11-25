import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../index.js';
import { lastWeekWindow, rangeWindow, dayProfiles, stretchOf, scoreWeek, similarWeeks, optionSimilarityStatus } from '../../similarity.js';

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
    for (let h = 0; h < 40; h++) { const p = base * (1 + sign * 0.001 * Math.sin(h / 4) * h / 10); bars.push({ ts: IST(2026, 11, 18, 7, 0) + h * 3600e3, open: p, high: p, low: p, close: p }); }
    return stretchOf(dayProfiles(bars, bars.map(() => null), bars.map(() => null)), 0, 2);
  };
  const cur = mk(25000, 1), same = mk(20000, 1), opposite = mk(25000, -1);
  const a = scoreWeek(cur, same, 60), b = scoreWeek(cur, opposite, 60);
  assert.ok(a.score > b.score);
  assert.equal(a.parts.shape, 100);
});

test('matches any run of the same number of trading days, whatever weekday it starts on', () => {
  const db = openDb(':memory:');
  const ins = db.prepare(`INSERT INTO candles VALUES (291849, '15minute', ?, ?, ?, ?, ?, 0, NULL)`);
  const now = IST(2026, 11, 26, 16, 0);     // Thu 26 Nov
  // Trading days (weekdays) for 30 weeks up to Wed 25 Nov, bars 07:00–23:45.
  const days = [];
  for (let d = IST(2026, 11, 25, 6, 0); days.length < 150; d -= 86400000) {
    const w = new Date(d + 330 * 60000).getUTCDay();
    if (w !== 0 && w !== 6) days.unshift(d);
  }
  const win = days.length - 5;               // the range: Thu 19 – Wed 25 = 5 trading days
  const twin = 62;                           // a run of 5 starting on another weekday
  const twinDay = new Date(days[twin] + 330 * 60000).getUTCDay();
  assert.notEqual(twinDay, 4, 'twin does not start on a Thursday');
  const shape = (k, h) => ((k % 7) + 1) * Math.sin((k * 24 + h) / (2.3 + (k % 5) * 1.7)) * 20;
  days.forEach((d0, k) => {
    for (let m = 60; m < 24 * 60 - 360; m += 15) {
      const t = d0 + m * 60000; const h = m / 60;
      const inWin = k >= win, inTwin = k >= twin && k < twin + 5;
      const off = inWin ? k - win : k - twin;
      const p = 25000 + k * 3 + ((inWin || inTwin) ? 120 * Math.sin((off * 24 + h) / 5) : shape(k, h));
      ins.run(t, p, p + 5, p - 5, p);
    }
  });
  const r = similarWeeks(db, { now, from: '2026-11-19', to: '2026-11-25' });
  assert.equal(r.status, 'ok');
  assert.equal(r.tradingDays, 5);
  assert.equal(r.matches.length, 3);
  assert.equal(r.matches[0].weekStart, days[twin]);
  assert.equal(r.matches[0].days.length, 5);
  assert.ok(r.matches[0].score >= r.matches[1].score);
  // The top matches don't overlap each other or the range.
  const idx = r.matches.map((m) => days.indexOf(m.weekStart));
  assert.ok(idx.every((a, i) => idx.every((b, k) => i === k || Math.abs(a - b) >= 5)));
  assert.ok(idx.every((a) => a + 5 <= win));
  const two = similarWeeks(db, { now, from: '2026-11-24', to: '2026-11-25' });
  assert.equal(two.lowConfidence, true);
  assert.deepEqual(optionSimilarityStatus(db), { status: 'collecting', weeksSaved: 0, weeksNeeded: 8 });
});

test('trading days: weekday full sessions only; runs never skip a holiday', async () => {
  const { weekdaysBetween } = await import('../../similarity.js');
  assert.equal(weekdaysBetween('2026-11-18', '2026-11-24'), 5); // Wed → Tue
  assert.equal(weekdaysBetween('2026-09-28', '2026-10-05'), 6); // Mon → Mon: with Fri 2 Oct a holiday this run is skipped
  const bar = (day, hh) => { const p = 25000 + hh; return { ts: Date.parse(`${day}T${String(hh).padStart(2, '0')}:30:00+05:30`), open: p, high: p, low: p, close: p }; };
  const bars = [];
  for (let hh = 7; hh < 23; hh++) bars.push(bar('2026-11-06', hh));   // Fri: full session
  for (let hh = 14; hh < 16; hh++) bars.push(bar('2026-11-08', hh));  // Sun: special session
  for (let hh = 7; hh < 23; hh++) bars.push(bar('2026-11-09', hh));   // Mon
  const days = dayProfiles(bars, bars.map(() => null), bars.map(() => null));
  assert.deepEqual(days.map((d) => d.day), ['2026-11-06', '2026-11-09']);
});

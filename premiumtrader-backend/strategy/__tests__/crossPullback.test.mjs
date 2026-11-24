import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCrossPullback } from '../rules/crossPullback.js';
import { normalizeConfig, describeConfig, DEFAULT_CROSS_CONFIG } from '../config.js';
import { runStrategy } from '../backtest.js';

const cfg = (over = {}) => normalizeConfig({ ...JSON.parse(JSON.stringify(DEFAULT_CROSS_CONFIG)), ...over }).config;

// Build bars 15 minutes apart from an IST start time; rows are [open, high, low, close, fast, slow].
function scenario(rows, start = '2026-03-02T10:00:00+05:30') {
  const t0 = Date.parse(start);
  const candles = rows.map(([o, h, l, c], i) => ({ time: t0 + i * 900000, open: o, high: h, low: l, close: c }));
  return { candles, series: { fast: rows.map((r) => r[4]), slow: rows.map((r) => r[5]) } };
}
const run = (rows, config = cfg(), start) => {
  const { candles, series } = scenario(rows, start);
  return runCrossPullback({ candles, from: '2026-01-01', to: '2026-12-31', config, series });
};
const brief = (t) => [t.setupKey, t.entryPrice, t.exitPrice, t.exitReason];

// Short scenario used by several tests.
//            open  high  low  close  fast  slow
const SHORT = [
  [100, 110, 95, 105, 110, 100],   // 0
  [105, 120, 100, 110, 111, 101],  // 1
  [110, 130, 105, 115, 112, 102],  // 2 highest high of the stretch: 130 = stop
  [115, 125, 108, 112, 113, 103],  // 3
  [112, 125, 100, 104, 112, 103.5],// 4 fast turns down
  [104, 115, 98, 100, 103, 103.8], // 5 fast (falling) crosses below slow -> short setup, stop 130
  [98, 101, 95, 97, 102, 104],     // 6 trigger = fast[5] = 103; high 101 -> no touch
  [99, 103, 97, 100, 100, 104],    // 7 fast still falling (102 < 103); trigger = fast[6] = 102; touches -> SHORT at 102; risk 28, target 46
  [80, 60, 45, 50, 98, 104],       // 8 low 45 <= 46 -> target
  [50, 101, 49, 90, 96, 104],      // 9 high 101 < 102 -> no re-entry
  [90, 104, 88, 100, 95, 104],     // 10 touches touch point 102 -> SHORT re-entry
  [100, 131, 99, 120, 94, 104],    // 11 high 131 >= 130 -> stop, setup dead
  [100, 105, 95, 100, 93, 104],    // 12 touch point again but setup is dead -> nothing
];

test('short: first touch, 2R target, re-entry at the touch point, stop ends the setup', () => {
  const r = run(SHORT);
  assert.deepEqual(r.trades.map(brief), [
    ['short-first', 102, 46, 'target'],
    ['short-reentry', 102, 130, 'stop'],
  ]);
  assert.equal(r.trades[0].stop, 130, 'stop = highest high of the previous stretch');
  assert.equal(r.trades[0].target, 46);
  assert.equal(r.trades[0].points, 56);
  assert.equal(r.trades[1].points, -28);
});

test('re-entries can be switched off', () => {
  const r = run(SHORT, cfg({ reentry: false }));
  assert.deepEqual(r.trades.map(brief), [['short-first', 102, 46, 'target']]);
});

test('target multiple is configurable', () => {
  const r = run(SHORT, cfg({ exits: { targetR: 1 } }));
  assert.equal(r.trades[0].target, 74); // 102 - 1 x 28
  assert.equal(r.trades[0].exitReason, 'target');
});

test('fallback stop = highest high since the previous cross when the lines never both rose', () => {
  const rows = [
    [100, 110, 95, 105, 110, 100],
    [105, 140, 100, 110, 109, 101], // fast falling, slow rising: never both rising
    [110, 120, 105, 115, 108, 102],
    [104, 115, 98, 100, 101, 103],  // cross (fast falling)
    [99, 102, 97, 100, 100, 104],   // touches 101
  ];
  const r = run(rows);
  assert.equal(r.trades[0].stop, 140);
});

test('every cross starts a setup; the first touch only counts once the fast line slopes the setup way', () => {
  //            open  high  low  close  fast  slow
  const rows = [
    [100, 110, 95, 105, 110, 100],
    [105, 120, 100, 110, 111, 112],  // 1 bearish cross while fast is RISING -> setup starts anyway (stop 120)
    [99, 112, 97, 100, 111.5, 113],  // 2 fast still rising (111 > 110): a touch of 111 does NOT count
    [100, 108, 99, 104, 111.2, 113], // 3 fast still rising at the last close (111.5 > 111): no touch counted (high 108 anyway)
    [104, 106, 100, 102, 110, 113],  // 4 fast now falling (111.2 < 111.5); trigger 111.2: high 106 -> no touch
    [102, 111, 101, 108, 109, 113],  // 5 fast falling (110 < 111.2); trigger 110: high 111 -> FIRST TOUCH at 110
  ];
  const r = run(rows);
  assert.equal(r.setups.length, 1);
  assert.equal(r.setups[0].slopedAtCross, false);
  assert.equal(r.setups[0].touch, 110);
  assert.equal(new Date(r.setups[0].touchTs).getTime(), Date.parse('2026-03-02T10:00:00+05:30') + 5 * 900000);
});

test('setup waits if the fast line turns back before the touch', () => {
  const rows = [
    ...SHORT.slice(0, 6),
    [98, 99, 95, 97, 99, 104],   // trigger 102, no touch; fast falling
    [97, 99, 95, 98, 100, 104],  // fast turns UP (still below slow); trigger 99 -> high 99 touches!
  ];
  const r = run(rows);
  assert.equal(r.trades.length, 1);
  assert.equal(r.trades[0].entryPrice, 99, 'enters at the fast line value of the last completed bar');
  assert.equal(r.trades[0].exitReason, 'end of test');
});

test('opposite entry closes the open trade and reverses', () => {
  const rows = [
    ...SHORT.slice(0, 8),             // short open at 102, stop 130, target 46
    [99, 101, 90, 95, 99, 100],       // 8 nothing
    [95, 100, 92, 99, 101, 100.5],    // 9 fast (rising) crosses above slow -> long setup
    [99, 102, 94, 97, 102, 101],      // 10 trigger = fast[9] = 101: bar trades 101 -> LONG at 101, short reversed at 101
  ];
  const r = run(rows);
  assert.deepEqual(r.trades.map(brief), [
    ['short-first', 102, 101, 'reversal'],
    ['long-first', 101, 97, 'end of test'],
  ]);
});

test('conservative intrabar handling: entry bar that also hits the stop is a stop-out; no target in the entry bar', () => {
  const stopSameBar = [...SHORT.slice(0, 7), [99, 131, 40, 100, 100, 104]]; // touches 102, reaches 130 and 46 in one bar
  assert.deepEqual(run(stopSameBar).trades.map(brief), [['short-first', 102, 130, 'stop']]);
  const targetSameBar = [...SHORT.slice(0, 7), [99, 103, 40, 100, 100, 104], [44, 50, 40, 45, 99, 104]];
  assert.deepEqual(run(targetSameBar).trades.map(brief), [['short-first', 102, 44, 'target']], 'target waits for the next bar; a gap through it fills at the open');
});

test('intraday mode: flat at 15:15, no entries until 09:15', () => {
  // Same short scenario, but starting so that bar 7 (the entry) is at 15:00 and bar 8 at 15:15.
  const rows = SHORT.slice(0, 9).map((r, i) => (i === 8 ? [100, 101, 99, 100, 98, 104] : r));
  const intraday = run(rows, cfg({ holding: 'intraday' }), '2026-03-02T13:15:00+05:30');
  assert.deepEqual(intraday.trades.map(brief), [['short-first', 102, 100, 'intraday exit']]);
  const overnight = run(rows, cfg({ holding: 'overnight' }), '2026-03-02T13:15:00+05:30');
  assert.equal(overnight.trades[0].exitReason, 'end of test');

  // A touch after 15:15 is ignored in intraday mode.
  const late = run(SHORT.slice(0, 8), cfg({ holding: 'intraday' }), '2026-03-02T13:30:00+05:30');
  assert.equal(late.trades.length, 0);
});

test('config: defaults, validation, summary', () => {
  const c = normalizeConfig({ type: 'hma-cross-pullback' });
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.config, JSON.parse(JSON.stringify(DEFAULT_CROSS_CONFIG)));
  assert.equal(describeConfig(c.config), 'GIFTNIFTY · 15m · HMA 50/130 cross · 2R · overnight');
  const bad = normalizeConfig({ type: 'hma-cross-pullback', exits: { targetR: 0 }, holding: 'weekly', session: { start: '09:15', end: '15:30', exitTime: '16:00' } });
  const fields = bad.errors.map((e) => e.field);
  for (const f of ['exits.targetR', 'holding', 'session.exitTime']) assert.ok(fields.includes(f), f);
  assert.ok(normalizeConfig({ type: 'nope' }).errors.some((e) => e.field === 'type'));
});

test('runs end to end on generated candles with real HMAs', () => {
  const candles = [];
  const t0 = Date.parse('2026-01-05T09:15:00+05:30');
  for (let i = 0; i < 6000; i++) {
    const ts = t0 + i * 900000;
    const p = 24000 + 400 * Math.sin(i / 120) + 80 * Math.sin(i / 17);
    const q = 24000 + 400 * Math.sin((i + 1) / 120) + 80 * Math.sin((i + 1) / 17);
    candles.push({ time: ts, open: p, high: Math.max(p, q) + 10, low: Math.min(p, q) - 10, close: q });
  }
  const r = runStrategy({ candles, from: '2026-02-01', to: '2026-03-31', config: cfg() });
  assert.ok(r.trades.length > 3, `trades: ${r.trades.length}`);
  assert.ok(r.setups.length > 1);
  for (const t of r.trades) {
    assert.ok(t.side === 'short' ? t.stop > t.entryPrice || t.exitReason !== 'target' : true);
    assert.ok(Number.isFinite(t.points));
  }
  const keys = new Set(r.summary.map((s) => s.setupKey));
  assert.ok([...keys].every((k) => /^(short|long)-(first|reentry)$/.test(k)));
});

// ---------- chart hours vs trading hours (GIFT NIFTY trades ~06:30-02:45) ----------

test('first touch outside trading hours fixes the touch point; the trade waits for trading hours and that price', () => {
  // The user's 20 Nov example: the first touch happens overnight at 25,455; by 09:15
  // the fast line is at 25,361, but the trade must still be at 25,455.
  const rows = [
    [25600, 25700, 25550, 25650, 25600, 25500], // 0  20:00 both rising
    [25650, 25800, 25600, 25700, 25610, 25510], // 1  20:15 both rising - swing high 25,800
    [25700, 25720, 25500, 25520, 25560, 25515], // 2  20:30 fast turns down
    [25520, 25530, 25400, 25420, 25490, 25518], // 3  20:45 bear cross -> short setup, stop 25,800
    [25420, 25450, 25380, 25400, 25455, 25519], // 4  21:00 trigger 25,490: no touch
    [25400, 25470, 25390, 25440, 25440, 25519], // 5  21:15 trigger 25,455: TOUCH (outside hours) -> touch point 25,455
  ];
  // ...then overnight bars, then the next morning:
  const t0 = Date.parse('2026-11-19T20:00:00+05:30');
  const candles = rows.map(([o, h, l, c], i) => ({ time: t0 + i * 900000, open: o, high: h, low: l, close: c }));
  const fastS = rows.map((r) => r[4]);
  const slowS = rows.map((r) => r[5]);
  const morning = Date.parse('2026-11-20T09:15:00+05:30');
  const next = [
    [25350, 25380, 25300, 25361, 25361, 25520], // 09:15 fast line now 25,361 - NOT a trade (price below 25,455)
    [25361, 25420, 25340, 25400, 25365, 25520], // 09:30 still below 25,455
    [25400, 25460, 25390, 25430, 25370, 25520], // 09:45 reaches 25,455 -> SHORT at 25,455
  ];
  next.forEach(([o, h, l, c, f, sl], k) => { candles.push({ time: morning + k * 900000, open: o, high: h, low: l, close: c }); fastS.push(f); slowS.push(sl); });

  for (const holding of ['overnight', 'intraday']) {
    const r = runCrossPullback({ candles, from: '2026-11-01', to: '2026-11-30', config: cfg({ holding }), series: { fast: fastS, slow: slowS } });
    assert.equal(r.trades.length, 1, holding);
    const t = r.trades[0];
    assert.equal(t.setupKey, 'short-first');
    assert.equal(t.entryPrice, 25455, `${holding}: entry at the overnight touch point, not the 09:15 line`);
    assert.equal(t.touchPoint, 25455);
    assert.equal(t.stop, 25800);
    assert.equal(new Date(t.entryTs).toISOString(), '2026-11-20T04:15:00.000Z', 'entered at 09:45 IST');
  }
});

test('stop breached outside trading hours ends the setup; open trades exit at the next session open', () => {
  const rows = [...SHORT.slice(0, 8)]; // from 10:00 IST: bar 7 (11:45) shorts at 102, stop 130
  const t0 = Date.parse('2026-03-02T10:00:00+05:30');
  const candles = rows.map(([o, h, l, c], i) => ({ time: t0 + i * 900000, open: o, high: h, low: l, close: c }));
  const fastS = rows.map((r) => r[4]);
  const slowS = rows.map((r) => r[5]);
  // Overnight bar at 22:00 breaches the stop (130) and comes back; next morning opens at 140.
  candles.push({ time: Date.parse('2026-03-02T22:00:00+05:30'), open: 100, high: 135, low: 99, close: 110 }); fastS.push(99); slowS.push(104);
  candles.push({ time: Date.parse('2026-03-03T09:15:00+05:30'), open: 140, high: 141, low: 100, close: 120 }); fastS.push(98); slowS.push(104);
  const r = runCrossPullback({ candles, from: '2026-01-01', to: '2026-12-31', config: cfg(), series: { fast: fastS, slow: slowS } });
  assert.deepEqual(r.trades.map(brief), [['short-first', 102, 140, 'stop']], 'no exit at night; exits at the 09:15 open past the stop');

  // Flat setup: an overnight breach kills further re-entries.
  const flat = [...SHORT.slice(0, 9)]; // short 102 -> target 46 at bar 8 (12:00)
  const c2 = flat.map(([o, h, l, c], i) => ({ time: t0 + i * 900000, open: o, high: h, low: l, close: c }));
  const f2 = flat.map((x) => x[4]); const s2 = flat.map((x) => x[5]);
  c2.push({ time: Date.parse('2026-03-02T22:00:00+05:30'), open: 100, high: 131, low: 99, close: 100 }); f2.push(97); s2.push(104);
  c2.push({ time: Date.parse('2026-03-03T09:15:00+05:30'), open: 95, high: 103, low: 94, close: 100 }); f2.push(96); s2.push(104);
  const r2 = runCrossPullback({ candles: c2, from: '2026-01-01', to: '2026-12-31', config: cfg(), series: { fast: f2, slow: s2 } });
  assert.deepEqual(r2.trades.map(brief), [['short-first', 102, 46, 'target']], 'no re-entry at 102 after the overnight breach');
});

test('entry only AT the touch point: no fill at the open when price gaps past it', () => {
  // Short setup from SHORT[0..5]; fast line held at 25455-equivalent (102).
  // Bar 6 gaps ABOVE the line and never trades 102 -> touch point fixed at 102, but no trade.
  // Bar 7 still above. Bar 8 trades down through 102 -> short at exactly 102.
  const rows = [
    ...SHORT.slice(0, 5),
    [104, 115, 98, 100, 102, 103.8], // 5 cross with the fast line at 102 (falling)
    [104, 108, 103, 105, 102, 104],  // 6 trigger fast[5]=102: high>=102 (touched) but low 103 > 102 -> no fill
    [105, 107, 103.5, 104, 102, 104],// 7 still above the touch point
    [104, 104.5, 99, 100, 101, 104], // 8 trades 102 -> SHORT at 102 (not at the 104 open)
  ];
  const r = run(rows);
  assert.deepEqual(r.trades.map(brief), [['short-first', 102, 100, 'end of test']]);
  assert.equal(r.trades[0].touchPoint, 102);
  assert.equal(r.trades[0].target, 46, 'target from the touch point: 102 - 2 x (130 - 102)');
});

test('20 Nov case: night-session touch fixes 25455; morning open at 25361 does not trade until price returns to 25455', () => {
  const T = (t) => Date.parse(`${t}+05:30`);
  //  IST time               open   high   low    close  fast   slow
  const bars = [
    ['2026-11-19T21:00:00', 25500, 25560, 25480, 25540, 25520, 25400],
    ['2026-11-19T21:15:00', 25540, 25600, 25520, 25580, 25530, 25410], // both lines rising -> swing high 25600 (stop)
    ['2026-11-19T21:30:00', 25580, 25590, 25500, 25510, 25525, 25415], // fast turns down
    ['2026-11-19T21:45:00', 25510, 25520, 25380, 25400, 25458, 25460], // fast (falling) crosses below slow -> short setup
    ['2026-11-19T22:00:00', 25400, 25430, 25350, 25420, 25455, 25462], // line 25458: high 25430 -> no touch yet; fast still falling
    ['2026-11-19T22:15:00', 25420, 25470, 25410, 25440, 25450, 25463], // NIGHT touch of 25455 (fast fell 25458 -> 25455) -> touch point fixed, no trade (outside hours)
    ['2026-11-20T09:15:00', 25361, 25400, 25330, 25390, 25420, 25466], // session opens at 25361 -> NO trade at 25361
    ['2026-11-20T09:30:00', 25390, 25430, 25380, 25420, 25410, 25467], // still below 25455
    ['2026-11-20T09:45:00', 25420, 25470, 25410, 25450, 25405, 25468], // trades 25455 -> SHORT at 25455
  ];
  const candles = bars.map(([t, o, h, l, c]) => ({ time: T(t), open: o, high: h, low: l, close: c }));
  const series = { fast: bars.map((b) => b[5]), slow: bars.map((b) => b[6]) };
  const r = runCrossPullback({ candles, from: '2026-11-01', to: '2026-11-30', config: cfg(), series });
  assert.equal(r.trades.length, 1, JSON.stringify(r.trades.map(brief)));
  assert.equal(r.trades[0].entryPrice, 25455);
  assert.equal(r.trades[0].touchPoint, 25455);
  assert.equal(r.trades[0].stop, 25600);
  assert.equal(new Date(r.trades[0].entryTs + 330 * 60000).toISOString().slice(11, 16), '09:45');
});

// ---------- MA overlay (analysis only) ----------
import { annotateWithOverlay, buildOverlaySummary } from '../backtest.js';

test('MA overlay is recorded live at first touch, entry and exit, and never changes trades', () => {
  const candles = waveCandles();
  const args = { candles, from: '2026-02-01', to: '2026-03-31' };
  const withMa = runStrategy({ ...args, config: cfg() });
  const without = runStrategy({ ...args, config: cfg({ overlay: { enabled: false } }) });
  const core = (r) => r.trades.map((t) => { const c = { ...t }; delete c.overlay; return c; });
  assert.deepEqual(core(withMa), core(without), 'trades identical with or without the MA');
  assert.ok(withMa.trades.length > 0 && withMa.trades.every((t) => t.overlay.label === 'SMA 50'));

  // Live SMA 50 = (49 completed closes + the current price) / 50.
  const live = (ts, price) => {
    const i = candles.findIndex((c) => c.time >= ts);
    return Math.round(((candles.slice(i - 49, i).reduce((s, c) => s + c.close, 0) + price) / 50) * 100) / 100;
  };
  const t = withMa.trades[0];
  assert.equal(t.overlay.atEntry, live(t.entryTs, t.entryPrice));
  assert.equal(t.overlay.atExit, live(t.exitTs, t.exitPrice));
  assert.equal(t.overlay.atTouch, live(t.touchTs, t.touchMarket));
  assert.equal(t.overlay.touchVsLine, Math.round((t.touchMarket - t.overlay.atTouch) * 100) / 100);

  const groups = withMa.overlaySummary;
  assert.equal(groups.reduce((n, g) => n + g.trades, 0), withMa.trades.length, 'every trade lands in one group');
  assert.ok(groups.every((g) => /^(Long|Short) · SMA 50 (above both|between the lines|below both)$/.test(g.name)), groups.map((g) => g.name).join());

  // SMA 50 against live HMA 50 & HMA 130 at entry.
  const closes = candles.map((c) => c.close);
  for (const tr of withMa.trades) {
    const i = candles.findIndex((c) => c.time >= tr.entryTs);
    const at = (type, n) => { const l = liveLineAt(closes, type, n, i); return Math.round((l.a + l.b * tr.entryPrice) * 100) / 100; };
    const [ma, f, sl] = [at('sma', 50), at('hma', 50), at('hma', 130)];
    assert.equal(tr.overlay.fastAtEntry, f);
    assert.equal(tr.overlay.slowAtEntry, sl);
    const want = ma > Math.max(f, sl) ? 'above-both' : ma < Math.min(f, sl) ? 'below-both' : 'between';
    assert.equal(tr.overlay.entryPosition, want);
  }
  assert.equal(without.overlaySummary, undefined);
  assert.ok(typeof annotateWithOverlay === 'function' && typeof buildOverlaySummary === 'function');
});

// ---------- Live HMA touch (what TradingView shows while the candle forms) ----------
import { computeHMASeries, computeSMASeries, liveLineAt, liveMeetingPrice } from '../indicators.js';

function waveCandles(n = 6000) {
  const candles = [];
  const t0 = Date.parse('2026-01-05T09:15:00+05:30');
  for (let i = 0; i < n; i++) {
    const p = 24000 + 400 * Math.sin(i / 120) + 80 * Math.sin(i / 17);
    const q = 24000 + 400 * Math.sin((i + 1) / 120) + 80 * Math.sin((i + 1) / 17);
    candles.push({ time: t0 + i * 900000, open: p, high: Math.max(p, q) + 10, low: Math.min(p, q) - 10, close: q });
  }
  return candles;
}

test('live line is exact: line(close) reproduces the series value at every bar', () => {
  const candles = waveCandles(400);
  const closes = candles.map((c) => c.close);
  for (const [type, series] of [['hma', computeHMASeries(candles, 50)], ['sma', computeSMASeries(candles, 50)]]) {
    for (let i = 0; i < closes.length; i++) {
      const live = liveLineAt(closes, type, 50, i);
      if (series[i] == null) { assert.equal(live, null); continue; }
      assert.ok(Math.abs(live.a + live.b * closes[i] - series[i]) < 1e-6, `${type} bar ${i}`);
    }
  }
});

test('touch point = the live HMA 50 at the moment price meets it (not the last completed value)', () => {
  const candles = waveCandles();
  const r = runCrossPullback({ candles, from: '2026-02-01', to: '2026-03-31', config: cfg() });
  assert.ok(r.trades.length > 0);
  const closes = candles.map((c) => c.close);
  const firsts = r.trades.filter((t) => t.setupKey.endsWith('first'));
  for (const t of firsts) {
    const i = candles.findIndex((c) => c.time === t.touchTs);
    const live = liveLineAt(closes, 'hma', 50, i);
    // Had the candle closed at the touch point, HMA 50 would equal the touch point.
    assert.ok(Math.abs(live.a + live.b * t.touchMarket - t.touchPoint) < 0.01, `touch ${t.touchTime}`);
    const meet = liveMeetingPrice(live);
    if (t.touchMarket === t.touchPoint) assert.ok(Math.abs(meet - t.touchPoint) < 0.01);
  }
  // On a moving line the live value differs from the last completed bar's value.
  const differs = firsts.some((t) => { const i = candles.findIndex((c) => c.time === t.touchTs); return Math.abs(r.series.fast[i - 1] - t.touchPoint) > 0.5; });
  assert.ok(differs, 'live touch differs from the previous-bar HMA');
});

// ---------- Red-candle stop ----------
const RED = { exits: { targetR: 2, afterStop: 'red-candle' } };
const upToReentry = SHORT.slice(0, 11); // ... short re-entry at 102 on row 10 (stop 130, target 46)

test('red-candle stop: breach does not exit; passing the first red candle high exits there and ends the setup', () => {
  const rows = [
    ...upToReentry,
    [100, 131, 99, 120, 94, 104],  // 11 breaches 130 - green, keep holding
    [120, 140, 118, 125, 93, 104], // 12 green
    [125, 135, 115, 118, 93, 104], // 13 first red candle after the breach -> level 135
    [118, 134, 110, 130, 93, 104], // 14 high 134 < 135 -> hold
    [130, 136, 128, 133, 93, 104], // 15 passes 135 -> exit at 135
    [100, 105, 95, 100, 93, 104],  // 16 touch point again - setup finished, no trade
  ];
  const r = run(rows, cfg(RED));
  assert.deepEqual(r.trades.map(brief), [
    ['short-first', 102, 46, 'target'],
    ['short-reentry', 102, 135, 'red candle'],
  ]);
  assert.equal(r.trades[1].redCandleLevel, 135);
  assert.equal(r.trades[1].points, -33);
  // The exit-at-stop version of the same chart exits at 130.
  assert.deepEqual(run(rows).trades.map(brief)[1], ['short-reentry', 102, 130, 'stop']);
});

test('red-candle stop: if the red candle high is never passed, the trade runs to its 2R target', () => {
  const rows = [
    ...upToReentry,
    [100, 131, 99, 120, 94, 104], // 11 breach
    [125, 128, 100, 105, 93, 104], // 12 red -> level 128
    [105, 120, 40, 45, 92, 104],   // 13 low 40 <= 46 -> target
    [90, 104, 88, 100, 91, 104],   // 14 back at the touch point - setup ended at the breach
  ];
  const r = run(rows, cfg(RED));
  assert.deepEqual(r.trades.map(brief), [
    ['short-first', 102, 46, 'target'],
    ['short-reentry', 102, 46, 'target'],
  ]);
});

test('red-candle stop: an opposite cross does not reverse a breached short', () => {
  const rows = [
    ...upToReentry,
    [100, 131, 99, 120, 94, 104],     // 11 breach
    [120, 125, 118, 124, 106, 104],   // 12 fast crosses ABOVE slow (rising) -> long setup
    [124, 126, 100, 110, 104.5, 104], // 13 would touch the long line (106) - short is active, no long
    [110, 115, 40, 45, 103, 104],     // 14 short target 46
  ];
  const r = run(rows, cfg(RED));
  assert.deepEqual(r.trades.map(brief).slice(1), [['short-reentry', 102, 46, 'target']]);
});

test('stop = highest high of the WHOLE previous stretch, even where the lines were not rising (19 Nov)', () => {
  // Like 19 Nov: the swing high comes right after the bullish cross, while the slow
  // line is still falling; later highs are lower. The stop must be that first high.
  const rows = [
    [100, 101, 95, 99, 99, 100],     // 0 fast below slow
    [99, 140, 98, 120, 101, 100.5],  // 1 bullish cross; tall candle - high 140 (slow falling? doesn't matter)
    [120, 125, 110, 115, 103, 100.4],// 2 slow still falling
    [115, 122, 108, 112, 104, 100.6],// 3 both rising - lower high 122
    [112, 118, 100, 104, 102, 100.8],// 4 fast turns down
    [104, 110, 98, 100, 100, 100.9], // 5 bearish cross (fast falling) -> short setup, stop 140
    [99, 101, 97, 100, 99, 101],     // 6 touches fast[5] = 100 -> short at 100
  ];
  const short = run(rows).trades.find((t) => t.side === 'short');
  assert.equal(short.entryPrice, 100);
  assert.equal(short.stop, 140);
  assert.equal(short.target, 20); // 100 - 2 x 40
});

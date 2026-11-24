import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../index.js';
import { strikesForLevel, niftyOptions, sessionDays, levelDays, pickContracts, archiveDue, runOptionsArchive, nextSessionDay } from '../../optionsArchive.js';

const IST = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh, mm) - 330 * 60000;

function instrumentList(expiries = ['2026-11-17', '2026-11-23', '2026-12-01']) {
  const out = [];
  let tok = 1000;
  for (const expiry of expiries) {
    for (let k = 20000; k <= 30000; k += 50) {
      for (const t of ['CE', 'PE']) out.push({ exchange: 'NFO', name: 'NIFTY', instrument_type: t, instrument_token: tok++, tradingsymbol: `NIFTY${expiry}${k}${t}`, expiry: new Date(expiry), strike: k, lot_size: 75 });
    }
  }
  out.push({ exchange: 'NFO', name: 'BANKNIFTY', instrument_type: 'CE', instrument_token: 9, expiry: new Date('2026-11-23'), strike: 25000 });
  return out;
}

test('strikes are the one just below and just above the level; only one when exactly on it', () => {
  assert.deepEqual(strikesForLevel(25161.5), { below: 25150, above: 25200 });
  assert.deepEqual(strikesForLevel(25357.6), { below: 25350, above: 25400 });
  assert.deepEqual(strikesForLevel(25150), { below: 25150, above: 25150 });
});

test('a level applies to every session until the next cross, even if set on an earlier day', () => {
  const sessions = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
  const setups = [
    // set Tue 17 20:00, valid until Wed 18 15:30 → Wed only
    { crossTs: IST(2026, 11, 17, 17, 15), side: 'short', touch: 25357.6, touchTs: IST(2026, 11, 17, 20, 0) },
    // set Wed 18 16:00, ends Thu 09:00 before the session → next session (Thu)
    { crossTs: IST(2026, 11, 18, 15, 30), side: 'long', touch: 25219.9, touchTs: IST(2026, 11, 18, 16, 0) },
    // never touched → no level
    { crossTs: IST(2026, 11, 19, 9, 0), side: 'short', touch: null, touchTs: null },
    // still valid at the end → every later session
    { crossTs: IST(2026, 11, 19, 10, 15), side: 'long', touch: 25529.5, touchTs: IST(2026, 11, 19, 16, 0) },
  ];
  const rows = levelDays(setups, sessions).map((r) => `${r.level}@${r.day}`);
  assert.deepEqual(rows, ['25357.6@2026-11-18', '25219.9@2026-11-19', '25529.5@2026-11-20']);
});

test('expiry is the week (Tue 17 level traded Wed 18 → 23 Nov); CE and PE at both strikes', () => {
  const options = niftyOptions(instrumentList());
  const [r] = pickContracts([{ crossTs: 1, side: 'short', level: 25161.5, touchTs: 1, until: null, day: '2026-11-18' }], options);
  assert.equal(r.expiry, '2026-11-23');
  assert.deepEqual(r.contracts.map((c) => `${c.strike}${c.type}`), ['25150CE', '25150PE', '25200CE', '25200PE']);
  assert.ok(r.contracts.every((c) => c.contract && c.contract.expiry === '2026-11-23' && c.contract.strike === c.strike && c.contract.type === c.type));
  const [on] = pickContracts([{ crossTs: 1, side: 'long', level: 25150, touchTs: 1, until: null, day: '2026-11-18' }], options);
  assert.deepEqual(on.contracts.map((c) => `${c.strike}${c.type}`), ['25150CE', '25150PE']);
});

test('a day whose weekly expiry has already gone is not mapped to the next week', () => {
  const options = niftyOptions(instrumentList(['2026-11-23', '2026-12-01']));
  const [r] = pickContracts([{ crossTs: 1, side: 'short', level: 25357.6, touchTs: 1, until: null, day: '2026-11-16' }], options);
  assert.equal(r.expiry, null);
  assert.ok(r.contracts.every((c) => c.contract === null));
});

test('sessions are days with candles inside 09:15–15:30', () => {
  const bars = [IST(2026, 11, 21, 1, 0), IST(2026, 11, 20, 9, 15), IST(2026, 11, 20, 20, 0)].map((ts) => ({ ts }));
  assert.deepEqual(sessionDays(bars), ['2026-11-20']);
});

test('due once per 15-minute block, a minute after the candle closes', async () => {
  const { setMeta } = await import('../index.js');
  const db = openDb(':memory:');
  assert.equal(archiveDue(db, IST(2026, 11, 25, 10, 16)), true); // never run
  setMeta(db, 'options_archive_last_run_v3', { at: IST(2026, 11, 25, 10, 16) });
  assert.equal(archiveDue(db, IST(2026, 11, 25, 10, 25)), false);
  assert.equal(archiveDue(db, IST(2026, 11, 25, 10, 30)), false); // the 10:15 candle is still the latest + grace
  assert.equal(archiveDue(db, IST(2026, 11, 25, 10, 31)), true);
});

test('a still-valid level is mapped to the next session before it opens', () => {
  const setups = [{ crossTs: IST(2026, 11, 23, 12, 0), side: 'short', touch: 25300, touchTs: IST(2026, 11, 23, 13, 0), stop: 25400 }];
  const rows = levelDays(setups, ['2026-11-23'], undefined, { nextSession: nextSessionDay(IST(2026, 11, 24, 20, 0)) });
  assert.deepEqual(rows.map((r) => r.day), ['2026-11-23', '2026-11-25']); // Tue 24 evening → Wed 25
  assert.equal(rows[0].giftStop, 25400);
  assert.equal(nextSessionDay(IST(2026, 11, 27, 20, 0)), '2026-11-30'); // Fri evening → Mon
  assert.equal(nextSessionDay(IST(2026, 11, 25, 10, 0)), '2026-11-25');
});

test('run saves the full 15m history of the 4 level contracts, then keeps them up to date', async () => {
  const db = openDb(':memory:');
  // GIFT NIFTY: a slow wave so HMA 50 and HMA 130 cross
  const start = IST(2026, 7, 1, 6, 30);
  const gift = [];
  for (let t = start, i = 0; t < IST(2026, 11, 23, 23, 45); t += 15 * 60000, i++) {
    const m = new Date(t + 330 * 60000); const min = m.getUTCHours() * 60 + m.getUTCMinutes();
    if (m.getUTCDay() === 0 || m.getUTCDay() === 6 || min < 6 * 60 + 30) continue;
    const p = 25000 + 400 * Math.sin(i / 120) + 30 * Math.sin(i / 7);
    gift.push({ date: new Date(t), open: p, high: p + 15, low: p - 15, close: p + 3, volume: 0 });
  }
  const optionCalls = [];
  // Options were "listed" on 1 Oct: one 15m candle per weekday from then on.
  const fetchHistorical = async (token, interval, from, to) => {
    const f = from.slice(0, 10), t = to.slice(0, 10);
    if (token === 291849) return gift.filter((c) => { const d = new Date(+c.date + 330 * 60000).toISOString().slice(0, 10); return d >= f && d <= t; });
    optionCalls.push({ token, interval, from: f, to: t });
    const out = [];
    for (let d = Date.parse(`${f < '2026-10-01' ? '2026-10-01' : f}T09:15:00+05:30`); d <= Date.parse(`${t}T09:15:00+05:30`); d += 86400000) {
      if ([0, 6].includes(new Date(d).getUTCDay())) continue;
      out.push({ date: new Date(d), open: 100, high: 110, low: 90, close: 105, volume: 1, oi: 5 });
    }
    return out;
  };
  const instruments = instrumentList(['2026-11-17', '2026-11-23', '2026-12-01']);
  const now = IST(2026, 11, 23, 22, 35);
  const r = await runOptionsArchive(db, fetchHistorical, instruments, { now });
  assert.equal(r.failed, 0);
  assert.ok(optionCalls.length > 0 && optionCalls.every((c) => c.interval === '15minute'));
  const levels = db.prepare('SELECT * FROM option_levels').all();
  assert.ok(levels.length > 0);
  const allowed = new Set(levels.filter((l) => l.expiry).flatMap((l) => [`${l.expiry}:${l.strike_below}`, `${l.expiry}:${l.strike_above}`]));
  const saved = db.prepare('SELECT expiry, strike, type FROM option_contracts').all();
  assert.ok(saved.length > 0 && saved.every((c) => allowed.has(`${c.expiry}:${c.strike}`)), 'only the strikes below/above each level');
  // Full history from listing (1 Oct)
  const first = db.prepare("SELECT MIN(ts) t FROM candles WHERE interval = '15minute' AND instrument_token IN (SELECT instrument_token FROM option_contracts)").get().t;
  assert.equal(new Date(first + 330 * 60000).toISOString().slice(0, 10), '2026-10-01');
  assert.equal(archiveDue(db, now + 60000), false);
  // Next day: live level contracts are fetched again for the new day only
  const knownTokens = new Set(optionCalls.map((c) => c.token));
  optionCalls.length = 0;
  const next = IST(2026, 11, 24, 22, 35);
  await runOptionsArchive(db, fetchHistorical, instruments.filter((i) => isoOk(i, '2026-11-24')), { now: next });
  assert.ok(optionCalls.filter((c) => knownTokens.has(c.token)).every((c) => c.from >= '2026-11-23'), 'known contracts: only the missing days');
});

const isoOk = (i, day) => i.expiry.toISOString().slice(0, 10) >= day;

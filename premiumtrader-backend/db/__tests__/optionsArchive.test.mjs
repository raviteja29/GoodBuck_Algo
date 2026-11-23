import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../index.js';
import { strikesForLevel, niftyOptions, sessionDays, levelDays, pickContracts, archiveDue, runOptionsArchive, archiveStatus, listLevels } from '../../optionsArchive.js';

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

test('CE rounds the level down, PE rounds it up; same strike when exactly on one', () => {
  assert.deepEqual(strikesForLevel(25357.6), { ce: 25350, pe: 25400 });
  assert.deepEqual(strikesForLevel(25219.9), { ce: 25200, pe: 25250 });
  assert.deepEqual(strikesForLevel(25350), { ce: 25350, pe: 25350 });
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

test('expiry is the first one on or after the trading day (Tue 17 level traded Wed 18 → 23 Nov)', () => {
  const options = niftyOptions(instrumentList());
  const [r] = pickContracts([{ crossTs: 1, side: 'short', level: 25357.6, touchTs: 1, until: null, day: '2026-11-18' }], options);
  assert.equal(r.expiry, '2026-11-23');
  assert.equal(r.ceContract.strike, 25350);
  assert.equal(r.ceContract.type, 'CE');
  assert.equal(r.peContract.strike, 25400);
  assert.equal(r.peContract.type, 'PE');
});

test('saves CE and PE for every strike from 5 below the CE to 5 above the PE', () => {
  const options = niftyOptions(instrumentList());
  const [r] = pickContracts([{ crossTs: 1, side: 'short', level: 25357.6, touchTs: 1, until: null, day: '2026-11-18' }], options);
  assert.equal(r.bandLow, 25100);
  assert.equal(r.bandHigh, 25650);
  assert.equal(r.band.length, 24);
  assert.ok(r.band.every((b) => b.contract && b.contract.expiry === '2026-11-23'));
  const [onStrike] = pickContracts([{ crossTs: 1, side: 'long', level: 25350, touchTs: 1, until: null, day: '2026-11-18' }], options);
  assert.deepEqual([onStrike.bandLow, onStrike.bandHigh, onStrike.band.length], [25100, 25600, 22]);
});

test('a day whose weekly expiry has already gone is not mapped to the next week', () => {
  const options = niftyOptions(instrumentList(['2026-11-23', '2026-12-01']));
  const [r] = pickContracts([{ crossTs: 1, side: 'short', level: 25357.6, touchTs: 1, until: null, day: '2026-11-16' }], options);
  assert.equal(r.expiry, null);
  assert.equal(r.ceContract, null);
});

test('sessions are days with candles inside 09:15–15:30', () => {
  const bars = [IST(2026, 11, 21, 1, 0), IST(2026, 11, 20, 9, 15), IST(2026, 11, 20, 20, 0)].map((ts) => ({ ts }));
  assert.deepEqual(sessionDays(bars), ['2026-11-20']);
});

test('due only after 15:40 IST and once a day', () => {
  const db = openDb(':memory:');
  assert.equal(archiveDue(db, IST(2026, 11, 23, 15, 0)), false);
  assert.equal(archiveDue(db, IST(2026, 11, 23, 22, 30)), true);
});

test('run saves only the strikes around each level and records each level', async () => {
  const db = openDb(':memory:');
  // GIFT NIFTY: a slow wave so HMA 50 and HMA 130 cross; options: one candle per day
  const start = IST(2026, 7, 1, 6, 30);
  const gift = [];
  for (let t = start, i = 0; t < IST(2026, 11, 23, 23, 45); t += 15 * 60000, i++) {
    const m = new Date(t + 330 * 60000); const min = m.getUTCHours() * 60 + m.getUTCMinutes();
    if (m.getUTCDay() === 0 || m.getUTCDay() === 6 || min < 6 * 60 + 30) continue;
    const p = 25000 + 400 * Math.sin(i / 120) + 30 * Math.sin(i / 7);
    gift.push({ date: new Date(t), open: p, high: p + 15, low: p - 15, close: p + 3, volume: 0 });
  }
  const optionCalls = [];
  const fetchHistorical = async (token, interval, from, to) => {
    if (token === 291849) return gift.filter((c) => { const d = new Date(+c.date + 330 * 60000).toISOString().slice(0, 10); return d >= from.slice(0, 10) && d <= to.slice(0, 10); });
    optionCalls.push(token);
    return [{ date: new Date(`${from.slice(0, 10)}T09:15:00+05:30`), open: 100, high: 110, low: 90, close: 105, volume: 1, oi: 5 }];
  };
  const instruments = instrumentList(['2026-11-17', '2026-11-23', '2026-12-01']);
  const now = IST(2026, 11, 23, 22, 30);
  const r = await runOptionsArchive(db, fetchHistorical, instruments, { now });
  assert.equal(r.failed, 0);
  const levels = listLevels(db, { limit: 500 });
  assert.ok(levels.length > 0, 'expected levels in the last 10 days');
  for (const l of levels) {
    assert.equal(l.ce_strike, Math.floor(l.level / 50) * 50);
    assert.equal(l.pe_strike, Math.ceil(l.level / 50) * 50);
    assert.ok(l.expiry >= l.day);
    assert.ok(l.ce_symbol.endsWith(`${l.ce_strike}CE`) && l.pe_symbol.endsWith(`${l.pe_strike}PE`));
  }
  const allowed = new Set();
  for (const l of levels) for (let k = l.ce_strike - 250; k <= l.pe_strike + 250; k += 50) allowed.add(k);
  const saved = db.prepare('SELECT strike FROM option_contracts').all().map((x) => x.strike);
  assert.ok(saved.length > 0 && saved.every((k) => allowed.has(k)), 'only strikes within 5 of each level are saved');
  assert.equal(archiveDue(db, now + 60000), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../index.js';
import { niftyOptions, contractsForDay, archiveDue, runOptionsArchive, archiveStatus, OPTIONS_ARCHIVE } from '../../optionsArchive.js';

const IST = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh, mm) - 330 * 60000;

function instrumentList() {
  const out = [{ exchange: 'NSE', name: 'NIFTY 50', instrument_type: 'EQ', instrument_token: 256265 }];
  let tok = 1000;
  for (const expiry of ['2026-11-23', '2026-12-01', '2026-12-08']) {
    for (let k = 24000; k <= 26500; k += 50) {
      for (const t of ['CE', 'PE']) out.push({ exchange: 'NFO', name: 'NIFTY', instrument_type: t, instrument_token: tok++, tradingsymbol: `NIFTY${expiry}${k}${t}`, expiry: new Date(expiry), strike: k, lot_size: 75 });
    }
  }
  out.push({ exchange: 'NFO', name: 'BANKNIFTY', instrument_type: 'CE', instrument_token: 9, expiry: new Date('2026-11-23'), strike: 25000 });
  return out;
}

test('picks NIFTY options only, with ISO expiries', () => {
  const o = niftyOptions(instrumentList());
  assert.equal(o.length, 3 * 51 * 2);
  assert.equal(o[0].expiry, '2026-11-23');
});

test('strikes span the day range ±15 strikes, nearest two expiries', () => {
  const o = niftyOptions(instrumentList());
  const c = contractsForDay(o, '2026-11-23', 25210, 25330);
  const strikes = [...new Set(c.map((x) => x.strike))].sort((a, b) => a - b);
  assert.equal(strikes[0], 24450);
  assert.equal(strikes.at(-1), 26100);
  assert.deepEqual([...new Set(c.map((x) => x.expiry))].sort(), ['2026-11-23', '2026-12-01']);
  // After an expiry passes, the next two are used
  assert.deepEqual([...new Set(contractsForDay(o, '2026-11-24', 25210, 25330).map((x) => x.expiry))].sort(), ['2026-12-01', '2026-12-08']);
});

test('due only after 15:40 IST and once a day', () => {
  const db = openDb(':memory:');
  assert.equal(archiveDue(db, IST(2026, 11, 23, 15, 0)), false);
  assert.equal(archiveDue(db, IST(2026, 11, 23, 22, 30)), true);
});

test('run saves index + contracts for trading days and records the run', async () => {
  const db = openDb(':memory:');
  const calls = [];
  // Only Monday 23 Nov trades (Sunday 22 is empty)
  const fetchHistorical = async (token, interval, from, to) => {
    calls.push(token);
    if (to.slice(0, 10) < '2026-11-23') return [];
    const base = token === 256265 ? 25270 : 100;
    return [{ date: new Date('2026-11-23T09:15:00+05:30'), open: base, high: base + 60, low: base - 60, close: base, volume: 1, oi: 5 }];
  };
  const now = IST(2026, 11, 23, 22, 30);
  const r = await runOptionsArchive(db, fetchHistorical, instrumentList(), { now, cfg: { ...OPTIONS_ARCHIVE, lookbackDays: 2 } });
  assert.deepEqual(r.tradingDays, ['2026-11-23']);
  assert.equal(r.failed, 0);
  assert.ok(r.contracts > 0 && r.contracts === calls.length - 1);
  const s = archiveStatus(db);
  assert.equal(s.contracts, r.contracts);
  assert.equal(s.candles, r.contracts);
  assert.equal(archiveDue(db, now + 60000), false);
});

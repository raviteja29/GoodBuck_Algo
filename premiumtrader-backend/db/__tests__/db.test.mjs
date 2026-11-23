import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, schemaVersion, getMeta, setMeta } from '../index.js';
import { nextKiteExpiry, saveKiteSession, loadKiteSession, publicSessionInfo, clearKiteSession } from '../../kiteSession.js';

const IST = (y, m, d, hh, mm) => Date.UTC(y, m - 1, d, hh, mm) - 330 * 60000;

test('migrations create all tables and are idempotent', () => {
  const db = openDb(':memory:');
  assert.equal(schemaVersion(db), 5);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  for (const t of ['meta', 'strategies', 'backtests', 'backtest_trades', 'candles', 'candle_days', 'signals', 'trade_snapshots', 'option_contracts', 'option_levels']) {
    assert.ok(tables.includes(t), `missing table ${t}`);
  }
});

test('meta round-trips JSON', () => {
  const db = openDb(':memory:');
  setMeta(db, 'k', { a: 1 });
  setMeta(db, 'k', { a: 2 });
  assert.deepEqual(getMeta(db, 'k'), { a: 2 });
  assert.equal(getMeta(db, 'missing'), null);
});

test('foreign keys are enforced', () => {
  const db = openDb(':memory:');
  assert.throws(() => db.prepare("INSERT INTO backtest_trades (backtest_id, seq, side, entry_ts, entry_price) VALUES ('nope', 1, 'long', 0, 1)").run());
});

test('Kite expiry is the next 06:00 IST', () => {
  // Morning login 09:05 IST → next day 06:00 IST
  assert.equal(nextKiteExpiry(IST(2026, 11, 21, 9, 5)), IST(2026, 11, 22, 6, 0));
  // Just after midnight 00:30 IST → same day 06:00 IST
  assert.equal(nextKiteExpiry(IST(2026, 11, 21, 0, 30)), IST(2026, 11, 21, 6, 0));
  // Exactly 06:00 IST → next day
  assert.equal(nextKiteExpiry(IST(2026, 11, 21, 6, 0)), IST(2026, 11, 22, 6, 0));
});

test('session survives reopen and expires on time', () => {
  const db = openDb(':memory:');
  const loginAt = IST(2026, 11, 21, 9, 5);
  saveKiteSession(db, { access_token: 'tok', user_id: 'AB1234' }, loginAt);
  assert.equal(loadKiteSession(db, loginAt + 3600_000).access_token, 'tok');
  assert.equal(loadKiteSession(db, IST(2026, 11, 22, 6, 0)), null);
  assert.equal(loadKiteSession(db, loginAt), null, 'expired session is cleared');
});

test('public info never exposes the token', () => {
  const db = openDb(':memory:');
  const s = saveKiteSession(db, { access_token: 'secret-token', user_id: 'AB1234' });
  assert.ok(!JSON.stringify(publicSessionInfo(s)).includes('secret-token'));
  clearKiteSession(db);
  assert.deepEqual(publicSessionInfo(loadKiteSession(db)), { loggedIn: false });
});

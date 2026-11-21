import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../index.js';
import { saveKiteSession } from '../../kiteSession.js';
import { strategiesRouter, seedDefaultStrategy, SEED_NAME } from '../../strategies.js';
import { DEFAULT_CONFIG } from '../../strategy/config.js';

async function startApp() {
  const db = openDb(':memory:');
  saveKiteSession(db, { access_token: 'good', user_id: 'AB1234' });
  const app = express();
  app.use(express.json());
  const verifyToken = async (t) => (t === 'fresh-login' ? { user_id: 'AB1234', user_name: 'T' } : null);
  app.use('/api/strategies', strategiesRouter(db, { verifyToken }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/strategies`;
  const call = async (method, path = '', body, token = 'good') => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, call, close: () => server.close() };
}

test('seed saves the old hard-coded strategy once, with the default config', () => {
  const db = openDb(':memory:');
  const s = seedDefaultStrategy(db);
  assert.equal(s.name, SEED_NAME);
  assert.deepEqual(s.config, JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  assert.equal(seedDefaultStrategy(db), null, 'second seed is a no-op');
});

test('routes require the active Kite session', async () => {
  const app = await startApp();
  try {
    assert.equal((await app.call('GET', '', null, null)).status, 401);
    assert.equal((await app.call('GET', '', null, 'stale-token')).status, 401);
    assert.equal((await app.call('GET')).status, 200);
    // A different but valid token (verified with Kite) becomes the saved session
    assert.equal((await app.call('GET', '', null, 'fresh-login')).status, 200);
    assert.equal((await app.call('GET', '', null, 'good')).status, 401, 'old token replaced');
  } finally { app.close(); }
});

test('create, read, update, duplicate, delete', async () => {
  const app = await startApp();
  try {
    const created = await app.call('POST', '', { name: '  Bank   shorts ', config: { trend: { fastPeriod: 20, slowPeriod: 100 } } });
    assert.equal(created.status, 201);
    assert.equal(created.body.name, 'Bank shorts');
    assert.equal(created.body.status, 'draft');
    assert.equal(created.body.config.trend.fastPeriod, 20);
    assert.equal(created.body.config.timeframe, '15minute', 'defaults filled');
    const id = created.body.id;

    assert.equal((await app.call('GET', `/${id}`)).body.summary, 'GIFTNIFTY · 15m · HMA 20/100 · 6 setups');

    const updated = await app.call('PUT', `/${id}`, { status: 'active', config: { ...created.body.config, setups: ['mid-rising-long'] } });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.status, 'active');
    assert.deepEqual(updated.body.config.setups, ['mid-rising-long']);

    const dup = await app.call('POST', `/${id}/duplicate`);
    assert.equal(dup.status, 201);
    assert.equal(dup.body.name, 'Bank shorts copy');
    assert.equal(dup.body.status, 'draft');

    const list = await app.call('GET');
    assert.equal(list.body.length, 2);
    assert.equal(list.body[0].status, 'active', 'active strategies listed first');

    assert.equal((await app.call('DELETE', `/${id}`)).status, 204);
    assert.equal((await app.call('GET', `/${id}`)).status, 404);
    assert.equal((await app.call('DELETE', `/${id}`)).status, 404);
  } finally { app.close(); }
});

test('validation errors come back per field', async () => {
  const app = await startApp();
  try {
    const r = await app.call('POST', '', { name: '', config: { trend: { fastPeriod: 300, slowPeriod: 100 } } });
    assert.equal(r.status, 400);
    assert.equal(r.body.errors[0].field, 'name');

    const r2 = await app.call('POST', '', { name: 'x', config: { trend: { fastPeriod: 300, slowPeriod: 100 } } });
    assert.equal(r2.status, 400);
    assert.ok(r2.body.errors.some((e) => e.field === 'trend.slowPeriod'));

    const r3 = await app.call('POST', '', { name: 'x', status: 'running' });
    assert.equal(r3.status, 400);

    const meta = await app.call('GET', '/meta');
    assert.equal(meta.body.setups.length, 6);
    assert.ok(meta.body.timeframes.includes('15minute'));
  } finally { app.close(); }
});

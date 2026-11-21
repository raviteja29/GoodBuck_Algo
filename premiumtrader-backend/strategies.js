// Saved strategies: SQLite repository + /api/strategies routes.

import express from 'express';
import { randomUUID } from 'node:crypto';
import { normalizeConfig, describeConfig, DEFAULT_CONFIG, SETUP_CATALOGUE, TIMEFRAMES } from './strategy/config.js';
import { loadKiteSession, saveKiteSession } from './kiteSession.js';

const STATUSES = ['draft', 'active', 'paused'];
export const SEED_NAME = 'Weekly Levels · GIFT NIFTY';

const rowToStrategy = (r) => {
  if (!r) return null;
  const config = JSON.parse(r.config);
  return { id: r.id, name: r.name, status: r.status, config, summary: describeConfig(config), createdAt: r.created_at, updatedAt: r.updated_at };
};

/** Latest finished backtest per strategy: headline metrics, and whether the rules changed since. */
function latestBacktests(db) {
  const rows = db.prepare(`SELECT b.id, b.strategy_id, b.params, b.metrics, b.finished_at FROM backtests b
    JOIN (SELECT strategy_id, MAX(created_at) AS m FROM backtests WHERE status = 'done' GROUP BY strategy_id) l
      ON l.strategy_id = b.strategy_id AND l.m = b.created_at
    WHERE b.status = 'done'`).all();
  return new Map(rows.map((r) => {
    const p = JSON.parse(r.params);
    return [r.strategy_id, { id: r.id, from: p.from, to: p.to, config: p.config, metrics: JSON.parse(r.metrics), finishedAt: r.finished_at }];
  }));
}

const withLastBacktest = (s, last) => {
  if (!s) return s;
  if (!last) return { ...s, lastBacktest: null };
  const { config, ...rest } = last;
  return { ...s, lastBacktest: { ...rest, stale: JSON.stringify(config) !== JSON.stringify(s.config) } };
};

export function listStrategies(db) {
  const last = latestBacktests(db);
  return db.prepare('SELECT * FROM strategies ORDER BY (status = \'active\') DESC, updated_at DESC').all()
    .map(rowToStrategy).map((s) => withLastBacktest(s, last.get(s.id)));
}

export function getStrategy(db, id) {
  return rowToStrategy(db.prepare('SELECT * FROM strategies WHERE id = ?').get(id));
}

export function getStrategyWithBacktest(db, id) {
  return withLastBacktest(getStrategy(db, id), latestBacktests(db).get(id));
}

class ValidationError extends Error {
  constructor(errors) { super('Invalid strategy'); this.errors = errors; }
}

function cleanName(name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ');
  if (!n) throw new ValidationError([{ field: 'name', message: 'Name is required' }]);
  if (n.length > 80) throw new ValidationError([{ field: 'name', message: 'Name must be 80 characters or fewer' }]);
  return n;
}

function cleanStatus(status) {
  if (!STATUSES.includes(status)) throw new ValidationError([{ field: 'status', message: `Status must be ${STATUSES.join(', ')}` }]);
  return status;
}

export function createStrategy(db, { name, config, status = 'draft' }, now = Date.now()) {
  const n = cleanName(name);
  const s = cleanStatus(status);
  const { config: c, errors } = normalizeConfig(config);
  if (errors.length) throw new ValidationError(errors);
  const id = randomUUID();
  db.prepare('INSERT INTO strategies (id, name, status, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, n, s, JSON.stringify(c), now, now);
  return getStrategy(db, id);
}

export function updateStrategy(db, id, patch, now = Date.now()) {
  const current = getStrategy(db, id);
  if (!current) return null;
  const name = patch.name !== undefined ? cleanName(patch.name) : current.name;
  const status = patch.status !== undefined ? cleanStatus(patch.status) : current.status;
  let config = current.config;
  if (patch.config !== undefined) {
    const r = normalizeConfig(patch.config);
    if (r.errors.length) throw new ValidationError(r.errors);
    config = r.config;
  }
  db.prepare('UPDATE strategies SET name = ?, status = ?, config = ?, updated_at = ? WHERE id = ?')
    .run(name, status, JSON.stringify(config), now, id);
  return getStrategy(db, id);
}

export function deleteStrategy(db, id) {
  return db.prepare('DELETE FROM strategies WHERE id = ?').run(id).changes > 0;
}

/** First run: save the previously hard-coded strategy so it appears as a normal config. */
export function seedDefaultStrategy(db) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM strategies').get();
  if (n > 0) return null;
  return createStrategy(db, { name: SEED_NAME, config: DEFAULT_CONFIG, status: 'draft' });
}

/**
 * Only the logged-in Kite user may use these routes. The browser's token must
 * match the session the server holds; a different token (a fresh login, or one
 * from before the server started saving sessions) is checked with Kite once
 * via `verifyToken` and, if valid, becomes the saved session.
 */
export function requireSession(db, verifyToken) {
  return async (req, res, next) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Log in with Kite to continue' });
    const session = loadKiteSession(db);
    if (session && token === session.access_token) return next();
    if (!verifyToken) return res.status(401).json({ error: 'Log in with Kite to continue' });
    try {
      const profile = await verifyToken(token);
      if (!profile) throw new Error('invalid');
      saveKiteSession(db, { access_token: token, user_id: profile.user_id, user_name: profile.user_name });
      next();
    } catch {
      res.status(401).json({ error: 'Your Kite session has expired. Log in again.' });
    }
  };
}

export function strategiesRouter(db, { verifyToken } = {}) {
  const r = express.Router();
  r.use(requireSession(db, verifyToken));

  const handle = (fn) => (req, res) => {
    try {
      fn(req, res);
    } catch (e) {
      if (e instanceof ValidationError) return res.status(400).json({ error: e.message, errors: e.errors });
      console.error('[STRATEGIES]', e);
      res.status(500).json({ error: 'Something went wrong saving the strategy' });
    }
  };

  // Everything the builder needs to render its form.
  r.get('/meta', handle((req, res) => {
    res.json({ defaults: DEFAULT_CONFIG, setups: SETUP_CATALOGUE, timeframes: TIMEFRAMES, statuses: STATUSES });
  }));

  r.get('/', handle((req, res) => res.json(listStrategies(db))));

  r.get('/:id', handle((req, res) => {
    const s = getStrategyWithBacktest(db, req.params.id);
    return s ? res.json(s) : res.status(404).json({ error: 'Strategy not found' });
  }));

  r.post('/', handle((req, res) => {
    res.status(201).json(createStrategy(db, req.body || {}));
  }));

  r.put('/:id', handle((req, res) => {
    const s = updateStrategy(db, req.params.id, req.body || {});
    return s ? res.json(getStrategyWithBacktest(db, s.id)) : res.status(404).json({ error: 'Strategy not found' });
  }));

  r.post('/:id/duplicate', handle((req, res) => {
    const s = getStrategy(db, req.params.id);
    if (!s) return res.status(404).json({ error: 'Strategy not found' });
    const name = `${s.name} copy`.slice(0, 80);
    res.status(201).json(createStrategy(db, { name, config: s.config, status: 'draft' }));
  }));

  r.delete('/:id', handle((req, res) => {
    return deleteStrategy(db, req.params.id) ? res.status(204).end() : res.status(404).json({ error: 'Strategy not found' });
  }));

  return r;
}

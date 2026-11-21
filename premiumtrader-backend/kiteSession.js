// Persists the daily Kite session on the server so a restart doesn't drop it
// and the live engine (Phase 3) can run without a browser open.
//
// Kite invalidates access tokens at 06:00 IST the day after login.

import { getMeta, setMeta, deleteMeta } from './db/index.js';

const KEY = 'kite_session';
const IST_OFFSET_MS = 330 * 60 * 1000;
const EXPIRY_MIN_IST = 6 * 60; // 06:00 IST

/** First 06:00 IST strictly after `loginAt` (epoch ms). */
export function nextKiteExpiry(loginAt) {
  const ist = new Date(loginAt + IST_OFFSET_MS); // UTC fields now read as IST wall clock
  const candidate = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) + EXPIRY_MIN_IST * 60000 - IST_OFFSET_MS;
  return candidate > loginAt ? candidate : candidate + 24 * 60 * 60 * 1000;
}

export function saveKiteSession(db, { access_token, user_id, user_name }, now = Date.now()) {
  if (!access_token) throw new Error('access_token required');
  const session = { access_token, user_id: user_id ?? null, user_name: user_name ?? null, login_at: now, expires_at: nextKiteExpiry(now) };
  setMeta(db, KEY, session);
  return session;
}

/** Returns the stored session if it hasn't expired, else clears it and returns null. */
export function loadKiteSession(db, now = Date.now()) {
  const s = getMeta(db, KEY);
  if (!s) return null;
  if (!s.access_token || !(s.expires_at > now)) {
    deleteMeta(db, KEY);
    return null;
  }
  return s;
}

export function clearKiteSession(db) {
  deleteMeta(db, KEY);
}

/** Safe to send to the UI or logs — never includes the token. */
export function publicSessionInfo(s) {
  if (!s) return { loggedIn: false };
  return { loggedIn: true, user_id: s.user_id, login_at: s.login_at, expires_at: s.expires_at };
}

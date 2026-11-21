// Client for /api/strategies (saved strategy configs).

const authHeaders = () => {
  const token = localStorage.getItem('access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export class ApiError extends Error {
  constructor(message, status, errors = []) {
    super(message);
    this.status = status;
    this.errors = errors; // [{ field, message }]
  }
}

async function request(method, path = '', body, base = '/api/strategies') {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.errors || []);
  return data;
}

const StrategyService = {
  meta: () => request('GET', '/meta'),
  list: () => request('GET'),
  get: (id) => request('GET', `/${encodeURIComponent(id)}`),
  create: (strategy) => request('POST', '', strategy),
  update: (id, patch) => request('PUT', `/${encodeURIComponent(id)}`, patch),
  duplicate: (id) => request('POST', `/${encodeURIComponent(id)}/duplicate`),
  remove: (id) => request('DELETE', `/${encodeURIComponent(id)}`),
  session: async () => {
    const res = await fetch('/api/session');
    return res.ok ? res.json() : { loggedIn: false };
  },
};

const bt = (method, path, body) => request(method, path, body, '/api/backtests');

export const BacktestService = {
  run: (strategyId, from, to) => bt('POST', '', { strategyId, from, to }),
  list: (strategyId, limit = 20) => bt('GET', `?strategyId=${encodeURIComponent(strategyId)}&limit=${limit}`),
  get: (id) => bt('GET', `/${encodeURIComponent(id)}`),
  remove: (id) => bt('DELETE', `/${encodeURIComponent(id)}`),
  /** Download the trades CSV (needs the auth header, so fetch + blob rather than a plain link). */
  downloadCsv: async (id) => {
    const res = await fetch(`/api/backtests/${encodeURIComponent(id)}/trades.csv`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError(`Export failed (${res.status})`, res.status);
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'trades.csv';
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const timeframeLabel = (tf) => (tf === 'minute' ? '1m' : String(tf).replace('minute', 'm'));

const lineName = (type, period) => `${String(type || 'hma').toUpperCase()} ${period}`;

const SIDE_TEXT = { long: 'long', short: 'short' };

/** The config in plain words — shown beside the builder so the rules are never ambiguous. */
export function describeInWords(config, setupCatalogue = []) {
  if (!config) return '';
  const tf = timeframeLabel(config.timeframe);
  const chosen = setupCatalogue.filter((s) => config.setups.includes(s.key));
  const longs = chosen.filter((s) => s.side === 'long').map((s) => s.name.split(' ')[0]);
  const shorts = chosen.filter((s) => s.side === 'short').map((s) => s.name.split(' ')[0]);
  const list = (arr) => (arr.length === 3 ? 'any level' : arr.join(' or ') || 'no level');
  const parts = [
    `Each Wednesday, take the previous week's high, mid and low on ${config.instrument.symbol || 'the instrument'}.`,
    `The following week, when a ${tf} bar touches a level between ${config.session.start} and ${config.session.end}:`,
    longs.length ? `go ${SIDE_TEXT.long} at ${list(longs)} if ${lineName(config.trend.fastType, config.trend.fastPeriod)} and ${lineName(config.trend.slowType, config.trend.slowPeriod)} are both rising` : null,
    shorts.length ? `${longs.length ? 'otherwise ' : ''}go ${SIDE_TEXT.short} at ${list(shorts)}${longs.length ? '' : ' unless both lines are rising'}` : null,
  ].filter(Boolean);
  return `${parts[0]} ${parts[1]} ${parts.slice(2).join('; ')}. Stop at the far end of the box, target the near end, and exit by ${config.session.exitTime} on expiry day.`;
}

export default StrategyService;

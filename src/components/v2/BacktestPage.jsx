import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StrategyService, { BacktestService } from '../../services/StrategyService';

const IST = 'Asia/Kolkata';
const fmtDateTime = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
const fmtDate = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ms));
const fmtMonth = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, month: 'short', year: '2-digit' }).format(new Date(ms));
const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const monthsAgo = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - n); return d.toISOString().slice(0, 10); };

const signed = (v, digits = 0) => {
  if (!Number.isFinite(v)) return '—';
  const s = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}`;
};
// Fixed 2 decimals so prices line up in columns.
const price = (v) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : '—');
const tone = (v) => (v > 0 ? 'gb-pos' : v < 0 ? 'gb-neg' : '');

const exitLabel = (reason) => {
  if (reason === 'target') return 'Target';
  if (reason === 'stop loss') return 'Stop';
  if (reason === 'expiry') return 'Expiry';
  return 'Reversal';
};
const setupLabel = (name = '') => name.replace(/^(\w+) /, '$1 · ');

const PERIODS = [
  { id: '3m', label: 'Last 3 months', months: 3 },
  { id: '6m', label: 'Last 6 months', months: 6 },
  { id: '12m', label: 'Last 12 months', months: 12 },
  { id: '24m', label: 'Last 2 years', months: 24 },
  { id: 'custom', label: 'Custom…' },
];

/** Cumulative points after each trade. One series, zero baseline, crosshair + tooltip on hover. */
function EquityChart({ equity }) {
  const wrap = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 1000, H = 240, PAD = 12;

  const geo = useMemo(() => {
    if (!equity?.length) return null;
    const pts = [{ ts: equity[0].ts, equity: 0 }, ...equity];
    const ys = pts.map((p) => p.equity);
    const min = Math.min(0, ...ys), max = Math.max(0, ...ys);
    const span = max - min || 1;
    const x = (i) => (i / (pts.length - 1)) * W;
    const y = (v) => PAD + (1 - (v - min) / span) * (H - 2 * PAD);
    const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
    return { pts, min, max, x, y, line, zeroY: y(0) };
  }, [equity]);

  if (!geo) return <div className="gb-chart-empty">No trades in this period.</div>;

  const onMove = (e) => {
    const r = wrap.current.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (geo.pts.length - 1));
    setHover(Math.max(1, Math.min(geo.pts.length - 1, i)));
  };

  const last = geo.pts[geo.pts.length - 1];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => geo.pts[Math.round(f * (geo.pts.length - 1))]);
  const h = hover != null ? geo.pts[hover] : null;
  const hx = hover != null ? (geo.x(hover) / W) * 100 : 0;

  return (
    <div className="gb-chart">
      <div className="gb-chart-plot">
        <div className="gb-chart-y" aria-hidden="true">
          <span style={{ top: `${(geo.y(geo.max) / H) * 100}%` }}>{signed(geo.max)}</span>
          {geo.min < 0 && geo.max > 0 && <span style={{ top: `${(geo.zeroY / H) * 100}%` }}>0</span>}
          <span style={{ top: `${(geo.y(geo.min) / H) * 100}%` }}>{signed(geo.min)}</span>
        </div>
        <div
          className="gb-chart-area"
          ref={wrap}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <svg
            role="img"
            aria-label={`Equity curve over ${equity.length} trades, ending at ${signed(last.equity)} points. Lowest ${signed(geo.min)}, highest ${signed(geo.max)}.`}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
          >
            <line x1="0" x2={W} y1={geo.zeroY} y2={geo.zeroY} stroke="#48484A" strokeWidth="1" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
            <polygon points={`0,${geo.zeroY} ${geo.line} ${W},${geo.zeroY}`} fill="#0A84FF" fillOpacity="0.10" />
            <polyline points={geo.line} fill="none" stroke="#0A84FF" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {h && (
            <>
              <span className="gb-crosshair" style={{ left: `${hx}%` }} />
              <span className="gb-chart-dot" style={{ left: `${hx}%`, top: `${(geo.y(h.equity) / H) * 100}%` }} />
              <div className={`gb-tooltip${hx > 70 ? ' left' : ''}`} style={{ left: `${hx}%` }} role="status">
                <b>{signed(h.equity, 1)} pts</b>
                <span>after trade {hover} · {fmtDate(h.ts)}</span>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="gb-chart-x" aria-hidden="true">
        {ticks.map((t, i) => <span key={i}>{fmtMonth(t.ts)}</span>)}
      </div>
    </div>
  );
}

const BacktestPage = ({ initialStrategyId, autoRun = false, onAutoRunStarted, onEditStrategy }) => {
  const [strategies, setStrategies] = useState(null);
  const [strategyId, setStrategyId] = useState(initialStrategyId || '');
  const [period, setPeriod] = useState('12m');
  const [custom, setCustom] = useState({ from: monthsAgo(todayIST(), 12), to: todayIST() });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    StrategyService.list()
      .then((list) => {
        setStrategies(list);
        setStrategyId((id) => (id && list.some((s) => s.id === id) ? id : list[0]?.id || ''));
      })
      .catch((e) => { setError(e.message); setStrategies([]); });
  }, []);

  const strategy = strategies?.find((s) => s.id === strategyId) || null;

  const loadHistory = useCallback(async (id, openLatest) => {
    if (!id) return;
    try {
      const list = await BacktestService.list(id);
      setHistory(list);
      const latest = list.find((b) => b.status === 'done');
      if (openLatest) setResult(latest ? await BacktestService.get(latest.id) : null);
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { setResult(null); setShowAll(false); loadHistory(strategyId, true); }, [strategyId, loadHistory]);

  const range = useMemo(() => {
    if (period === 'custom') return custom;
    const to = todayIST();
    return { from: monthsAgo(to, PERIODS.find((p) => p.id === period).months), to };
  }, [period, custom]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const r = await BacktestService.run(strategyId, range.from, range.to);
      setResult(r);
      setShowAll(false);
      loadHistory(strategyId, false);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  // "Save & Backtest" from the builder lands here with autoRun: start once the strategy is loaded.
  const autoRunDone = useRef(false);
  useEffect(() => {
    if (!autoRun || autoRunDone.current || !strategy || strategy.id !== initialStrategyId) return;
    autoRunDone.current = true;
    onAutoRunStarted?.();
    run();
  });

  const open = async (id) => {
    setError(null);
    try { setResult(await BacktestService.get(id)); setShowAll(false); } catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this backtest run?')) return;
    try {
      await BacktestService.remove(id);
      if (result?.id === id) setResult(null);
      loadHistory(strategyId, false);
    } catch (e) { setError(e.message); }
  };

  const stale = result && strategy && JSON.stringify(result.config) !== JSON.stringify(strategy.config);
  const m = result?.metrics;
  const trades = useMemo(() => (result?.trades ? [...result.trades].reverse() : []), [result]);
  const visible = showAll ? trades : trades.slice(0, 25);
  const summary = useMemo(() => (result?.summary ? [...result.summary].sort((a, b) => b.points - a.points) : []), [result]);

  const subtitle = result
    ? `Same engine as live signals · ${fmtDate(Date.parse(result.from))} – ${fmtDate(Date.parse(result.to))} · ${result.info.windows} weeks${result.info.skipped.length ? `, ${result.info.skipped.length} skipped` : ''} · ${(result.info.totalMs / 1000).toFixed(1)} s`
    : 'Same engine as live signals. Candles are cached, so reruns take seconds.';

  return (
    <>
      <div className="gb-page-head">
        <div>
          <h1 className="gb-title">Backtest</h1>
          <p className="gb-subtitle">{subtitle}</p>
        </div>
        <form className="gb-bt-form" onSubmit={(e) => { e.preventDefault(); run(); }}>
          <label className="gb-field">
            <span>Strategy</span>
            <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)} disabled={!strategies?.length || running}>
              {strategies?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="gb-field">
            <span>Period</span>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} disabled={running}>
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {period === 'custom' && (
            <>
              <label className="gb-field"><span>From</span><input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
              <label className="gb-field"><span>To</span><input type="date" value={custom.to} max={todayIST()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
            </>
          )}
          <button type="submit" className="gb-btn gb-btn-primary" disabled={running || !strategyId}>{running ? 'Running…' : 'Run'}</button>
        </form>
      </div>

      {running && (
        <div className="gb-note gb-note-info" role="status">
          <b>Running {strategy?.name}</b>
          <span>The first run for a new instrument or date range downloads candles from Kite, which can take up to a minute for long ranges. After that it's cached.</span>
        </div>
      )}
      {error && <div className="gb-note gb-note-error" role="alert">{error}</div>}
      {stale && (
        <div className="gb-note gb-note-warn">
          <b>The strategy's rules changed after this backtest</b>
          <span>These numbers describe the old rules. Run it again to test the current ones.</span>
        </div>
      )}

      {strategies?.length === 0 && (
        <div className="gb-card gb-empty"><p>Create a strategy first.</p></div>
      )}

      {!result && !running && strategy && (
        <div className="gb-card gb-empty">
          <p>No backtest for {strategy.name} yet.</p>
          <p className="gb-muted">{strategy.summary}</p>
        </div>
      )}

      {result && (
        <>
          <section className="gb-card gb-hero" aria-label="Result">
            <div className="gb-hero-head">
              <div>
                <span className="gb-stat-label">Net result</span>
                <strong className={`gb-hero-value ${tone(m.points)}`}>{signed(m.points)} pts</strong>
              </div>
              <span className="gb-muted">{result.strategyName} · {result.info.candles.toLocaleString('en-IN')} candles</span>
            </div>
            <EquityChart equity={result.equity} />
            <div className="gb-metrics">
              <div><span>Trades</span><b>{m.trades}</b></div>
              <div><span>Win rate</span><b>{pct(m.winRate)}</b></div>
              <div><span>Profit factor</span><b>{m.profitFactor == null ? (m.trades ? '∞' : '—') : m.profitFactor.toFixed(2)}</b></div>
              <div><span>Avg win / loss</span><b>{signed(m.avgWin)} / {signed(m.avgLoss)}</b></div>
              <div><span>Max drawdown</span><b className={m.maxDrawdown ? 'gb-neg' : ''}>{m.maxDrawdown ? signed(-m.maxDrawdown) : '0'}</b></div>
            </div>
          </section>

          <div className="gb-bt-grid">
            <section aria-labelledby="bysetup" className="gb-section gb-bt-setups">
              <h2 id="bysetup" className="gb-h2">By setup</h2>
              <div className="gb-card gb-table-wrap">
                <table className="gb-table">
                  <thead><tr><th>Setup</th><th>Trades</th><th>Win %</th><th>Net</th></tr></thead>
                  <tbody>
                    {summary.length === 0 && <tr><td colSpan="4" className="gb-muted">No trades</td></tr>}
                    {summary.map((s) => (
                      <tr key={s.setupKey}>
                        <td>{setupLabel(s.setupName)}</td>
                        <td>{s.trades}</td>
                        <td>{(s.winRate * 100).toFixed(1)}</td>
                        <td className={tone(s.points)}>{signed(s.points)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="trades" className="gb-section gb-bt-trades">
              <div className="gb-section-head">
                <h2 id="trades" className="gb-h2">Trades</h2>
                {trades.length > 0 && <button type="button" className="gb-link-btn" onClick={() => BacktestService.downloadCsv(result.id).catch((e) => setError(e.message))}>Export CSV</button>}
              </div>
              <div className="gb-card gb-table-wrap">
                <table className="gb-table">
                  <thead><tr><th>Entry</th><th className="gb-l">Setup</th><th className="gb-hide-sm">In</th><th className="gb-hide-sm">Out</th><th className="gb-l">Exit</th><th>Pts</th></tr></thead>
                  <tbody>
                    {visible.length === 0 && <tr><td colSpan="6" className="gb-muted">No trades in this period</td></tr>}
                    {visible.map((t) => (
                      <tr key={`${t.entryTs}-${t.setupKey}`}>
                        <td>{fmtDateTime(t.entryTs)}</td>
                        <td className="gb-l">{setupLabel(t.setupName)}</td>
                        <td className="gb-hide-sm">{price(t.entryPrice)}</td>
                        <td className="gb-hide-sm">{price(t.exitPrice)}</td>
                        <td className="gb-l" title={t.legs.length > 1 ? `${t.legs.length} legs (reversed)` : t.exitReason}>
                          {exitLabel(t.exitReason)}{t.legs.length > 1 && <span className="gb-muted gb-legs"> · {t.legs.length} legs</span>}
                        </td>
                        <td className={tone(t.points)}>{signed(t.points, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {trades.length > 25 && (
                <button type="button" className="gb-link-btn" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show latest 25' : `Show all ${trades.length} trades`}
                </button>
              )}
            </section>
          </div>

          {result.info.skipped.length > 0 && (
            <details className="gb-details">
              <summary>{result.info.skipped.length} week{result.info.skipped.length === 1 ? '' : 's'} skipped (no data)</summary>
              <ul>
                {result.info.skipped.map((s) => <li key={s.baseStart}>Base week from {s.baseStart}, expiry {s.expiryDate}: {s.reason}</li>)}
              </ul>
            </details>
          )}
        </>
      )}

      {history.length > 0 && (
        <section aria-labelledby="runs" className="gb-section">
          <div className="gb-section-head">
            <h2 id="runs" className="gb-h2">Earlier runs</h2>
            {strategy && <button type="button" className="gb-link-btn" onClick={() => onEditStrategy(strategy.id)}>Edit strategy</button>}
          </div>
          <div className="gb-list">
            {history.map((b, i) => (
              <React.Fragment key={b.id}>
                {i > 0 && <div className="gb-sep" />}
                <div className={`gb-run${result?.id === b.id ? ' current' : ''}`}>
                  <button type="button" className="gb-run-main" onClick={() => open(b.id)} disabled={b.status !== 'done'}>
                    <span>{b.from} → {b.to}</span>
                    <span className="gb-muted">
                      {b.status === 'done'
                        ? `${b.metrics.trades} trades · ${pct(b.metrics.winRate)} · run ${fmtDateTime(b.createdAt)}`
                        : b.status === 'failed' ? `Failed: ${b.error}` : 'Running…'}
                    </span>
                  </button>
                  {b.status === 'done' && <b className={tone(b.metrics.points)}>{signed(b.metrics.points)} pts</b>}
                  <button type="button" className="gb-link-btn gb-run-delete" onClick={() => remove(b.id)} aria-label={`Delete run ${b.from} to ${b.to}`}>Delete</button>
                </div>
              </React.Fragment>
            ))}
          </div>
        </section>
      )}
    </>
  );
};

export default BacktestPage;

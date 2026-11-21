import React, { useCallback, useEffect, useMemo, useState } from 'react';
import StrategyService from '../../services/StrategyService';
import TradingService from '../../services/TradingService';

const inr = (v) => {
  if (!Number.isFinite(v)) return '—';
  const s = Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}₹${s}`;
};

// Kite's own P&L formula: realised + unrealised, valid for open and closed rows.
const livePnl = (p) =>
  (Number(p.sell_value) || 0) - (Number(p.buy_value) || 0)
  + (Number(p.quantity) || 0) * (Number(p.last_price) || 0) * (Number(p.multiplier) || 1);

const STATUS_LABEL = { draft: 'Draft', active: 'Live', paused: 'Paused' };

const StrategiesPage = ({ onOpen, onNew, onBacktest }) => {
  const [strategies, setStrategies] = useState(null);
  const [error, setError] = useState(null);
  const [positions, setPositions] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      setStrategies(await StrategyService.list());
      setError(null);
    } catch (e) {
      setError(e.message);
      setStrategies((s) => s || []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let alive = true;
    TradingService.getPositions()
      .then((p) => alive && setPositions(p?.net || []))
      .catch(() => alive && setPositions(null));
    return () => { alive = false; };
  }, []);

  const dayPnl = useMemo(() => (positions ? positions.reduce((sum, p) => sum + livePnl(p), 0) : null), [positions]);
  const openPositions = positions ? positions.filter((p) => Number(p.quantity) !== 0).length : null;
  const liveCount = strategies ? strategies.filter((s) => s.status === 'active').length : 0;

  const toggleLive = async (s) => {
    setBusy(s.id);
    try {
      const updated = await StrategyService.update(s.id, { status: s.status === 'active' ? 'paused' : 'active' });
      setStrategies((list) => list.map((x) => (x.id === s.id ? updated : x)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="gb-page-head">
        <div>
          <h1 className="gb-title">Strategies</h1>
          <p className="gb-subtitle">One set of rules for backtests and live signals.</p>
        </div>
        <button type="button" className="gb-btn gb-btn-primary" onClick={onNew}>
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New Strategy
        </button>
      </div>

      <section aria-label="Today" className="gb-card gb-stats">
        <div className="gb-stat">
          <span className="gb-stat-label">Day P&amp;L</span>
          <strong className={`gb-stat-value ${dayPnl > 0 ? 'gb-pos' : dayPnl < 0 ? 'gb-neg' : ''}`}>{inr(dayPnl)}</strong>
        </div>
        <div className="gb-stat">
          <span className="gb-stat-label">Open positions</span>
          <strong className="gb-stat-value">{openPositions ?? '—'}</strong>
        </div>
        <div className="gb-stat">
          <span className="gb-stat-label">Live strategies</span>
          <strong className="gb-stat-value">{liveCount} <small>of {strategies?.length ?? 0}</small></strong>
        </div>
      </section>

      <section aria-labelledby="lib" className="gb-section">
        <div className="gb-section-head">
          <h2 id="lib" className="gb-h2">Library</h2>
          <span className="gb-muted">Live signals start running in Phase 3. Switching a strategy on now queues it for the engine.</span>
        </div>

        {error && <div className="gb-note gb-note-error" role="alert">{error}</div>}

        <div className="gb-list">
          {strategies === null && <div className="gb-empty"><p>Loading strategies…</p></div>}
          {strategies?.length === 0 && !error && (
            <div className="gb-empty">
              <p>No strategies yet.</p>
              <button type="button" className="gb-btn gb-btn-primary" onClick={onNew}>Create your first strategy</button>
            </div>
          )}
          {strategies?.map((s, i) => (
            <React.Fragment key={s.id}>
              {i > 0 && <div className="gb-sep" />}
              <div className="gb-strat-row">
                <div className="gb-strat-main">
                  <div className="gb-strat-name">
                    <button type="button" onClick={() => onOpen(s.id)}>{s.name}</button>
                    {s.status !== 'active' && <span className={`gb-badge gb-badge-${s.status}`}>{STATUS_LABEL[s.status]}</span>}
                  </div>
                  <span className="gb-strat-meta">{s.summary} · not backtested yet</span>
                </div>
                <div className="gb-strat-actions">
                  <button type="button" className="gb-pill" onClick={() => onBacktest(s.id)}>Run Backtest</button>
                  <label className="gb-switch-label">
                    Live
                    <input
                      type="checkbox"
                      role="switch"
                      checked={s.status === 'active'}
                      disabled={busy === s.id}
                      onChange={() => toggleLive(s)}
                      aria-label={`Live signals for ${s.name}`}
                    />
                  </label>
                </div>
              </div>
            </React.Fragment>
          ))}
        </div>
      </section>
    </>
  );
};

export default StrategiesPage;

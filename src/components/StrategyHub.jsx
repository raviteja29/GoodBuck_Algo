import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TradingService from '../services/TradingService';
import GiftNiftyBacktest from './GiftNiftyBacktest';
import './StrategyHub.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'backtest', label: 'Backtest' },
  { id: 'positions', label: 'Positions' },
  { id: 'orders', label: 'Orders' },
];

const REFRESH_MS = 15000;

const inr = (value) =>
  Number.isFinite(value)
    ? value.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    : '--';
const num = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '--');
const pct = (value) => (Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '--');
const tone = (value) => (value > 0 ? 'pos' : value < 0 ? 'neg' : '');

// Kite's own P&L formula: realised + unrealised, valid for open and closed rows.
const livePnl = (p) =>
  (Number(p.sell_value) || 0) - (Number(p.buy_value) || 0)
  + (Number(p.quantity) || 0) * (Number(p.last_price) || 0) * (Number(p.multiplier) || 1);

/** Aggregate backtest trades into the numbers a trader actually checks. */
function backtestMetrics(trades = []) {
  if (!trades.length) return null;
  let equity = 0, peak = 0, maxDrawdown = 0, grossWin = 0, grossLoss = 0, wins = 0, losses = 0;
  for (const t of trades) {
    equity += t.points;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    if (t.points > 0) { wins += 1; grossWin += t.points; }
    else if (t.points < 0) { losses += 1; grossLoss += Math.abs(t.points); }
  }
  return {
    trades: trades.length,
    points: equity,
    winRate: wins / trades.length,
    avgWin: wins ? grossWin / wins : 0,
    avgLoss: losses ? -grossLoss / losses : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : null,
    maxDrawdown,
  };
}

const Stat = ({ label, value, className = '', hint }) => (
  <div className="hub-stat">
    <span className="hub-stat-label">{label}</span>
    <strong className={`hub-stat-value ${className}`}>{value}</strong>
    {hint && <span className="hub-stat-hint">{hint}</span>}
  </div>
);

const StrategyHub = () => {
  const [tab, setTab] = useState('overview');
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [brokerError, setBrokerError] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [backtest, setBacktest] = useState(null);

  const refresh = useCallback(async () => {
    const [pos, ord] = await Promise.allSettled([TradingService.getPositions(), TradingService.getOrders()]);
    if (pos.status === 'fulfilled') setPositions(pos.value?.net || []);
    if (ord.status === 'fulfilled') setOrders(Array.isArray(ord.value) ? ord.value : ord.value?.data || []);
    const failed = [pos, ord].find((r) => r.status === 'rejected');
    setBrokerError(failed ? failed.reason?.message || 'Broker request failed' : null);
    setLastSync(new Date());
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const onOrderUpdate = () => refresh();
    window.addEventListener('orderUpdate', onOrderUpdate);
    return () => {
      clearInterval(timer);
      window.removeEventListener('orderUpdate', onOrderUpdate);
    };
  }, [refresh]);

  // Live LTP for position rows; P&L is recomputed from the broker's buy/sell values.
  useEffect(() => {
    return TradingService.subscribeToTicks((ticks) => {
      if (!Array.isArray(ticks) || !ticks.length) return;
      const ltp = new Map(ticks.map((t) => [Number(t.instrument_token), t.last_price]));
      setPositions((prev) => {
        let changed = false;
        const next = prev.map((p) => {
          const price = ltp.get(Number(p.instrument_token));
          if (price === undefined || price === p.last_price) return p;
          changed = true;
          return { ...p, last_price: price };
        });
        return changed ? next : prev;
      });
    });
  }, []);

  const day = useMemo(() => {
    const pnl = positions.reduce((s, p) => s + livePnl(p), 0);
    const open = positions.filter((p) => Number(p.quantity) !== 0);
    const count = (status) => orders.filter((o) => o.status === status).length;
    return {
      pnl,
      openPositions: open.length,
      complete: count('COMPLETE'),
      rejected: count('REJECTED'),
      pending: orders.filter((o) => ['OPEN', 'TRIGGER PENDING', 'AMO REQ RECEIVED'].includes(o.status)).length,
      total: orders.length,
    };
  }, [positions, orders]);

  const bt = useMemo(() => backtestMetrics(backtest?.strategyTrades), [backtest]);

  return (
    <div className="hub">
      <header className="hub-header">
        <div>
          <h1>Strategies</h1>
          <p>
            Backtest, live positions and orders in one place
            {lastSync && <> · synced {lastSync.toLocaleTimeString('en-IN')}</>}
          </p>
        </div>
        <button type="button" className="hub-btn" onClick={refresh}>Refresh</button>
      </header>

      <nav className="hub-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'positions' && day.openPositions > 0 && <span className="hub-badge">{day.openPositions}</span>}
            {t.id === 'orders' && day.pending > 0 && <span className="hub-badge">{day.pending}</span>}
          </button>
        ))}
      </nav>

      {brokerError && tab !== 'backtest' && (
        <div className="hub-error">Broker data unavailable: {brokerError}. Log in to Zerodha to load positions and orders.</div>
      )}

      {tab === 'overview' && (
        <section className="hub-panel">
          <h2>Today (live)</h2>
          <div className="hub-stats">
            <Stat label="Day P&L" value={inr(day.pnl)} className={tone(day.pnl)} />
            <Stat label="Open positions" value={day.openPositions} />
            <Stat label="Orders filled" value={day.complete} hint={`${day.total} total`} />
            <Stat label="Pending" value={day.pending} />
            <Stat label="Rejected" value={day.rejected} className={day.rejected ? 'neg' : ''} />
          </div>

          <h2>Strategy backtest</h2>
          {bt ? (
            <>
              <div className="hub-stats">
                <Stat label="Net points" value={num(bt.points)} className={tone(bt.points)} />
                <Stat label="Trades" value={bt.trades} />
                <Stat label="Win rate" value={pct(bt.winRate)} />
                <Stat label="Profit factor" value={bt.profitFactor == null ? '∞' : num(bt.profitFactor)} />
                <Stat label="Avg win / loss" value={`${num(bt.avgWin)} / ${num(bt.avgLoss)}`} />
                <Stat label="Max drawdown" value={num(bt.maxDrawdown)} className={bt.maxDrawdown ? 'neg' : ''} hint="points" />
              </div>
              {backtest.strategySummary?.length > 0 && (
                <div className="hub-table-wrap">
                  <table className="hub-table">
                    <thead>
                      <tr><th>Setup</th><th>Side</th><th>Trades</th><th>Win rate</th><th>Net pts</th><th>Avg pts</th></tr>
                    </thead>
                    <tbody>
                      {backtest.strategySummary.map((s) => (
                        <tr key={s.setupKey}>
                          <td>{s.setupName}</td>
                          <td className={s.side === 'long' ? 'pos' : 'neg'}>{s.side}</td>
                          <td>{s.trades}</td>
                          <td>{pct(s.trades ? s.wins / s.trades : NaN)}</td>
                          <td className={tone(s.points)}>{num(s.points)}</td>
                          <td>{num(s.trades ? s.points / s.trades : NaN)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="hub-empty">
              No backtest run yet in this session.{' '}
              <button type="button" className="hub-link" onClick={() => setTab('backtest')}>Run one</button>
            </div>
          )}
        </section>
      )}

      {/* Kept mounted so a finished backtest survives switching tabs. */}
      <div style={{ display: tab === 'backtest' ? 'block' : 'none' }}>
        <GiftNiftyBacktest onResult={setBacktest} />
      </div>

      {tab === 'positions' && (
        <section className="hub-panel">
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead>
                <tr><th>Symbol</th><th>Product</th><th>Qty</th><th>Avg</th><th>LTP</th><th>P&L</th></tr>
              </thead>
              <tbody>
                {positions.length === 0 ? (
                  <tr><td colSpan="6" className="hub-empty">No positions today</td></tr>
                ) : positions.map((p) => {
                  const pnl = livePnl(p);
                  return (
                    <tr key={`${p.instrument_token}-${p.product}`} className={Number(p.quantity) === 0 ? 'closed' : ''}>
                      <td>{p.tradingsymbol}<small>{p.exchange}</small></td>
                      <td>{p.product}</td>
                      <td className={tone(Number(p.quantity))}>{p.quantity}</td>
                      <td>{num(p.average_price)}</td>
                      <td>{num(p.last_price)}</td>
                      <td className={tone(pnl)}>{inr(pnl)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {positions.length > 0 && (
                <tfoot>
                  <tr><td colSpan="5">Total</td><td className={tone(day.pnl)}>{inr(day.pnl)}</td></tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {tab === 'orders' && (
        <section className="hub-panel">
          <div className="hub-table-wrap">
            <table className="hub-table">
              <thead>
                <tr><th>Time</th><th>Symbol</th><th>Side</th><th>Type</th><th>Qty</th><th>Price</th><th>Status</th></tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan="7" className="hub-empty">No orders today</td></tr>
                ) : [...orders]
                  .sort((a, b) => String(b.order_timestamp).localeCompare(String(a.order_timestamp)))
                  .map((o) => (
                    <tr key={o.order_id}>
                      <td>{String(o.order_timestamp || '').slice(11, 19) || '--'}</td>
                      <td>{o.tradingsymbol}{o.tag && <small>{o.tag}</small>}</td>
                      <td className={o.transaction_type === 'BUY' ? 'pos' : 'neg'}>{o.transaction_type}</td>
                      <td>{o.order_type}</td>
                      <td>{o.filled_quantity ?? 0}/{o.quantity}</td>
                      <td>{num(Number(o.average_price) || Number(o.price))}</td>
                      <td>
                        <span className={`hub-status s-${String(o.status).toLowerCase().replace(/\s+/g, '-')}`} title={o.status_message || ''}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

export default StrategyHub;

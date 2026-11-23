import React, { useEffect, useMemo, useState } from 'react';
import { BacktestService } from '../../services/StrategyService';
import CandleChart from './CandleChart';

const IST = 'Asia/Kolkata';
const fmtTime = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
const vsText = (d) => `${Math.abs(d).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${d >= 0 ? 'above' : 'below'}`;
const POSITION_TEXT = { 'above-both': 'above both lines', between: 'between the lines', 'below-both': 'below both lines' };
const px = (v) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');

// Colours: candles up/down; fast line yellow and slow line white, like the user's own charts.
const C = { up: '#30D158', down: '#FF453A', fast: '#FFD60A', slow: '#E5E5EA', overlay: '#FF9F0A', stop: '#FF453A', target: '#30D158', touch: '#64D2FF', grid: '#38383A' };

/**
 * Candles around one trade on the TradingView-style chart (drag, zoom, crosshair),
 * with both trend lines, every trade in view as markers, and the selected trade's
 * stop / target / touch-point lines.
 */
export default function TradeChart({ backtestId, trade }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    // ~2 weeks either side of the trade, so there's room to scroll.
    BacktestService.chart(backtestId, trade?.entryTs, { before: 1500, after: 1500 })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [backtestId, trade?.entryTs]);

  const sel = trade && data?.trades?.find((t) => t.entryTs === trade.entryTs);

  const indicators = useMemo(() => (data ? [
    { key: 'fast', label: data.labels.fast, color: C.fast },
    { key: 'slow', label: data.labels.slow, color: C.slow },
    ...(data.overlay ? [{ key: 'overlay', label: data.labels.overlay, color: C.overlay, dashed: true }] : []),
  ] : null), [data]);

  const bars = useMemo(() => (data ? data.bars.map((b, i) => ({
    ...b, fast: data.fast[i], slow: data.slow[i], overlay: data.overlay ? data.overlay[i] : null,
  })) : null), [data]);

  const markers = useMemo(() => {
    if (!data) return [];
    const out = [];
    for (const t of data.trades) {
      const isSel = sel && t.entryTs === sel.entryTs;
      const long = t.side === 'long';
      out.push({ t: t.entryTs, position: long ? 'belowBar' : 'aboveBar', shape: long ? 'arrowUp' : 'arrowDown', color: long ? C.up : C.down,
        text: isSel ? `${long ? 'Long' : 'Short'} ${px(t.entryPrice)}` : '', size: isSel ? 2 : 1 });
      out.push({ t: t.exitTs, position: long ? 'aboveBar' : 'belowBar', shape: 'circle', color: t.points >= 0 ? C.up : C.down,
        text: isSel ? `Exit ${px(t.exitPrice)} · ${t.exitReason}` : '', size: isSel ? 1.5 : 0.8 });
    }
    if (sel?.touchTs) out.push({ t: sel.touchTs, position: sel.side === 'long' ? 'belowBar' : 'aboveBar', shape: 'circle', color: C.touch, text: 'First touch' });
    return out;
  }, [data, sel]);

  const lines = useMemo(() => (sel ? [
    { price: sel.stop, color: C.stop, title: 'Stop' },
    { price: sel.target, color: C.target, title: 'Target' },
    { price: sel.touchPoint, color: C.touch, title: 'Touch' },
  ].filter((l) => Number.isFinite(l.price)) : []), [sel]);

  const focus = useMemo(() => (sel ? {
    from: Math.min(sel.touchTs || sel.entryTs, sel.entryTs) - 12 * 3600e3,
    to: sel.exitTs + 6 * 3600e3,
  } : null), [sel]);

  if (error) return <div className="gb-note gb-note-error" role="alert">{error}</div>;
  if (!data || !bars) return <div className="gb-card gb-chart-empty">Loading chart…</div>;
  if (!bars.length) return <div className="gb-card gb-chart-empty">No candles saved for this period.</div>;

  const header = (
    <>
      {sel && <span className="gb-muted">{sel.setupName} · {fmtTime(sel.entryTs)} → {fmtTime(sel.exitTs)} · {sel.exitReason}</span>}
      {sel?.overlay && (
        <div className="gb-tc-ma">
          {sel.overlay.atTouch != null && <span><b>{sel.overlay.label}</b> at first touch ({fmtTime(sel.touchTs)}) <b>{px(sel.overlay.atTouch)}</b>{sel.overlay.touchVsLine != null && <> · price {vsText(sel.overlay.touchVsLine)}</>}</span>}
          {sel.overlay.entryPosition && <span><b>{sel.overlay.label}</b> at entry <b>{px(sel.overlay.atEntry)}</b> · {data.labels.fast} {px(sel.overlay.fastAtEntry)} · {data.labels.slow} {px(sel.overlay.slowAtEntry)} → <b>{POSITION_TEXT[sel.overlay.entryPosition]}</b></span>}
          <span>{sel.overlay.atTouch == null && <b>{sel.overlay.label} </b>}at entry <b>{px(sel.overlay.atEntry)}</b>{sel.overlay.entryVsLine != null && <> · price {vsText(sel.overlay.entryVsLine)}</>}</span>
          <span>at exit ({sel.exitReason}) <b>{px(sel.overlay.atExit)}</b>{sel.overlay.exitVsLine != null && <> · price {vsText(sel.overlay.exitVsLine)}</>}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="gb-card gb-tc gb-tc-v2">
      <CandleChart
        key={indicators.map((i) => i.key).join(',')}
        bars={bars}
        minutes={15}
        indicators={indicators}
        markers={markers}
        lines={lines}
        focus={focus}
        title="GIFT NIFTY"
        showVolume={false}
        height={440}
        header={header}
        focusLabel="Back to trade"
      />
    </div>
  );
}

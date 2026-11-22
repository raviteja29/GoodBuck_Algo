import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BacktestService } from '../../services/StrategyService';

const IST = 'Asia/Kolkata';
const fmtTime = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
const fmtDay = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: '2-digit', month: 'short' }).format(new Date(ms));
const px = (v) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');

// Colours: candles up/down; fast line yellow and slow line white, like the user's own charts.
const C = { up: '#30D158', down: '#FF453A', fast: '#FFD60A', slow: '#E5E5EA', stop: '#FF453A', target: '#30D158', touch: '#64D2FF', grid: '#38383A' };

/**
 * 15-minute candles around one trade, with both trend lines, every trade in view,
 * and the selected trade's stop / target / touch-point lines.
 */
export default function TradeChart({ backtestId, trade }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  const area = useRef(null);

  useEffect(() => {
    let alive = true;
    setError(null);
    BacktestService.chart(backtestId, trade?.entryTs)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [backtestId, trade?.entryTs]);

  const geo = useMemo(() => {
    if (!data?.bars?.length) return null;
    const W = 1000, H = 360, n = data.bars.length;
    let lo = Infinity, hi = -Infinity;
    data.bars.forEach((b) => { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); });
    [trade?.stop, trade?.target].forEach((v) => { if (Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); } });
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
    const step = W / n;
    const x = (i) => (i + 0.5) * step;
    const y = (v) => ((hi - v) / (hi - lo)) * H;
    const idxOf = (ts) => { const k = data.bars.findIndex((b) => b.t >= ts); return k < 0 ? n - 1 : k; };
    const line = (arr) => arr.map((v, i) => (Number.isFinite(v) ? `${x(i).toFixed(1)},${y(v).toFixed(1)}` : null)).filter(Boolean).join(' ');
    return { W, H, n, step, x, y, lo, hi, idxOf, fastLine: line(data.fast), slowLine: line(data.slow) };
  }, [data, trade]);

  if (error) return <div className="gb-note gb-note-error" role="alert">{error}</div>;
  if (!geo) return <div className="gb-card gb-chart-empty">Loading chart…</div>;

  const pct = (v, total) => `${(v / total) * 100}%`;
  const sel = trade && data.trades.find((t) => t.entryTs === trade.entryTs);
  const selStart = sel ? geo.idxOf(sel.entryTs) : 0;
  const selEnd = sel ? geo.idxOf(sel.exitTs) : 0;
  const levelLine = (v, color, label) => (Number.isFinite(v) && (
    <div className="gb-tc-level" style={{ top: pct(geo.y(v), geo.H), left: pct(geo.x(selStart), geo.W), width: pct(Math.max(geo.x(selEnd) - geo.x(selStart), geo.step * 3), geo.W), borderColor: color }}>
      <span style={{ color }}>{label} {px(v)}</span>
    </div>
  ));
  const h = hover != null ? data.bars[hover] : null;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (geo.n - 1)));

  const onMove = (e) => {
    const r = area.current.getBoundingClientRect();
    setHover(Math.max(0, Math.min(geo.n - 1, Math.floor(((e.clientX - r.left) / r.width) * geo.n))));
  };

  return (
    <div className="gb-card gb-tc">
      <div className="gb-tc-head">
        <div className="gb-tc-legend">
          <span><i style={{ background: C.fast }} />{data.labels.fast}</span>
          <span><i style={{ background: C.slow }} />{data.labels.slow}</span>
          {sel && <span><i style={{ background: C.stop }} />Stop</span>}
          {sel && <span><i style={{ background: C.target }} />Target</span>}
          {sel?.touchPoint != null && <span><i style={{ background: C.touch }} />Touch point</span>}
        </div>
        {sel && <span className="gb-muted">{sel.setupName} · {fmtTime(sel.entryTs)} → {fmtTime(sel.exitTs)} · {sel.exitReason}</span>}
      </div>
      <div className="gb-tc-plot">
        <div className="gb-tc-area" ref={area} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <svg
            viewBox={`0 0 ${geo.W} ${geo.H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`15-minute candles from ${fmtTime(data.bars[0].t)} to ${fmtTime(data.bars.at(-1).t)} with ${data.labels.fast} and ${data.labels.slow}${sel ? `; selected ${sel.setupName} entered at ${px(sel.entryPrice)} and exited at ${px(sel.exitPrice)} (${sel.exitReason})` : ''}`}
          >
            {data.bars.map((b, i) => {
              const up = b.c >= b.o;
              const top = geo.y(Math.max(b.o, b.c));
              const bh = Math.max(Math.abs(geo.y(b.o) - geo.y(b.c)), 0.8);
              return (
                <g key={b.t}>
                  <line x1={geo.x(i)} x2={geo.x(i)} y1={geo.y(b.h)} y2={geo.y(b.l)} stroke={up ? C.up : C.down} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <rect x={geo.x(i) - geo.step * 0.32} width={geo.step * 0.64} y={top} height={bh} fill={up ? C.up : C.down} />
                </g>
              );
            })}
            <polyline points={geo.slowLine} fill="none" stroke={C.slow} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
            <polyline points={geo.fastLine} fill="none" stroke={C.fast} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
          </svg>

          {sel && levelLine(sel.stop, C.stop, 'Stop')}
          {sel && levelLine(sel.target, C.target, 'Target')}
          {sel && sel.touchPoint != null && levelLine(sel.touchPoint, C.touch, 'Touch')}

          {data.trades.map((t) => {
            const ei = geo.idxOf(t.entryTs), xi = geo.idxOf(t.exitTs);
            const isSel = sel && t.entryTs === sel.entryTs;
            return (
              <React.Fragment key={t.entryTs}>
                <span
                  className={`gb-tc-mark ${t.side}${isSel ? ' sel' : ''}`}
                  style={{ left: pct(geo.x(ei), geo.W), top: pct(geo.y(t.entryPrice), geo.H) }}
                  title={`${t.setupName} entry ${px(t.entryPrice)}`}
                />
                <span
                  className={`gb-tc-exit${isSel ? ' sel' : ''}`}
                  style={{ left: pct(geo.x(xi), geo.W), top: pct(geo.y(t.exitPrice), geo.H) }}
                  title={`Exit ${px(t.exitPrice)} (${t.exitReason})`}
                />
              </React.Fragment>
            );
          })}

          {h && (
            <>
              <span className="gb-crosshair" style={{ left: pct(geo.x(hover), geo.W) }} />
              <div className={`gb-tooltip${hover > geo.n * 0.65 ? ' left' : ''}`} style={{ left: pct(geo.x(hover), geo.W) }}>
                <b>{fmtTime(h.t)}</b>
                <span>O {px(h.o)} · H {px(h.h)}</span>
                <span>L {px(h.l)} · C {px(h.c)}</span>
                <span style={{ color: C.fast }}>{data.labels.fast} {px(data.fast[hover])}</span>
                <span>{data.labels.slow} {px(data.slow[hover])}</span>
              </div>
            </>
          )}
        </div>
        <div className="gb-tc-y" aria-hidden="true">
          {[geo.hi, (geo.hi + geo.lo) / 2, geo.lo].map((v, k) => <span key={k} style={{ top: pct(geo.y(v), geo.H) }}>{px(v)}</span>)}
        </div>
      </div>
      <div className="gb-tc-x" aria-hidden="true">
        {ticks.map((i) => <span key={i}>{fmtDay(data.bars[i].t)}</span>)}
      </div>
    </div>
  );
}

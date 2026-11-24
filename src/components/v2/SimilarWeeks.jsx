import React, { useEffect, useState } from 'react';
import { OptionsService } from '../../services/StrategyService';

const DAYS = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
const fmtWeek = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(ms));
const fmtNum = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');

/** Small chart: a past week's whole path (% from its first price) with this week so far over it. */
function MiniPath({ past, current, upTo, label }) {
  const W = 320, H = 120, P = 6;
  const all = [...past, ...current].map((p) => p[1]);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const pad = (hi - lo) * 0.1 || 0.1;
  const y = (v) => P + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - 2 * P);
  const x = (k) => (k / 168) * W;
  // Break the line over gaps (the weekend) instead of drawing a straight bridge.
  const segments = (pts) => pts.reduce((out, p, i) => {
    if (!i || p[0] - pts[i - 1][0] > 6) out.push([]);
    out[out.length - 1].push(`${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`);
    return out;
  }, []).map((seg) => seg.join(' '));
  return (
    <svg className="gb-sim-svg" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${label}: whole week in grey, this week so far in blue, as % moves from each week's first price`}>
      {DAYS.map((d, i) => <line key={d} x1={x(i * 24)} x2={x(i * 24)} y1={0} y2={H} stroke="var(--gb-separator)" strokeWidth="1" />)}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--gb-separator)" strokeDasharray="3 3" />
      <line x1={x(upTo)} x2={x(upTo)} y1={0} y2={H} stroke="var(--gb-text-3)" strokeDasharray="2 3" />
      {segments(past).map((p, i) => <polyline key={`p${i}`} points={p} fill="none" stroke="#A1A1A6" strokeWidth="2" />)}
      {segments(current).map((p, i) => <polyline key={`c${i}`} points={p} fill="none" stroke="#0A84FF" strokeWidth="2" />)}
    </svg>
  );
}

/** "Similar weeks" panel: this week's GIFT NIFTY vs the past 3 years; options once enough weeks are saved. */
export default function SimilarWeeks() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () => OptionsService.similar().then((d) => alive && (setData(d), setError(null))).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15 * 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const g = data?.gift;
  const o = data?.options;

  return (
    <section className="gb-section" aria-labelledby="gb-sim-title">
      <button type="button" className="gb-opt-week" aria-expanded={open} aria-controls="gb-sim-body" onClick={() => setOpen((v) => !v)}>
        <span className="gb-opt-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span id="gb-sim-title" className="gb-h2">Similar weeks</span>
        <span className="gb-muted gb-opt-week-meta">
          {g?.status === 'ok' ? `GIFT NIFTY · this week vs ${g.weeksCompared} past weeks` : 'GIFT NIFTY · this week vs past weeks'}
        </span>
      </button>
      {open && (
        <div id="gb-sim-body" className="gb-sim">
          {error && <div className="gb-card gb-opt-msg" role="alert">{error}</div>}
          {!data && !error && <div className="gb-card gb-opt-msg">Comparing weeks…</div>}
          {g && g.status !== 'ok' && (
            <div className="gb-card gb-opt-msg">
              {g.status === 'no-data' && 'No GIFT NIFTY history yet. It downloads (up to 3 years) on the next save after you log in.'}
              {g.status === 'week-not-started' && 'This week (from Wednesday) has no candles yet.'}
              {g.status === 'too-early' && `This week has ${g.hoursSoFar} hour${g.hoursSoFar === 1 ? '' : 's'} of candles so far; matching starts after ${g.hoursNeeded}.`}
            </div>
          )}
          {g?.status === 'ok' && (
            <>
              <p className="gb-muted gb-sim-help">
                Each week is drawn as % moves from its first price, compared up to the same point in the week (dotted line).
                Score = 50% shape + 25% size of the moves + 25% how HMA 50 and HMA 130 sit. "Then" is what that week did from this point to its end.
              </p>
              <div className="gb-sim-grid">
                {g.matches.map((m, i) => {
                  const up = m.next.direction === 'up';
                  return (
                    <article key={m.weekStart} className="gb-card gb-sim-card" aria-label={`Match ${i + 1}: week of ${fmtWeek(m.weekStart)}, score ${m.score}`}>
                      <div className="gb-sim-head">
                        <div>
                          <div className="gb-sim-week">Week of {fmtWeek(m.weekStart)}</div>
                          <div className="gb-muted">Shape {m.parts.shape} · Size {m.parts.size} · HMA {m.parts.hma}</div>
                        </div>
                        <div className="gb-sim-score"><b>{m.score}</b><span className="gb-muted">/100</span></div>
                      </div>
                      <MiniPath past={m.path} current={g.current} upTo={g.upToHour} label={`Week of ${fmtWeek(m.weekStart)}`} />
                      <div className="gb-sim-legend">
                        <span><i style={{ background: '#0A84FF' }} />This week</span>
                        <span><i style={{ background: '#A1A1A6' }} />That week</span>
                      </div>
                      <div className="gb-sim-next">
                        <span className="gb-muted">Then</span>
                        <b className={m.next.points == null ? '' : up ? 'gb-pos' : 'gb-neg'}>
                          {m.next.points == null ? '—' : `${up ? '▲' : m.next.direction === 'down' ? '▼' : '■'} ${m.next.points > 0 ? '+' : ''}${fmtNum(m.next.points)} pts (${m.next.pct > 0 ? '+' : ''}${fmtNum(m.next.pct, 2)}%)`}
                        </b>
                        <span>{m.next.touches} touch{m.next.touches === 1 ? '' : 'es'} · {m.next.touchesInMarketHours} in market hours</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
          {o && (
            <div className="gb-card gb-opt-msg">
              <b>Options similarity</b> · {o.status === 'collecting'
                ? `collecting option history: ${o.weeksSaved} of ${o.weeksNeeded} weeks saved. Matching starts once ${o.weeksNeeded} weeks are saved.`
                : `${o.weeksSaved} weeks saved — option matching will be switched on next.`}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

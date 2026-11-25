import React, { useEffect, useState } from 'react';
import { OptionsService } from '../../services/StrategyService';

const IST = 'Asia/Kolkata';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = 86400000;
const fmt = (ms, opts) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...opts }).format(new Date(ms));
// A stretch runs 06:00 → 06:00 IST, so its last day is the one before its end.
const fmtRange = (start, end, year = true) => `${fmt(start, { weekday: 'short', day: '2-digit', month: 'short' })} – ${fmt(end - DAY + 1, { weekday: 'short', day: '2-digit', month: 'short', ...(year ? { year: 'numeric' } : {}) })}`;

/** Small chart: a past 7-day stretch (% from its first price) with the last 7 days over it. */
function MiniPath({ past, current, weekStart, label }) {
  const W = 320, H = 132, P = 6, AXIS = 14;
  const all = [...past, ...current].map((p) => p[1]);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const pad = (hi - lo) * 0.1 || 0.1;
  const y = (v) => P + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - AXIS - 2 * P);
  const x = (k) => (k / 168) * W;
  const first = new Date(weekStart + 330 * 60000).getUTCDay();
  const days = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(first + i) % 7]);
  // Break the line over gaps (the weekend) instead of drawing a straight bridge.
  const segments = (pts) => pts.reduce((out, p, i) => {
    if (!i || p[0] - pts[i - 1][0] > 6) out.push([]);
    out[out.length - 1].push(`${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`);
    return out;
  }, []).map((seg) => seg.join(' '));
  return (
    <svg className="gb-sim-svg" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${label}: that stretch in grey, the last 7 days in blue, as % moves from each one's first price`}>
      {days.map((d, i) => (
        <g key={i}>
          <line x1={x(i * 24)} x2={x(i * 24)} y1={0} y2={H - AXIS} stroke="var(--gb-separator)" strokeWidth="1" />
          <text x={x(i * 24 + 12)} y={H - 3} textAnchor="middle" fontSize="10" fill="var(--gb-text-3)">{d}</text>
        </g>
      ))}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--gb-separator)" strokeDasharray="3 3" />
      {segments(past).map((p, i) => <polyline key={`p${i}`} points={p} fill="none" stroke="#A1A1A6" strokeWidth="2" />)}
      {segments(current).map((p, i) => <polyline key={`c${i}`} points={p} fill="none" stroke="#0A84FF" strokeWidth="2" />)}
    </svg>
  );
}

/** "Similar weeks" panel: the last 7 complete days of GIFT NIFTY vs the past 3 years; options once enough weeks are saved. */
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
          {g?.weekStart ? `GIFT NIFTY · ${fmtRange(g.weekStart, g.weekEnd, false)}${g.status === 'ok' ? ` vs ${g.weeksCompared} earlier weeks` : ''}` : 'GIFT NIFTY · last 7 days vs past weeks'}
        </span>
      </button>
      {open && (
        <div id="gb-sim-body" className="gb-sim">
          {error && <div className="gb-card gb-opt-msg" role="alert">{error}</div>}
          {!data && !error && <div className="gb-card gb-opt-msg">Comparing weeks…</div>}
          {g && g.status !== 'ok' && (
            <div className="gb-card gb-opt-msg">
              {g.status === 'no-data' && 'No GIFT NIFTY history yet. It downloads (up to 3 years) on the next save after you log in.'}
              {g.status === 'too-early' && `The last 7 days have only ${g.hoursSoFar} hour${g.hoursSoFar === 1 ? '' : 's'} of saved candles; matching needs ${g.hoursNeeded}. Log in so the missing days download.`}
            </div>
          )}
          {g?.status === 'ok' && (
            <>
              <p className="gb-muted gb-sim-help">
                The last 7 complete days ({fmtRange(g.weekStart, g.weekEnd)}) matched against every earlier 7 days that start on the same weekday.
                A day runs 06:00 → 06:00 IST, night session included; after each day completes, the window moves on by a day.
                Each is drawn as % moves from its first price. Score = 50% shape + 25% size of the moves + 25% how HMA 50 and HMA 130 sit.
              </p>
              <div className="gb-sim-grid">
                {g.matches.map((m, i) => (
                  <article key={m.weekStart} className="gb-card gb-sim-card" aria-label={`Match ${i + 1}: ${fmtRange(m.weekStart, m.weekEnd)}, score ${m.score}`}>
                    <div className="gb-sim-head">
                      <div>
                        <div className="gb-sim-week">{fmtRange(m.weekStart, m.weekEnd)}</div>
                        <div className="gb-muted">Shape {m.parts.shape} · Size {m.parts.size} · HMA {m.parts.hma}</div>
                      </div>
                      <div className="gb-sim-score"><b>{m.score}</b><span className="gb-muted">/100</span></div>
                    </div>
                    <MiniPath past={m.path} current={g.current} weekStart={g.weekStart} label={fmtRange(m.weekStart, m.weekEnd)} />
                    <div className="gb-sim-legend">
                      <span><i style={{ background: '#0A84FF' }} />{fmtRange(g.weekStart, g.weekEnd, false)}</span>
                      <span><i style={{ background: '#A1A1A6' }} />Match</span>
                    </div>
                  </article>
                ))}
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

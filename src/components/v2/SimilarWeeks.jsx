import React, { useEffect, useState } from 'react';
import { OptionsService } from '../../services/StrategyService';

const IST = 'Asia/Kolkata';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY = 86400000;
const fmt = (ms, opts) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...opts }).format(new Date(ms));
// A stretch runs 06:00 → 06:00 IST, so its last day is the one before its end.
const fmtRange = (start, end, year = true) => `${fmt(start, { weekday: 'short', day: '2-digit', month: 'short' })} – ${fmt(end - DAY + 1, { weekday: 'short', day: '2-digit', month: 'short', ...(year ? { year: 'numeric' } : {}) })}`;

/** Small chart: a past 7-day stretch (% from its first price) with the last 7 days over it. */
function MiniPath({ past, current, weekStart, days: n = 7, label }) {
  const W = 320, H = 132, P = 6, AXIS = 14;
  const all = [...past, ...current].map((p) => p[1]);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all);
  const pad = (hi - lo) * 0.1 || 0.1;
  const y = (v) => P + ((hi + pad - v) / (hi - lo + 2 * pad)) * (H - AXIS - 2 * P);
  const x = (k) => (k / (n * 24)) * W;
  const first = new Date(weekStart + 330 * 60000).getUTCDay();
  const days = Array.from({ length: n }, (_, i) => WEEKDAYS[(first + i) % 7]);
  // Break the line over gaps (the weekend) instead of drawing a straight bridge.
  const segments = (pts) => pts.reduce((out, p, i) => {
    if (!i || p[0] - pts[i - 1][0] > 6) out.push([]);
    out[out.length - 1].push(`${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`);
    return out;
  }, []).map((seg) => seg.join(' '));
  return (
    <svg className="gb-sim-svg" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${label}: that stretch in grey, the chosen days in blue, as % moves from each one's first price`}>
      {days.map((d, i) => (
        <g key={i}>
          <line x1={x(i * 24)} x2={x(i * 24)} y1={0} y2={H - AXIS} stroke="var(--gb-separator)" strokeWidth="1" />
          <text x={x(i * 24 + 12)} y={H - 3} textAnchor="middle" fontSize={n > 10 ? 8 : 10} fill="var(--gb-text-3)">{d}</text>
        </g>
      ))}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--gb-separator)" strokeDasharray="3 3" />
      {segments(past).map((p, i) => <polyline key={`p${i}`} points={p} fill="none" stroke="#A1A1A6" strokeWidth="2" />)}
      {segments(current).map((p, i) => <polyline key={`c${i}`} points={p} fill="none" stroke="#0A84FF" strokeWidth="2" />)}
    </svg>
  );
}

const RANGE_KEY = 'gb_similar_range';
const readRange = () => {
  try { const r = JSON.parse(localStorage.getItem(RANGE_KEY) || 'null'); return r?.from && r?.to ? r : null; } catch { return null; }
};
const saveRange = (r) => { try { if (r) localStorage.setItem(RANGE_KEY, JSON.stringify(r)); else localStorage.removeItem(RANGE_KEY); } catch { /* storage off */ } };
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** "Similar weeks" panel: a chosen range of GIFT NIFTY days (default: the last 7 complete) vs the past 3 years. */
export default function SimilarWeeks() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(true);
  const [range, setRange] = useState(readRange); // null = last 7 complete days
  const [draft, setDraft] = useState(range || { from: '', to: '' });

  useEffect(() => {
    let alive = true;
    const load = () => OptionsService.similar(range?.from, range?.to)
      .then((d) => {
        if (!alive) return;
        setData(d); setError(null);
        if (!range && d.gift?.from) setDraft({ from: d.gift.from, to: d.gift.to });
      })
      .catch((e) => alive && setError(e.message));
    setData(null);
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15 * 60000);
    return () => { alive = false; clearInterval(t); };
  }, [range]);

  const choose = (r) => { saveRange(r); setRange(r); if (r) setDraft(r); };
  const lastDay = data?.gift?.lastDay;
  // The latest complete Wednesday → Tuesday week.
  const lastWedTue = () => {
    if (!lastDay) return;
    let tue = lastDay;
    while (weekdayOf(tue) !== 2) tue = addDays(tue, -1);
    choose({ from: addDays(tue, -6), to: tue });
  };
  const draftOk = draft.from && draft.to && draft.from <= draft.to && (!lastDay || draft.to <= lastDay);

  const g = data?.gift;
  const o = data?.options;

  return (
    <section className="gb-section" aria-labelledby="gb-sim-title">
      <button type="button" className="gb-opt-week" aria-expanded={open} aria-controls="gb-sim-body" onClick={() => setOpen((v) => !v)}>
        <span className="gb-opt-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span id="gb-sim-title" className="gb-h2">Similar weeks</span>
        <span className="gb-muted gb-opt-week-meta">
          {g?.weekStart ? `GIFT NIFTY · ${fmtRange(g.weekStart, g.weekEnd, false)}${g.status === 'ok' ? ` vs ${g.weeksCompared} earlier stretches` : ''}` : 'GIFT NIFTY · pick days to compare'}
        </span>
      </button>
      {open && (
        <div id="gb-sim-body" className="gb-sim">
          <form className="gb-card gb-sim-range" onSubmit={(e) => { e.preventDefault(); if (draftOk) choose({ from: draft.from, to: draft.to }); }}>
            <label>From <input type="date" className="gb-opt-select" value={draft.from} max={lastDay} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} /></label>
            <label>To <input type="date" className="gb-opt-select" value={draft.to} max={lastDay} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} /></label>
            <button type="submit" className="gb-btn gb-btn-primary gb-cc-small" disabled={!draftOk}>Compare</button>
            <span className="gb-sim-quick">
              <button type="button" className="gb-btn gb-btn-secondary gb-cc-small" aria-pressed={!range} onClick={() => choose(null)}>Last 7 days</button>
              <button type="button" className="gb-btn gb-btn-secondary gb-cc-small" onClick={lastWedTue} disabled={!lastDay}>Last Wed–Tue week</button>
            </span>
          </form>
          {error && <div className="gb-card gb-opt-msg" role="alert">{error}</div>}
          {!data && !error && <div className="gb-card gb-opt-msg">Comparing weeks…</div>}
          {g && g.status !== 'ok' && (
            <div className="gb-card gb-opt-msg">
              {g.status === 'no-data' && 'No GIFT NIFTY history yet. It downloads (up to 3 years) on the next save after you log in.'}
              {g.status === 'invalid' && g.error}
              {g.status === 'too-early' && `These days have only ${g.hoursSoFar} hour${g.hoursSoFar === 1 ? '' : 's'} of saved candles; matching needs ${g.hoursNeeded}. Log in so the missing days download.`}
            </div>
          )}
          {g?.status === 'ok' && (
            <>
              <p className="gb-muted gb-sim-help">
                {fmtRange(g.weekStart, g.weekEnd)} ({g.days} day{g.days === 1 ? '' : 's'}) matched against every earlier {g.days}-day stretch starting on the same weekday.
                A day runs 06:00 → 06:00 IST, night session included.
                Each is drawn as % moves from its first price. Score = 50% shape + 25% size of the moves + 25% how HMA 50 and HMA 130 sit.
              </p>
              {g.lowConfidence && <p className="gb-opt-partial gb-sim-help">Low confidence: with fewer than 3 days, many stretches look alike.</p>}
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
                    <MiniPath past={m.path} current={g.current} weekStart={g.weekStart} days={g.days} label={fmtRange(m.weekStart, m.weekEnd)} />
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

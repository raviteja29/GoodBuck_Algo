import React, { useEffect, useMemo, useState } from 'react';
import { OptionsService } from '../../services/StrategyService';
import CandleChart from './CandleChart';
import SimilarWeeks from './SimilarWeeks';
import CrossesList from './CrossesList';

const IST = 'Asia/Kolkata';
const fmtDay = (day) => new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(`${day}T00:00:00Z`));
const fmtWhen = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
const fmtPrice = (v) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');
const fmtPrice2 = (v) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
const fmtStrike = (v) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const SIDE = { short: 'Short', long: 'Long' };
const levelKey = (l) => `${l.crossTs}:${l.day}`;
const sessionOf = (day) => ({ from: Date.parse(`${day}T09:00:00+05:30`), to: Date.parse(`${day}T15:45:00+05:30`) });
const inSession = (ms) => {
  const m = new Date(ms + 330 * 60000);
  const mins = m.getUTCHours() * 60 + m.getUTCMinutes();
  return mins >= 555 && mins < 930;
};

/** "Entry 142.5 · SL 95.0 (−47.5)" for one option at a level. */
function OptionCell({ o }) {
  if (!o) return <span className="gb-muted">—</span>;
  const head = <span className="gb-opt-sym">{fmtStrike(o.strike)} {o.type}</span>;
  if (o.entry == null && o.sl == null) return <div className="gb-opt-cell">{head}<span className="gb-muted">not saved yet</span></div>;
  return (
    <div className="gb-opt-cell">
      {head}
      <span>
        <span title={o.entryBasis ? `Price at the first touch (${o.entryBasis})` : undefined}>Entry {fmtPrice2(o.entry)}</span>
        {' · '}
        <span title={o.sl == null ? 'The previous stretch had no market hours, so the option has no price there' : 'Lowest price of this option during the previous stretch'}>SL {o.sl == null ? 'n/a' : fmtPrice2(o.sl)}</span>
        {o.gap != null && <span className="gb-muted"> ({o.gap >= 0 ? '−' : '+'}{fmtPrice2(Math.abs(o.gap))})</span>}
      </span>
    </div>
  );
}

/** Options tab: every Cross Pullback level with its saved strikes; click a row for the chart. */
export default function OptionsPage() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // level key
  const [openWeeks, setOpenWeeks] = useState(null); // Set of weekStart; null until data arrives

  // Saved every 15 minutes on the server; refresh here every minute so a new touch shows up.
  useEffect(() => {
    let alive = true;
    const load = () => {
      OptionsService.levels(12).then((d) => alive && (setData(d), setError(null))).catch((e) => alive && setError(e.message));
      OptionsService.health().then((h) => alive && setHealth(h?.optionsArchive || null)).catch(() => {});
    };
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Open the current week (or the latest) the first time data arrives.
  useEffect(() => {
    if (!data || openWeeks) return;
    const first = data.weeks.find((w) => w.current) || data.weeks[0];
    setOpenWeeks(new Set(first ? [first.key] : []));
  }, [data, openWeeks]);

  const toggleWeek = (key) => setOpenWeeks((prev) => {
    const next = new Set(prev || []);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const levels = useMemo(() => (data?.weeks || []).flatMap((w) => w.levels), [data]);
  const level = levels.find((l) => levelKey(l) === selected) || null;

  return (
    <>
      <header className="gb-page-head">
        <div>
          <h1 className="gb-title">Options</h1>
          <p className="gb-subtitle">CE at the strike below and PE at the strike above each Cross Pullback level · saved within 15 minutes of a touch</p>
        </div>
        {health?.lastRun && (
          <p className="gb-muted">Updated {fmtDay(health.lastRun.day)} · {health.contracts} contracts · {health.candles.toLocaleString('en-IN')} candles</p>
        )}
      </header>

      {error && <div className="gb-card gb-opt-msg" role="alert">{error}</div>}
      {!data && !error && <div className="gb-card gb-opt-msg">Loading…</div>}
      {data && !data.weeks.length && (
        <div className="gb-card gb-opt-msg">
          No levels saved yet. They're saved within 15 minutes of each touch while you're logged in.
        </div>
      )}

      {level && <LevelChart key={levelKey(level)} level={level} giftToken={data.giftToken} onClose={() => setSelected(null)} />}

      <CrossesList />

      <SimilarWeeks />

      {(data?.weeks || []).map((w) => {
        const isOpen = !!openWeeks?.has(w.key);
        const panelId = `gb-week-${w.key.replace(/[^a-z0-9-]/gi, '')}`;
        return (
          <section key={w.key} className="gb-section">
            <button type="button" className="gb-opt-week" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggleWeek(w.key)}>
              <span className="gb-opt-chev" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
              <span className="gb-h2">{fmtDay(w.weekStart)} – {fmtDay(w.weekEnd)}</span>
              {w.current && <span className="gb-badge gb-badge-active">This week</span>}
              <span className="gb-muted gb-opt-week-meta">{w.levels.length} level{w.levels.length === 1 ? '' : 's'} · {w.expiry ? `expiry ${fmtDay(w.expiry)}` : 'expiry not available'}</span>
            </button>
            {isOpen && (
              <div id={panelId} className="gb-card gb-table-wrap">
                <table className="gb-table gb-opt-table">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Level</th>
                      <th className="gb-l">Side</th>
                      <th className="gb-l gb-hide-sm">Set at</th>
                      <th className="gb-l">CE · strike below</th>
                      <th className="gb-l">PE · strike above</th>
                    </tr>
                  </thead>
                  <tbody>
                    {w.levels.map((l) => {
                      const k = levelKey(l);
                      return (
                        <tr key={k} className="gb-opt-row" aria-selected={selected === k} tabIndex={0}
                          onClick={() => setSelected(k)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(k); } }}>
                          <td>{fmtDay(l.day)}</td>
                          <td>{fmtPrice(l.level)}</td>
                          <td className="gb-l"><span className={l.side === 'short' ? 'gb-neg' : 'gb-pos'}>{SIDE[l.side]}</span></td>
                          <td className="gb-l gb-hide-sm">{fmtWhen(l.touchTs)}</td>
                          <td className="gb-l">{l.expiry ? <OptionCell o={l.ce} /> : <span className="gb-muted">Expired before saving</span>}</td>
                          <td className="gb-l">{l.expiry ? <OptionCell o={l.pe} /> : <span className="gb-muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function LevelChart({ level, giftToken, onClose }) {
  const strikes = useMemo(() => [...new Set(level.contracts.map((c) => c.strike))].sort((a, b) => a - b), [level]);
  const [type, setType] = useState(level.side === 'short' ? 'PE' : 'CE');
  const [strike, setStrike] = useState(level.side === 'short' ? level.strikeAbove : level.strikeBelow);
  const [instrument, setInstrument] = useState('option'); // 'option' | 'gift'
  const [minutes, setMinutes] = useState(15);
  const [chart, setChart] = useState(null);
  const [error, setError] = useState(null);

  const contract = level.contracts.find((c) => c.strike === strike && c.type === type && c.token && c.bars > 0) || null;
  const token = instrument === 'gift' ? giftToken : contract?.token;
  const tf = instrument === 'gift' ? Math.max(15, minutes) : minutes;

  useEffect(() => {
    if (!token) { setChart(null); return undefined; }
    let alive = true;
    setError(null);
    const load = () => OptionsService.chart(token, tf).then((d) => alive && setChart(d)).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => { alive = false; clearInterval(t); };
  }, [token, tf]);

  const step = (dir) => {
    const i = strikes.indexOf(strike);
    const next = strikes[Math.min(strikes.length - 1, Math.max(0, i + dir))];
    if (next != null) setStrike(next);
  };

  const touchInSession = inSession(level.touchTs);
  const markers = useMemo(() => {
    const m = [];
    if (instrument === 'gift' || touchInSession) {
      m.push({ t: level.touchTs, text: `First touch ${fmtPrice(level.level)}`, color: '#64D2FF', position: level.side === 'short' ? 'aboveBar' : 'belowBar', shape: level.side === 'short' ? 'arrowDown' : 'arrowUp' });
    }
    if (instrument === 'gift') m.push({ t: level.crossTs, text: level.side === 'short' ? 'Cross ↓' : 'Cross ↑', color: '#A1A1A6', position: 'aboveBar', shape: 'circle' });
    return m;
  }, [instrument, level, touchInSession]);
  const lines = useMemo(() => (instrument === 'gift' ? [{ price: level.level, color: '#64D2FF', title: 'Level' }] : []), [instrument, level]);
  // Option: the level's trading day. GIFT NIFTY: from the cross through that day, so the touch shows too.
  const focus = useMemo(() => {
    const day = sessionOf(level.day);
    return instrument === 'gift' ? { from: Math.min(level.crossTs, level.touchTs) - 2 * 3600e3, to: day.to } : day;
  }, [instrument, level]);

  const title = instrument === 'gift' ? 'GIFT NIFTY' : chart?.instrument?.symbol || `NIFTY ${fmtStrike(strike)} ${type}`;

  return (
    <section className="gb-card gb-opt-chart" aria-label="Level chart">
      <div className="gb-opt-chart-head">
        <div>
          <h2 className="gb-h2">{SIDE[level.side]} level {fmtPrice(level.level)} · {fmtDay(level.day)}</h2>
          <p className="gb-muted">
            First touch {fmtWhen(level.touchTs)}{touchInSession ? '' : ' (outside market hours)'} · strikes {level.strikeBelow === level.strikeAbove ? fmtStrike(level.strikeBelow) : `${fmtStrike(level.strikeBelow)} / ${fmtStrike(level.strikeAbove)}`}
            {level.expiry ? ` · expiry ${fmtDay(level.expiry)}` : ''}
          </p>
        </div>
        <button type="button" className="gb-btn gb-btn-secondary gb-cc-small" onClick={onClose}>Close</button>
      </div>

      <div className="gb-opt-pickers">
        <div className="gb-segmented" role="radiogroup" aria-label="Instrument">
          <button type="button" role="radio" aria-checked={instrument === 'option'} onClick={() => setInstrument('option')}>Option</button>
          <button type="button" role="radio" aria-checked={instrument === 'gift'} onClick={() => setInstrument('gift')}>GIFT NIFTY</button>
        </div>
        {instrument === 'option' && (
          <>
            <div className="gb-segmented" role="radiogroup" aria-label="Option type">
              {['CE', 'PE'].map((t) => <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}>{t}</button>)}
            </div>
            <div className="gb-opt-strike">
              <button type="button" className="gb-btn gb-btn-secondary gb-cc-small" aria-label="Lower strike" onClick={() => step(-1)}>‹</button>
              <label className="gb-visually-hidden" htmlFor="gb-opt-strike">Strike</label>
              <select id="gb-opt-strike" className="gb-opt-select" value={strike} onChange={(e) => setStrike(Number(e.target.value))}>
                {strikes.map((s) => (
                  <option key={s} value={s}>
                    {fmtStrike(s)}{s === level.strikeBelow && s !== level.strikeAbove ? ' · below level' : ''}{s === level.strikeAbove && s !== level.strikeBelow ? ' · above level' : ''}
                  </option>
                ))}
              </select>
              <button type="button" className="gb-btn gb-btn-secondary gb-cc-small" aria-label="Higher strike" onClick={() => step(1)}>›</button>
            </div>
          </>
        )}
      </div>

      {error && <p className="gb-opt-msg" role="alert">{error}</p>}
      {instrument === 'option' && !contract && <p className="gb-opt-msg">No saved candles for {fmtStrike(strike)} {type} on this day.</p>}
      {chart && token && (
        <CandleChart
          bars={chart.bars}
          minutes={chart.minutes}
          minMinutes={chart.sourceMinutes || 15}
          onMinutes={setMinutes}
          markers={markers}
          lines={lines}
          focus={focus}
          title={title}
          showOi={instrument === 'option'}
          showVolume={instrument === 'option'}
        />
      )}
    </section>
  );
}

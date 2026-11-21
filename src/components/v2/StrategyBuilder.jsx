import React, { useEffect, useMemo, useRef, useState } from 'react';
import StrategyService, { describeInWords, timeframeLabel } from '../../services/StrategyService';
import TradingService from '../../services/TradingService';

const clone = (v) => JSON.parse(JSON.stringify(v));
const setIn = (obj, path, value) => {
  const next = clone(obj);
  const keys = path.split('.');
  let cur = next;
  keys.slice(0, -1).forEach((k) => { cur = cur[k]; });
  cur[keys[keys.length - 1]] = value;
  return next;
};
const dateTime = (ms) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

// Show setups top-down, matching how levels sit on a chart.
const LEVEL_ORDER = ['high', 'mid', 'low'];

const Row = ({ label, hint, error, children, htmlFor }) => (
  <div className={`gb-row${error ? ' has-error' : ''}`}>
    <span className="gb-row-label">
      {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
      {hint && <span className="gb-row-hint">{hint}</span>}
      {error && <span className="gb-row-error" role="alert">{error}</span>}
    </span>
    {children}
  </div>
);

const SwitchRow = ({ id, label, hint, checked, onChange, disabled }) => (
  <div className="gb-row">
    <span className="gb-row-label">
      <label htmlFor={id}>{label}</label>
      {hint && <span className="gb-row-hint">{hint}</span>}
    </span>
    <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
  </div>
);

function InstrumentPicker({ value, onChange, error }) {
  const [query, setQuery] = useState(value.symbol);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle'); // idle | loading | error
  const [active, setActive] = useState(-1);
  const wrap = useRef(null);

  useEffect(() => { setQuery(value.symbol); }, [value.symbol]);

  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (q.length < 2 || q.toUpperCase() === value.symbol) { setResults([]); return undefined; }
    setState('loading');
    const t = setTimeout(async () => {
      try {
        const list = await TradingService.searchInstruments(q);
        const upper = q.toUpperCase();
        // Exact and prefix matches first, futures before options.
        const rank = (i) => (i.tradingsymbol === upper ? 0 : i.tradingsymbol.startsWith(upper) ? 1 : 2) + (i.instrument_type === 'FUT' ? 0 : i.instrument_type === 'CE' || i.instrument_type === 'PE' ? 0.5 : 0.2);
        setResults([...list].sort((a, b) => rank(a) - rank(b)).slice(0, 30));
        setState('idle');
        setActive(-1);
      } catch {
        setState('error');
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, value.symbol]);

  useEffect(() => {
    const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (i) => {
    onChange({ token: Number(i.instrument_token), symbol: i.tradingsymbol, exchange: i.exchange });
    setQuery(i.tradingsymbol);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <Row label="Instrument" hint={`${value.exchange || '—'} · token ${value.token || '—'}`} error={error} htmlFor="sb-instrument">
      <div className="gb-combo" ref={wrap}>
        <input
          id="sb-instrument"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="sb-instrument-list"
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder="Search symbol"
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        {open && query.trim().length >= 2 && query.trim().toUpperCase() !== value.symbol && (
          <ul id="sb-instrument-list" role="listbox" className="gb-combo-list">
            {state === 'loading' && <li className="gb-muted">Searching…</li>}
            {state === 'error' && <li className="gb-muted">Search failed. Is Kite connected?</li>}
            {state === 'idle' && !results.length && <li className="gb-muted">No matches</li>}
            {state === 'idle' && results.map((i, idx) => (
              <li key={i.instrument_token}>
                <button type="button" role="option" aria-selected={idx === active} onClick={() => choose(i)}>
                  <span>{i.tradingsymbol}</span>
                  <span className="gb-muted">{i.exchange} · {i.instrument_type || i.segment}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Row>
  );
}

const StrategyBuilder = ({ strategyId, onBack, onSaved, onBacktest }) => {
  const isNew = !strategyId;
  const [meta, setMeta] = useState(null);
  const [original, setOriginal] = useState(null); // { name, status, config, updatedAt }
  const [name, setName] = useState('');
  const [config, setConfig] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const m = await StrategyService.meta();
        if (!alive) return;
        setMeta(m);
        if (isNew) {
          setName('');
          setConfig(clone(m.defaults));
          setOriginal({ name: '', status: 'draft', config: clone(m.defaults) });
        } else {
          const s = await StrategyService.get(strategyId);
          if (!alive) return;
          setName(s.name);
          setConfig(s.config);
          setOriginal(s);
        }
      } catch (e) {
        if (alive) setMessage({ kind: 'error', text: e.message });
      }
    })();
    return () => { alive = false; };
  }, [strategyId, isNew]);

  const dirty = useMemo(
    () => !!original && (name !== original.name || JSON.stringify(config) !== JSON.stringify(original.config)),
    [name, config, original],
  );

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (path, value) => {
    setConfig((c) => setIn(c, path, value));
    setErrors((e) => { const n = { ...e }; delete n[path]; return n; });
  };

  const toggleSetup = (key, on) => {
    const next = on ? [...config.setups, key] : config.setups.filter((k) => k !== key);
    update('setups', meta.setups.map((s) => s.key).filter((k) => next.includes(k)));
  };

  const save = async (then) => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = isNew
        ? await StrategyService.create({ name, config })
        : await StrategyService.update(strategyId, { name, config });
      setOriginal(saved);
      setName(saved.name);
      setConfig(saved.config);
      setErrors({});
      onSaved?.(saved);
      if (then) then(saved);
      else setMessage({ kind: 'info', text: 'Saved.' });
    } catch (e) {
      const byField = {};
      (e.errors || []).forEach((x) => { byField[x.field] = byField[x.field] || x.message; });
      setErrors(byField);
      setMessage({ kind: 'error', text: e.errors?.length ? 'Fix the highlighted fields.' : e.message });
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    onBack();
  };

  const duplicate = async () => {
    try {
      const copy = await StrategyService.duplicate(strategyId);
      onSaved?.(copy);
      onBack(copy.id);
    } catch (e) { setMessage({ kind: 'error', text: e.message }); }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${original.name}"? This can't be undone.`)) return;
    try {
      await StrategyService.remove(strategyId);
      onBack();
    } catch (e) { setMessage({ kind: 'error', text: e.message }); }
  };

  if (!config || !meta) {
    return (
      <>
        <button type="button" className="gb-link-btn gb-back" onClick={onBack}>‹ Strategies</button>
        {message ? <div className="gb-note gb-note-error" role="alert">{message.text}</div> : <p className="gb-muted">Loading…</p>}
      </>
    );
  }

  const setupsByLevel = LEVEL_ORDER.flatMap((lvl) => meta.setups.filter((s) => s.key.startsWith(`${lvl}-`)));

  return (
    <>
      <div>
        <button type="button" className="gb-link-btn gb-back" onClick={back}>
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          Strategies
        </button>
        <h1 className="gb-title" style={{ marginTop: 8 }}>{name.trim() || (isNew ? 'New strategy' : 'Untitled')}</h1>
        <p className="gb-subtitle">
          {isNew ? 'Starts from the Weekly Levels defaults.' : `Edited ${dateTime(original.updatedAt)}`}
          {dirty && ' · Unsaved changes'}
        </p>
      </div>

      <div className="gb-builder">
        <form className="gb-builder-form" onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          <section className="gb-form-group">
            <h2>Market</h2>
            <div className="gb-rows">
              <Row label="Name" error={errors.name} htmlFor="sb-name">
                <input id="sb-name" type="text" value={name} maxLength={80} placeholder="e.g. Weekly Levels · NIFTY" onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })); }} />
              </Row>
              <InstrumentPicker value={config.instrument} onChange={(v) => update('instrument', v)} error={errors['instrument.token'] || errors['instrument.symbol']} />
              <Row label="Bar timeframe" error={errors.timeframe}>
                <div role="radiogroup" aria-label="Bar timeframe" className="gb-segmented">
                  {meta.timeframes.map((tf) => (
                    <button key={tf} type="button" role="radio" aria-checked={config.timeframe === tf} onClick={() => update('timeframe', tf)}>
                      {timeframeLabel(tf)}
                    </button>
                  ))}
                </div>
              </Row>
            </div>
          </section>

          <section className="gb-form-group">
            <h2>Levels</h2>
            <div className="gb-rows">
              <Row label="Source"><span className="gb-row-value">Previous week high / mid / low</span></Row>
              <Row label="Base week"><span className="gb-row-value">Wednesday → Tuesday</span></Row>
            </div>
            <p>Other level sources can be added once this one is proven live.</p>
          </section>

          <section className="gb-form-group">
            <h2>Trend filter</h2>
            <div className="gb-rows">
              <Row label="Fast HMA" error={errors['trend.fastPeriod']} htmlFor="sb-fast">
                <input id="sb-fast" type="number" min="2" max="500" step="1" value={config.trend.fastPeriod} onChange={(e) => update('trend.fastPeriod', e.target.value === '' ? '' : Number(e.target.value))} />
              </Row>
              <Row label="Slow HMA" error={errors['trend.slowPeriod']} htmlFor="sb-slow">
                <input id="sb-slow" type="number" min="2" max="1000" step="1" value={config.trend.slowPeriod} onChange={(e) => update('trend.slowPeriod', e.target.value === '' ? '' : Number(e.target.value))} />
              </Row>
              <Row label="Go long when"><span className="gb-row-value">Both HMAs rising</span></Row>
            </div>
            <p>Otherwise the touch is taken short.</p>
          </section>

          <section className="gb-form-group">
            <h2>Setups</h2>
            <div className="gb-rows">
              {setupsByLevel.map((s) => (
                <SwitchRow
                  key={s.key}
                  id={`sb-setup-${s.key}`}
                  label={s.name.replace(/^(\w+) /, '$1 · ')}
                  checked={config.setups.includes(s.key)}
                  onChange={(on) => toggleSetup(s.key, on)}
                />
              ))}
            </div>
            {errors.setups && <p className="gb-row-error" role="alert">{errors.setups}</p>}
          </section>

          <section className="gb-form-group">
            <h2>Session &amp; exits</h2>
            <div className="gb-rows">
              <Row label="Trade from" error={errors['session.start']} htmlFor="sb-start">
                <input id="sb-start" type="time" value={config.session.start} onChange={(e) => update('session.start', e.target.value)} />
              </Row>
              <Row label="Trade until" error={errors['session.end']} htmlFor="sb-end">
                <input id="sb-end" type="time" value={config.session.end} onChange={(e) => update('session.end', e.target.value)} />
              </Row>
              <Row label="Force exit on expiry day" error={errors['session.exitTime']} htmlFor="sb-exit">
                <input id="sb-exit" type="time" value={config.session.exitTime} onChange={(e) => update('session.exitTime', e.target.value)} />
              </Row>
              <Row label="Stop loss"><span className="gb-row-value">Far end of the box</span></Row>
              <Row label="Target"><span className="gb-row-value">Near end of the box</span></Row>
            </div>
          </section>

          <section className="gb-form-group">
            <h2>Position size</h2>
            <div className="gb-rows">
              <Row label="Lots" error={errors['risk.lots']} htmlFor="sb-lots">
                <input id="sb-lots" type="number" min="1" step="1" value={config.risk.lots} onChange={(e) => update('risk.lots', e.target.value === '' ? '' : Number(e.target.value))} />
              </Row>
              <Row label="Lot size" hint="Units per lot, used to turn points into ₹" error={errors['risk.lotSize']} htmlFor="sb-lotsize">
                <input id="sb-lotsize" type="number" min="1" step="1" value={config.risk.lotSize} onChange={(e) => update('risk.lotSize', e.target.value === '' ? '' : Number(e.target.value))} />
              </Row>
            </div>
          </section>

          <section className="gb-form-group">
            <h2>Alerts</h2>
            <div className="gb-rows">
              <SwitchRow id="sb-alert-touch" label="Early alert on touch" hint="As soon as a tick reaches a level" checked={config.alerts.touch} onChange={(v) => update('alerts.touch', v)} />
              <SwitchRow id="sb-alert-confirmed" label="Confirmed alert" hint="When the bar closes — matches the backtest" checked={config.alerts.confirmed} onChange={(v) => update('alerts.confirmed', v)} />
              <Row label="Channels"><span className="gb-row-value">In-app · Telegram in Phase 5</span></Row>
            </div>
          </section>
        </form>

        <aside aria-label="Summary" className="gb-builder-aside">
          <div className="gb-card gb-words">
            <h2>In plain words</h2>
            <p>{describeInWords(config, meta.setups)}</p>
          </div>

          {message && (
            <div className={`gb-note ${message.kind === 'error' ? 'gb-note-error' : 'gb-note-info'}`} role={message.kind === 'error' ? 'alert' : 'status'}>
              {message.text}
            </div>
          )}
          {!isNew && original.lastBacktest && (dirty || original.lastBacktest.stale) && (
            <div className="gb-note gb-note-warn">
              <b>Rules changed since the last backtest</b>
              <span>
                That run made {original.lastBacktest.metrics.points >= 0 ? '+' : '−'}{Math.abs(Math.round(original.lastBacktest.metrics.points)).toLocaleString('en-IN')} pts
                at {(original.lastBacktest.metrics.winRate * 100).toFixed(1)}%. Rerun before going live.
              </span>
            </div>
          )}
          {!isNew && original.status === 'active' && dirty && (
            <div className="gb-note gb-note-warn">
              <b>This strategy is switched on for live signals</b>
              <span>Saving changes the rules the engine will use. Backtest first if you're unsure.</span>
            </div>
          )}

          <button type="button" className="gb-btn gb-btn-primary" disabled={saving} onClick={() => save((s) => onBacktest(s.id))}>
            Save &amp; Backtest
          </button>
          <button type="button" className="gb-btn gb-btn-secondary" disabled={saving || (!dirty && !isNew)} onClick={() => save()}>
            {saving ? 'Saving…' : isNew ? 'Save Draft' : 'Save'}
          </button>
          {!isNew && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
              <button type="button" className="gb-btn gb-btn-secondary" style={{ flex: 1 }} onClick={duplicate}>Duplicate</button>
              <button type="button" className="gb-btn gb-btn-danger" style={{ flex: 1 }} onClick={remove}>Delete</button>
            </div>
          )}
        </aside>
      </div>
    </>
  );
};

export default StrategyBuilder;

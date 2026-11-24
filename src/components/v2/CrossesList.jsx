import React, { useEffect, useState } from 'react';
import { OptionsService } from '../../services/StrategyService';

const fmtWhen = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—');

/** Every HMA 50 / HMA 130 cross in the last 10 days, the ones the strategy ignores included, with first touches. */
export default function CrossesList() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () => OptionsService.crosses(10).then((d) => alive && (setData(d), setError(null))).catch((e) => alive && setError(e.message));
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <section className="gb-section">
      <button type="button" className="gb-opt-week" aria-expanded={open} aria-controls="gb-crosses" onClick={() => setOpen((v) => !v)}>
        <span className="gb-opt-chev" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="gb-h2">Crosses &amp; first touches</span>
        <span className="gb-muted gb-opt-week-meta">
          GIFT NIFTY 15m · last 10 days{data?.lastCandle ? ` · up to the ${fmtWhen(data.lastCandle)} candle` : ''}
        </span>
      </button>
      {open && (
        <div id="gb-crosses" className="gb-card gb-table-wrap">
          {error && <p className="gb-opt-msg" role="alert">{error}</p>}
          {!data && !error && <p className="gb-opt-msg">Loading…</p>}
          {data && !data.crosses.length && <p className="gb-opt-msg">No crosses in the last 10 days of saved candles.</p>}
          {data?.crosses.length > 0 && (
            <table className="gb-table">
              <thead>
                <tr>
                  <th className="gb-l">Cross</th>
                  <th className="gb-l">Direction</th>
                  <th className="gb-hide-sm">HMA 50 (prev → now)</th>
                  <th className="gb-l">Counted?</th>
                  <th className="gb-l">First touch</th>
                  <th>Level</th>
                  <th className="gb-hide-sm">Stop</th>
                </tr>
              </thead>
              <tbody>
                {data.crosses.map((c) => (
                  <tr key={c.ts}>
                    <td className="gb-l">{fmtWhen(c.ts)}</td>
                    <td className="gb-l"><span className={c.side === 'short' ? 'gb-neg' : 'gb-pos'}>{c.side === 'short' ? '↓ Short' : '↑ Long'}</span></td>
                    <td className="gb-hide-sm">{fmt(c.hma50Prev)} → {fmt(c.hma50)}</td>
                    <td className="gb-l">
                      {c.sloped ? 'Yes'
                        : <span className="gb-muted" title="HMA 50 wasn't moving the cross's way on the cross candle">No · HMA 50 {c.side === 'short' ? 'rising' : 'falling'}</span>}
                    </td>
                    <td className="gb-l">{c.touchTs ? fmtWhen(c.touchTs) : <span className="gb-muted">{c.sloped ? 'not yet' : '—'}</span>}</td>
                    <td>{fmt(c.touch)}</td>
                    <td className="gb-hide-sm">{fmt(c.stop)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

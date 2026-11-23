import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart, createSeriesMarkers, CandlestickSeries, LineSeries, HistogramSeries,
  CrosshairMode, PriceScaleMode, LineStyle,
} from 'lightweight-charts';

// Times are shown in IST: the library draws UTC, so each bar's time is shifted by +5:30.
const IST_SEC = 330 * 60;
const toTime = (ms) => Math.floor(ms / 1000) + IST_SEC;

const C = {
  up: '#30D158', down: '#FF453A', hma50: '#FFD60A', hma130: '#E5E5EA', sma50: '#FF9F0A', oi: '#64D2FF',
  grid: 'rgba(56, 56, 58, 0.6)', text: '#A1A1A6', bg: '#1C1C1E',
};
const INDICATORS = [
  { key: 'hma50', label: 'HMA 50', color: C.hma50 },
  { key: 'hma130', label: 'HMA 130', color: C.hma130 },
  { key: 'sma50', label: 'SMA 50', color: C.sma50 },
];
const TIMEFRAMES = [5, 15, 30, 60];
const tfLabel = (m) => (m === 60 ? '1h' : `${m}m`);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const fmtWhen = (ms) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

const loadPrefs = () => {
  try { return JSON.parse(localStorage.getItem('gb_chart_prefs') || 'null'); } catch { return null; }
};
const savePrefs = (p) => { try { localStorage.setItem('gb_chart_prefs', JSON.stringify(p)); } catch { /* private mode */ } };

/**
 * TradingView-style candle chart: drag to pan, scroll / pinch to zoom, drag the
 * price or time axis to rescale, double-click an axis to reset, crosshair with
 * an OHLC legend. Indicators come with the data (computed on the server).
 *
 * props:
 *   bars        [{ t, o, h, l, c, v, oi, hma50, hma130, sma50 }]
 *   minutes     current timeframe; onMinutes(m) to change it (null hides the picker)
 *   minMinutes  smallest timeframe the data supports
 *   markers     [{ t, text, color, position: 'aboveBar'|'belowBar', shape }]
 *   lines       [{ price, color, title }]
 *   focus       { from, to } epoch ms to show first
 *   title       text for the legend
 *   showOi      whether the instrument has open interest
 *   showVolume  whether the instrument has volume (GIFT NIFTY's index feed has none)
 */
export default function CandleChart({ bars, minutes, onMinutes, minMinutes = 5, markers = [], lines = [], focus, title, showOi = false, showVolume = true, height = 480 }) {
  const box = useRef(null);
  const wrap = useRef(null);
  const api = useRef(null);
  const [prefs, setPrefs] = useState(() => ({ hma50: true, hma130: true, sma50: true, volume: true, oi: false, log: false, ...(loadPrefs() || {}) }));
  const [hover, setHover] = useState(null);
  const [full, setFull] = useState(false);

  const byTime = useMemo(() => new Map((bars || []).map((b) => [toTime(b.t), b])), [bars]);
  const last = bars?.length ? bars[bars.length - 1] : null;

  useEffect(() => { savePrefs(prefs); }, [prefs]);

  // Create the chart once.
  useEffect(() => {
    const chart = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: C.bg }, textColor: C.text, fontFamily: '-apple-system, BlinkMacSystemFont, Inter, sans-serif', attributionLogo: true },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#38383A' },
      timeScale: { borderColor: '#38383A', timeVisible: true, secondsVisible: false, rightOffset: 6 },
      localization: { locale: 'en-IN', priceFormatter: (p) => fmt(p) },
      handleScroll: true,
      handleScale: true,
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down, wickUpColor: C.up, wickDownColor: C.down,
    });
    const ind = Object.fromEntries(INDICATORS.map((i) => [i.key, chart.addSeries(LineSeries, {
      color: i.color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    })]));
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const markerApi = createSeriesMarkers(candles, []);
    chart.subscribeCrosshairMove((p) => setHover(p?.time ? p.time : null));
    api.current = { chart, candles, ind, volume, markerApi, oi: null, priceLines: [] };
    return () => { chart.remove(); api.current = null; };
  }, []);

  // Data
  useEffect(() => {
    const a = api.current;
    if (!a || !bars) return;
    a.candles.setData(bars.map((b) => ({ time: toTime(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    for (const i of INDICATORS) {
      a.ind[i.key].setData(bars.map((b) => (Number.isFinite(b[i.key]) ? { time: toTime(b.t), value: b[i.key] } : { time: toTime(b.t) })));
    }
    a.volume.setData(bars.map((b) => ({ time: toTime(b.t), value: b.v || 0, color: b.c >= b.o ? 'rgba(48, 209, 88, 0.35)' : 'rgba(255, 69, 58, 0.35)' })));
    if (a.oi) a.oi.setData(bars.filter((b) => Number.isFinite(b.oi)).map((b) => ({ time: toTime(b.t), value: b.oi })));
  }, [bars]);

  // Markers and horizontal lines
  useEffect(() => {
    const a = api.current;
    if (!a || !bars?.length) return;
    // Snap each marker to the bar that contains it.
    const times = bars.map((b) => b.t);
    const snap = (t) => { let k = 0; while (k + 1 < times.length && times[k + 1] <= t) k += 1; return toTime(times[k]); };
    a.markerApi.setMarkers(markers.filter((m) => m.t >= times[0]).map((m) => ({
      time: snap(m.t), position: m.position || 'aboveBar', color: m.color || C.oi, shape: m.shape || 'arrowDown', text: m.text || '',
    })).sort((x, y) => x.time - y.time));
    a.priceLines.forEach((pl) => a.candles.removePriceLine(pl));
    a.priceLines = lines.filter((l) => Number.isFinite(l.price)).map((l) => a.candles.createPriceLine({
      price: l.price, color: l.color || C.oi, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: l.title || '',
    }));
  }, [bars, markers, lines]);

  // Toggles
  useEffect(() => {
    const a = api.current;
    if (!a) return;
    for (const i of INDICATORS) a.ind[i.key].applyOptions({ visible: !!prefs[i.key] });
    a.volume.applyOptions({ visible: showVolume && !!prefs.volume });
    a.chart.priceScale('right').applyOptions({ mode: prefs.log ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
    const wantOi = showOi && prefs.oi;
    if (wantOi && !a.oi) {
      a.oi = a.chart.addSeries(LineSeries, { color: C.oi, lineWidth: 2, priceLineVisible: false, priceFormat: { type: 'volume' }, title: 'OI' }, 1);
      a.oi.setData((bars || []).filter((b) => Number.isFinite(b.oi)).map((b) => ({ time: toTime(b.t), value: b.oi })));
      a.chart.panes()[1]?.setStretchFactor(0.3);
    } else if (!wantOi && a.oi) {
      a.chart.removeSeries(a.oi);
      a.oi = null;
    }
  }, [prefs, showOi, showVolume, bars]);

  // First view: the focus window (e.g. the level's day), else the last ~150 bars.
  const focusKey = `${focus?.from}-${focus?.to}-${minutes}-${bars?.length ? bars[0].t : ''}`;
  useEffect(() => {
    const a = api.current;
    if (!a || !bars?.length) return;
    if (focus && Number.isFinite(focus.from)) {
      a.chart.timeScale().setVisibleRange({ from: toTime(focus.from), to: toTime(focus.to ?? focus.from + 86400000) });
    } else {
      a.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 150), to: bars.length + 6 });
    }
  }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (k) => setPrefs((p) => ({ ...p, [k]: !p[k] }));
  const fit = () => api.current?.chart.timeScale().fitContent();
  const goFocus = () => {
    const a = api.current;
    if (a && focus) a.chart.timeScale().setVisibleRange({ from: toTime(focus.from), to: toTime(focus.to ?? focus.from + 86400000) });
  };
  const toggleFull = async () => {
    try {
      if (!document.fullscreenElement) { await wrap.current.requestFullscreen(); setFull(true); }
      else { await document.exitFullscreen(); setFull(false); }
    } catch { setFull((f) => !f); }
  };
  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const b = (hover && byTime.get(hover)) || last;
  const prev = b && bars ? bars[bars.indexOf(b) - 1] : null;
  const chg = b && prev ? b.c - prev.c : null;

  return (
    <div ref={wrap} className={`gb-cc${full ? ' gb-cc-full' : ''}`}>
      <div className="gb-cc-bar" role="toolbar" aria-label="Chart settings">
        {onMinutes && (
          <div className="gb-segmented" role="radiogroup" aria-label="Timeframe">
            {TIMEFRAMES.filter((m) => m >= minMinutes).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={minutes === m} onClick={() => onMinutes(m)}>{tfLabel(m)}</button>
            ))}
          </div>
        )}
        <div className="gb-cc-toggles">
          {INDICATORS.map((i) => (
            <button key={i.key} type="button" className="gb-cc-chip" aria-pressed={!!prefs[i.key]} onClick={() => toggle(i.key)}>
              <span className="gb-cc-swatch" style={{ background: i.color }} />{i.label}
            </button>
          ))}
          {showVolume && <button type="button" className="gb-cc-chip" aria-pressed={!!prefs.volume} onClick={() => toggle('volume')}>Volume</button>}
          {showOi && <button type="button" className="gb-cc-chip" aria-pressed={!!prefs.oi} onClick={() => toggle('oi')}>OI</button>}
          <button type="button" className="gb-cc-chip" aria-pressed={!!prefs.log} onClick={() => toggle('log')}>Log</button>
        </div>
        <div className="gb-cc-actions">
          {focus && <button type="button" className="gb-btn gb-btn-secondary gb-cc-small" onClick={goFocus}>Level day</button>}
          <button type="button" className="gb-btn gb-btn-secondary gb-cc-small" onClick={fit}>Fit all</button>
          <button type="button" className="gb-btn gb-btn-secondary gb-cc-small" onClick={toggleFull}>{full ? 'Exit full screen' : 'Full screen'}</button>
        </div>
      </div>
      <div className="gb-cc-plot" style={{ height: full ? undefined : height }}>
        <div ref={box} className="gb-cc-canvas" />
        {b && (
          <div className="gb-cc-legend" aria-live="off">
            <div><strong>{title}</strong> · {tfLabel(minutes)} · {fmtWhen(b.t)}</div>
            <div>
              O <span>{fmt(b.o)}</span> H <span>{fmt(b.h)}</span> L <span>{fmt(b.l)}</span> C <span>{fmt(b.c)}</span>
              {chg != null && <span style={{ color: chg >= 0 ? C.up : C.down }}> {chg >= 0 ? '+' : ''}{fmt(chg)}</span>}
            </div>
            <div>
              {INDICATORS.filter((i) => prefs[i.key]).map((i) => (
                <span key={i.key} style={{ color: i.color }}>{i.label} {fmt(b[i.key])} </span>
              ))}
              {showVolume && prefs.volume && <span>Vol {fmt(b.v, 0)} </span>}
              {showOi && Number.isFinite(b.oi) && <span style={{ color: C.oi }}>OI {fmt(b.oi, 0)}</span>}
            </div>
          </div>
        )}
      </div>
      <p className="gb-muted gb-cc-help">Drag to move · scroll or pinch to zoom · drag an axis to stretch it · double-click an axis to reset</p>
    </div>
  );
}


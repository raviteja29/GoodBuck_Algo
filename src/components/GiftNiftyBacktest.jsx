import React, { useMemo, useState } from 'react';
import {
  ArrowPathIcon,
  BeakerIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import TradingService from '../services/TradingService';
import './GiftNiftyBacktest.css';

const GIFT_NIFTY_FALLBACK_TOKEN = '291849';
const DEFAULT_START = '2025-08-01';
const DEFAULT_INDICATOR_START = '2017-01-01';
const HISTORICAL_CHUNK_DAYS = 45;

const pad = (value) => String(value).padStart(2, '0');
const toInputDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dateTime = (date, time) => `${toInputDate(date)} ${time}`;
const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const parseCandleTime = (value) => {
  if (value instanceof Date) return value;
  if (!value) return new Date(NaN);
  const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T');
  return new Date(normalized);
};

const normalizeCandle = (candle) => {
  if (Array.isArray(candle)) {
    return {
      time: candle[0],
      open: Number(candle[1]),
      high: Number(candle[2]),
      low: Number(candle[3]),
      close: Number(candle[4]),
      volume: Number(candle[5] || 0)
    };
  }

  return {
    time: candle?.date || candle?.time || candle?.timestamp,
    open: Number(candle?.open),
    high: Number(candle?.high),
    low: Number(candle?.low),
    close: Number(candle?.close),
    volume: Number(candle?.volume || 0)
  };
};

const computeWMA = (values, period, endIndex) => {
  if (endIndex + 1 < period) return null;
  const weightSum = period * (period + 1) / 2;
  let weightedSum = 0;
  let weight = 1;
  for (let index = endIndex - period + 1; index <= endIndex; index += 1) {
    weightedSum += values[index] * weight;
    weight += 1;
  }
  return weightedSum / weightSum;
};

const computeHMASeries = (candles, period) => {
  const closes = candles.map(candle => candle.close);
  const half = Math.floor(period / 2);
  const sqrtPeriod = Math.max(1, Math.floor(Math.sqrt(period)));
  const diffSeries = [];

  for (let index = 0; index < closes.length; index += 1) {
    const full = computeWMA(closes, period, index);
    const halfValue = computeWMA(closes, half, index);
    diffSeries.push(full == null || halfValue == null ? null : 2 * halfValue - full);
  }

  return diffSeries.map((value, index) => {
    if (value == null || index + 1 < period + sqrtPeriod - 1) return null;
    const validDiffs = diffSeries.slice(0, index + 1).filter(v => v != null);
    return computeWMA(validDiffs, sqrtPeriod, validDiffs.length - 1);
  });
};

const buildWeeklyWindows = (fromDate, toDate) => {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  const firstWednesday = new Date(from);
  while (firstWednesday.getDay() !== 3) firstWednesday.setDate(firstWednesday.getDate() + 1);

  const windows = [];
  for (let baseStart = firstWednesday; baseStart <= to; baseStart = addDays(baseStart, 7)) {
    const baseEnd = addDays(baseStart, 6);
    const expiryStart = addDays(baseStart, 7);
    const expiryDate = addDays(baseStart, 13);
    if (expiryDate > to) break;
    windows.push({
      baseStart: new Date(baseStart),
      baseEnd,
      expiryStart,
      expiryDate
    });
  }
  return windows;
};

const getZone = (value, levels) => {
  if (!Number.isFinite(value)) return 'missing';
  if (value < levels.low) return 'below-low';
  if (value < levels.mid) return 'low-mid';
  if (value <= levels.high) return 'mid-high';
  return 'above-high';
};

const getOutcomeZone = (value, levels) => {
  if (!Number.isFinite(value)) return 'missing';
  if (value < levels.low) return 'below-low';
  if (value < levels.mid) return 'low-mid';
  if (value <= levels.high) return 'mid-high';
  return 'above-high';
};

const getExpiryBias = (expiryClose, levels) => {
  if (!Number.isFinite(expiryClose)) return 'unknown';
  if (expiryClose > levels.mid) return 'above-mid';
  if (expiryClose < levels.mid) return 'below-mid';
  return 'at-mid';
};

const levelWasTouched = (candle, levelValue) => candle.low <= levelValue && candle.high >= levelValue;

const formatNumber = (value, digits = 2) => Number.isFinite(Number(value))
  ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits })
  : '--';

const pct = (count, total) => total ? `${((count / total) * 100).toFixed(1)}%` : '0.0%';

const createScenario = (touch, hma50Zone, hma200Zone) => ({
  key: `${touch}|${hma50Zone}|${hma200Zone}`,
  touch,
  hma50Zone,
  hma200Zone,
  count: 0,
  aboveMid: 0,
  belowMid: 0,
  outcomes: {
    'below-low': 0,
    'low-mid': 0,
    'mid-high': 0,
    'above-high': 0,
    missing: 0
  },
  examples: []
});

const GiftNiftyBacktest = () => {
  const [fromDate, setFromDate] = useState(DEFAULT_START);
  const [toDate, setToDate] = useState(toInputDate(new Date()));
  const [indicatorStartDate, setIndicatorStartDate] = useState(DEFAULT_INDICATOR_START);
  const [instrumentToken, setInstrumentToken] = useState(GIFT_NIFTY_FALLBACK_TOKEN);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const resolveGiftNiftyToken = async () => {
    if (instrumentToken) return instrumentToken;
    const candidates = ['GIFTNIFTY', 'GIFT NIFTY'];
    for (const symbol of candidates) {
      const exact = await TradingService.getInstrumentsBySymbol(symbol).catch(() => []);
      const resolved = exact.find(item => item.instrument_token);
      if (resolved) return String(resolved.instrument_token);

      const searched = await TradingService.searchInstruments(symbol).catch(() => []);
      const searchMatch = searched.find(item => item.instrument_token && /GIFT\s*NIFTY/i.test(`${item.tradingsymbol} ${item.name}`));
      if (searchMatch) return String(searchMatch.instrument_token);
    }
    return GIFT_NIFTY_FALLBACK_TOKEN;
  };

  const fetchCandlesForWindow = async (token, start, end) => {
    const data = await TradingService.getHistoricalData(
      token,
      dateTime(start, '00:00:00'),
      dateTime(end, '23:59:59'),
      '15minute'
    );
    return (data?.candles || [])
      .map(normalizeCandle)
      .filter(candle => ['open', 'high', 'low', 'close'].every(key => Number.isFinite(candle[key])));
  };

  const fetchContinuousCandles = async (token, start, end) => {
    const chunks = [];
    const failedChunks = [];
    const seen = new Set();
    for (let chunkStart = new Date(start); chunkStart <= end; chunkStart = addDays(chunkStart, HISTORICAL_CHUNK_DAYS)) {
      const chunkEnd = addDays(chunkStart, HISTORICAL_CHUNK_DAYS - 1);
      if (chunkEnd > end) chunkEnd.setTime(end.getTime());
      setProgress(`Fetching continuous 15m candles: ${toInputDate(chunkStart)} to ${toInputDate(chunkEnd)}`);
      try {
        const candles = await fetchCandlesForWindow(token, chunkStart, chunkEnd);
        candles.forEach(candle => {
          const key = `${candle.time}|${candle.open}|${candle.high}|${candle.low}|${candle.close}`;
          if (!seen.has(key)) {
            seen.add(key);
            chunks.push(candle);
          }
        });
      } catch (err) {
        failedChunks.push({
          from: toInputDate(chunkStart),
          to: toInputDate(chunkEnd),
          reason: err.message || 'Historical fetch failed'
        });
      }
    }
    return {
      candles: chunks.sort((a, b) => parseCandleTime(a.time) - parseCandleTime(b.time)),
      failedChunks
    };
  };

  const runBacktest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress('Preparing weekly windows...');

    try {
      const token = await resolveGiftNiftyToken();
      setInstrumentToken(token);
      const windows = buildWeeklyWindows(fromDate, toDate);
      if (!windows.length) throw new Error('No complete Wednesday-Tuesday expiry windows found in the selected range.');

      const requestedIndicatorStart = new Date(`${indicatorStartDate}T00:00:00`);
      const minimumWarmupStart = addDays(windows[0].baseStart, -30);
      const indicatorStart = requestedIndicatorStart < minimumWarmupStart ? requestedIndicatorStart : minimumWarmupStart;
      const finalExpiry = windows[windows.length - 1].expiryDate;
      setProgress(`Fetching continuous 15m GIFTNIFTY candles from ${toInputDate(indicatorStart)} to ${toInputDate(finalExpiry)}...`);
      const { candles: allCandles, failedChunks } = await fetchContinuousCandles(token, indicatorStart, finalExpiry);
      if (!allCandles.length) {
        throw new Error(`No 15m candles returned. Verify the GIFTNIFTY instrument token or Kite historical access for this symbol. Failed chunks: ${failedChunks.length}`);
      }

      const hma50 = computeHMASeries(allCandles, 50);
      const hma200 = computeHMASeries(allCandles, 200);
      const candleIndexMap = new Map(allCandles.map((candle, index) => [candle, index]));
      const scenarioMap = new Map();
      const weekRows = [];
      const skippedRows = [];

      for (const [index, window] of windows.entries()) {
        setProgress(`Processing ${index + 1}/${windows.length}: ${toInputDate(window.baseStart)} to ${toInputDate(window.expiryDate)}`);

        const baseCandles = allCandles.filter(candle => {
          const time = parseCandleTime(candle.time);
          return time >= window.baseStart && time <= addDays(window.baseEnd, 1);
        });
        const expiryCandles = allCandles.filter(candle => {
          const time = parseCandleTime(candle.time);
          return time >= window.expiryStart && time <= addDays(window.expiryDate, 1);
        });

        if (!baseCandles.length || !expiryCandles.length) {
          skippedRows.push({
            baseStart: toInputDate(window.baseStart),
            baseEnd: toInputDate(window.baseEnd),
            expiryDate: toInputDate(window.expiryDate),
            baseCandles: baseCandles.length,
            expiryCandles: expiryCandles.length,
            reason: !baseCandles.length ? 'No candles in base range' : 'No candles in expiry range'
          });
          continue;
        }

        const low = Math.min(...baseCandles.map(candle => candle.low));
        const high = Math.max(...baseCandles.map(candle => candle.high));
        const mid = low + ((high - low) / 2);
        const levels = { low, mid, high };
        const expiryClose = expiryCandles[expiryCandles.length - 1]?.close;
        const outcomeZone = getOutcomeZone(expiryClose, levels);
        const expiryBias = getExpiryBias(expiryClose, levels);
        const touches = { low: 0, mid: 0, high: 0 };
        let hmaQualifiedTouches = 0;

        expiryCandles.forEach(candle => {
          const candleIndex = candleIndexMap.get(candle);
          const h50 = hma50[candleIndex];
          const h200 = hma200[candleIndex];
          if (!Number.isFinite(h50) || !Number.isFinite(h200)) return;

          ['low', 'mid', 'high'].forEach(levelName => {
            if (!levelWasTouched(candle, levels[levelName])) return;
            touches[levelName] += 1;
            hmaQualifiedTouches += 1;
            const scenarioKey = `${levelName}|${getZone(h50, levels)}|${getZone(h200, levels)}`;
            if (!scenarioMap.has(scenarioKey)) {
              scenarioMap.set(scenarioKey, createScenario(levelName, getZone(h50, levels), getZone(h200, levels)));
            }
            const scenario = scenarioMap.get(scenarioKey);
            scenario.count += 1;
            scenario.outcomes[outcomeZone] = (scenario.outcomes[outcomeZone] || 0) + 1;
            if (expiryBias === 'above-mid') scenario.aboveMid += 1;
            if (expiryBias === 'below-mid') scenario.belowMid += 1;
            if (scenario.examples.length < 3) {
              scenario.examples.push({
                week: `${toInputDate(window.baseStart)} -> ${toInputDate(window.expiryDate)}`,
                touchClose: candle.close,
                expiryClose
              });
            }
          });
        });

        weekRows.push({
          baseStart: toInputDate(window.baseStart),
          baseEnd: toInputDate(window.baseEnd),
          expiryDate: toInputDate(window.expiryDate),
          levels,
          expiryClose,
          outcomeZone,
          expiryBias,
          touches,
          hmaQualifiedTouches,
          baseCandles: baseCandles.length,
          expiryCandles: expiryCandles.length
        });
      }

      const scenarios = Array.from(scenarioMap.values()).sort((a, b) => b.count - a.count);
      setResult({
        token,
        indicatorStart: toInputDate(indicatorStart),
        windows: windows.length,
        processed: weekRows.length,
        skipped: skippedRows.length,
        skippedRows,
        failedChunks,
        totalCandles: allCandles.length,
        scenarios,
        weeks: weekRows
      });
      setProgress('');
    } catch (err) {
      setError(err.message || 'Backtest failed');
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const headline = useMemo(() => {
    if (!result) return null;
    const midTouch = result.scenarios.filter(scenario => scenario.touch === 'mid');
    const totalMid = midTouch.reduce((sum, scenario) => sum + scenario.count, 0);
    const aboveMid = midTouch.reduce((sum, scenario) => sum + scenario.aboveMid, 0);
    return { totalMid, aboveMid };
  }, [result]);

  return (
    <div className="gift-backtest">
      <header className="gift-backtest-header">
        <div>
          <p>GIFTNIFTY WEEKLY EXPIRY LAB</p>
          <h1><BeakerIcon /> HMA50 / HMA200 Scenario Backtest</h1>
          <span>Base range: Wednesday to Tuesday. Prediction: following Tuesday expiry.</span>
        </div>
        <button className="gift-run-btn" onClick={runBacktest} disabled={loading}>
          {loading ? <ArrowPathIcon className="spin" /> : <ChartBarIcon />}
          {loading ? 'Running...' : 'Run Backtest'}
        </button>
      </header>

      <section className="gift-backtest-controls">
        <label>
          <span><CalendarDaysIcon /> From</span>
          <input type="date" value={fromDate} onChange={event => setFromDate(event.target.value)} />
        </label>
        <label>
          <span><CalendarDaysIcon /> To</span>
          <input type="date" value={toDate} max={toInputDate(new Date())} onChange={event => setToDate(event.target.value)} />
        </label>
        <label>
          <span><CalendarDaysIcon /> HMA History From</span>
          <input type="date" value={indicatorStartDate} max={fromDate} onChange={event => setIndicatorStartDate(event.target.value)} />
        </label>
        <label>
          <span>GIFTNIFTY Token</span>
          <input value={instrumentToken} onChange={event => setInstrumentToken(event.target.value)} placeholder="Auto / 291849" />
        </label>
      </section>

      {progress && <div className="gift-progress">{progress}</div>}
      {error && (
        <div className="gift-error">
          <ExclamationTriangleIcon />
          {error}
        </div>
      )}

      {result && (
        <>
          <section className="gift-summary-grid">
            <div>
              <span>Windows Found</span>
              <strong>{result.windows}</strong>
            </div>
            <div>
              <span>Processed</span>
              <strong>{result.processed}</strong>
            </div>
            <div>
              <span>Skipped</span>
              <strong>{result.skipped}</strong>
            </div>
            <div>
              <span>Total 15m Candles</span>
              <strong>{result.totalCandles}</strong>
            </div>
            <div>
              <span>HMA History From</span>
              <strong>{result.indicatorStart}</strong>
            </div>
            <div>
              <span>Mid Touch Above-Mid Expiry</span>
              <strong>{headline ? pct(headline.aboveMid, headline.totalMid) : '0.0%'}</strong>
            </div>
          </section>

          {result.skippedRows.length > 0 && (
            <section className="gift-panel">
              <div className="gift-panel-title">
                <h2>Skipped Windows</h2>
                <p>These windows did not have candles in either the base or expiry range.</p>
              </div>
              <div className="gift-table-wrap compact">
                <table>
                  <thead>
                    <tr>
                      <th>Base Week</th>
                      <th>Expiry</th>
                      <th>Base Candles</th>
                      <th>Expiry Candles</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skippedRows.map(row => (
                      <tr key={`${row.baseStart}-${row.expiryDate}`}>
                        <td>{row.baseStart} {'->'} {row.baseEnd}</td>
                        <td>{row.expiryDate}</td>
                        <td>{row.baseCandles}</td>
                        <td>{row.expiryCandles}</td>
                        <td>{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {result.failedChunks.length > 0 && (
            <section className="gift-panel">
              <div className="gift-panel-title">
                <h2>Historical Fetch Failures</h2>
                <p>These chunks failed at the Kite/backend historical endpoint. The backtest continues with the chunks that returned candles.</p>
              </div>
              <div className="gift-table-wrap compact">
                <table>
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.failedChunks.slice(0, 50).map(row => (
                      <tr key={`${row.from}-${row.to}`}>
                        <td>{row.from}</td>
                        <td>{row.to}</td>
                        <td>{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="gift-panel">
            <div className="gift-panel-title">
              <h2>Scenario Outcomes</h2>
              <p>Each row is counted when price touched low/mid/high during the prediction week while HMA50/HMA200 were in the listed zones.</p>
            </div>
            <div className="gift-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Touch</th>
                    <th>HMA50 Zone</th>
                    <th>HMA200 Zone</th>
                    <th>Count</th>
                    <th>Expiry Above Mid</th>
                    <th>Below Low</th>
                    <th>Low-Mid</th>
                    <th>Mid-High</th>
                    <th>Above High</th>
                  </tr>
                </thead>
                <tbody>
                  {result.scenarios.map(scenario => (
                    <tr key={scenario.key}>
                      <td>{scenario.touch}</td>
                      <td>{scenario.hma50Zone}</td>
                      <td>{scenario.hma200Zone}</td>
                      <td>{scenario.count}</td>
                      <td>{pct(scenario.aboveMid, scenario.count)}</td>
                      <td>{pct(scenario.outcomes['below-low'], scenario.count)}</td>
                      <td>{pct(scenario.outcomes['low-mid'], scenario.count)}</td>
                      <td>{pct(scenario.outcomes['mid-high'], scenario.count)}</td>
                      <td>{pct(scenario.outcomes['above-high'], scenario.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="gift-panel">
            <div className="gift-panel-title">
              <h2>Weekly Expiry Outcomes</h2>
              <p>Levels are calculated from the previous Wednesday-Tuesday range.</p>
            </div>
            <div className="gift-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Base Week</th>
                    <th>Expiry</th>
                    <th>Low</th>
                    <th>Mid</th>
                    <th>High</th>
                    <th>Expiry Close</th>
                    <th>Outcome</th>
                    <th>Touches L/M/H</th>
                    <th>HMA Touches</th>
                    <th>Candles B/E</th>
                  </tr>
                </thead>
                <tbody>
                  {result.weeks.map(week => (
                    <tr key={`${week.baseStart}-${week.expiryDate}`}>
                      <td>{week.baseStart} {'->'} {week.baseEnd}</td>
                      <td>{week.expiryDate}</td>
                      <td>{formatNumber(week.levels.low)}</td>
                      <td>{formatNumber(week.levels.mid)}</td>
                      <td>{formatNumber(week.levels.high)}</td>
                      <td>{formatNumber(week.expiryClose)}</td>
                      <td>{week.outcomeZone}</td>
                      <td>{week.touches.low}/{week.touches.mid}/{week.touches.high}</td>
                      <td>{week.hmaQualifiedTouches}</td>
                      <td>{week.baseCandles}/{week.expiryCandles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!result && !loading && !error && (
        <div className="gift-empty">
          Run the backtest to classify every completed weekly expiry from August 2025 through the selected end date.
        </div>
      )}
    </div>
  );
};

export default GiftNiftyBacktest;

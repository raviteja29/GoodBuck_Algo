import React, { useState, useEffect, useRef } from 'react';
import {
  ChartBarIcon,
  CalendarDaysIcon,
  MagnifyingGlassIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  InformationCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import InstrumentSearch from './InstrumentSearch';
import TradingService from '../services/TradingService';
import './Analytics.css';

const Analytics = () => {
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [showInstrumentSearch, setShowInstrumentSearch] = useState(false);
  // Option related state
  const [optionExpiry, setOptionExpiry] = useState('current'); // 'current' | 'next'
  const [peOptionToken, setPeOptionToken] = useState(null);
  const [ceOptionToken, setCeOptionToken] = useState(null);
  const [peFibLevels, setPeFibLevels] = useState(null); // {low, mid, high, ext}
  const [ceFibLevels, setCeFibLevels] = useState(null);
  const [peTimeframe, setPeTimeframe] = useState('15m');
  const [ceTimeframe, setCeTimeframe] = useState('15m');
  const [peHma, setPeHma] = useState({ '15m': null, '1h': null, '1d': null });
  const [ceHma, setCeHma] = useState({ '15m': null, '1h': null, '1d': null });
  const [peLtp, setPeLtp] = useState(null);
  const [ceLtp, setCeLtp] = useState(null);
  const [peLastClose, setPeLastClose] = useState(null);
  const [ceLastClose, setCeLastClose] = useState(null);
  const liveHmaCandlesRef = useRef({ PE: {}, CE: {} });
  const peTimeframeRef = useRef(peTimeframe);
  const ceTimeframeRef = useRef(ceTimeframe);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState({ pe: { candidates: [], resolved: null }, ce: { candidates: [], resolved: null } });
  const peSubscribed = useRef(false);
  const ceSubscribed = useRef(false);

  // Default to a six-calendar-day range ending six days back, e.g. 06 May -> 12 May on 18 May.
  const getDefaultDates = () => {
    const today = new Date();
    const to = new Date(today);

    to.setDate(today.getDate() - 6);
    const from = new Date(to);
    from.setDate(to.getDate() - 6);

    return {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0]
    };
  };

  const defaultDates = getDefaultDates();
  const [fromDate, setFromDate] = useState(defaultDates.from);
  const [toDate, setToDate] = useState(defaultDates.to);
  const [loading, setLoading] = useState(false);
  const [highLowData, setHighLowData] = useState(null);
  const [error, setError] = useState(null);

  // Handle instrument selection
  const handleInstrumentSelect = (instrument) => {
    setSelectedInstrument(instrument);
    setShowInstrumentSearch(false);
    setError(null);
    setHighLowData(null); // Clear previous results
  };

  // Handle date range analysis
  const handleAnalyze = async () => {
    if (!selectedInstrument) {
      setError('Please select an instrument first');
      return;
    }

    if (!fromDate || !toDate) {
      setError('Please select both from and to dates');
      return;
    }

    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);
    const today = new Date();

    if (fromDateObj >= toDateObj) {
      setError('From date must be earlier than to date');
      return;
    }

    // Check if the date range is too recent (less than 2 days ago for more flexibility)
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(today.getDate() - 2);

    if (toDateObj > twoDaysAgo) {
      setError('Please select a date range that ends at least 2 days ago. Recent data may not be available due to processing delays.');
      return;
    }

    // Check if the date range includes only weekends
    const daysBetween = Math.ceil((toDateObj - fromDateObj) / (1000 * 60 * 60 * 24));
    if (daysBetween > 10) {
      setError('Please select a date range of 10 days or less for better performance');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Append market hours to dates as per Kite API requirement
      // From date: 9:15 AM (market opening)
      // To date: 3:30 PM (market closing)
      const fromDateTime = `${fromDate} 09:15:00`;
      const toDateTime = `${toDate} 15:30:00`;

      console.log(`Analyzing ${selectedInstrument.tradingsymbol} from ${fromDateTime} to ${toDateTime}`);

      const data = await TradingService.getInstrumentHighLow(
        selectedInstrument.instrument_token,
        fromDateTime,
        toDateTime
      );

      setHighLowData(data);
      console.log('High/Low data received:', data);
    } catch (err) {
      console.error('Error fetching high/low data:', err);

      // Provide more helpful error messages
      let errorMessage = err.message || 'Failed to fetch historical data';

      if (errorMessage.includes('No historical data found')) {
        errorMessage = `No data available for the selected period (${fromDate} to ${toDate}). This could be due to market holidays, weekends, or data availability. Try selecting a weekday range from at least a week ago.`;
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Clear all selections and results
  const handleClear = () => {
    setSelectedInstrument(null);
    const newDefaultDates = getDefaultDates();
    setFromDate(newDefaultDates.from);
    setToDate(newDefaultDates.to);
    setHighLowData(null);
    setError(null);
  };

  // Format date for display
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Calculate date range duration
  const getDateRangeDuration = () => {
    if (!fromDate || !toDate) return null;

    const start = new Date(fromDate);
    const end = new Date(toDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  };

  const duration = getDateRangeDuration();

  useEffect(() => { peTimeframeRef.current = peTimeframe; }, [peTimeframe]);
  useEffect(() => { ceTimeframeRef.current = ceTimeframe; }, [ceTimeframe]);

  // ================= Strike Derivation Helpers =================
  // Step size: 100 for BANK NIFTY related symbols, else 50
  const getStrikeStep = (symbol) => /BANK/i.test(symbol || '') ? 100 : 50;
  const roundUpTo = (val, step) => (typeof val === 'number') ? Math.ceil(val / step) * step : null;
  const roundDownTo = (val, step) => (typeof val === 'number') ? Math.floor(val / step) * step : null;

  // Normalize potential key name variations (defensive)
  const normalizeHighLow = (data) => {
    if (!data) return { high: null, low: null };
    const highCandidates = ['high', 'highest', 'max'];
    const lowCandidates = ['low', 'lowest', 'min'];
    let high = null; let low = null;
    for (const k of highCandidates) { if (data[k] != null) { high = data[k]; break; } }
    for (const k of lowCandidates) { if (data[k] != null) { low = data[k]; break; } }
    return { high, low };
  };

  const { high: normalizedHigh, low: normalizedLow } = normalizeHighLow(highLowData);
  const strikeStep = getStrikeStep(selectedInstrument?.tradingsymbol);
  const peStrike = normalizedHigh != null ? roundUpTo(normalizedHigh, strikeStep) : null; // Put strike from High (round up)
  const ceStrike = normalizedLow != null ? roundDownTo(normalizedLow, strikeStep) : null; // Call strike from Low (round down)

  // ================= Option Helpers (Minimal) =================
  const baseSymbolForUnderlying = (sym) => {
    if (!sym) return null;
    if (/BANK/i.test(sym)) return 'BANKNIFTY';
    return 'NIFTY';
  };

  const getWeeklyExpiryDates = () => {
    const today = new Date();
    const current = new Date(today);
    // Weekly expiry (post change) Tuesday; if today > Tuesday (i.e., Wed-Fri), currentWeek = next Tuesday
    // If today is Tuesday before market close treat today as current; else roll.
    if (current.getDay() > 2 || (current.getDay() === 2 && current.getHours() >= 16)) {
      // Move to next Tuesday baseline
      while (current.getDay() !== 2) current.setDate(current.getDate() + 1);
    } else if (current.getDay() < 2) {
      while (current.getDay() !== 2) current.setDate(current.getDate() + 1);
    }
    const currentWeek = new Date(current);
    const nextWeek = new Date(current);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return { currentWeek, nextWeek };
  };

  const formatExpiryCode = (date) => {
    const dd = String(date.getDate()).padStart(2, '0');
    const mmm = date.toLocaleString('en-GB', { month: 'short' }).toUpperCase();
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}${mmm}${yy}`; // e.g. 26SEP24
  };

  // Memo-like derived expiry info (recomputed each render – lightweight)
  const { currentWeek: _currWeek, nextWeek: _nextWeek } = getWeeklyExpiryDates();
  const selectedExpiryDate = optionExpiry === 'next' ? _nextWeek : _currWeek;
  const expiryDisplay = selectedExpiryDate
    ? selectedExpiryDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  const expiryCode = selectedExpiryDate ? formatExpiryCode(selectedExpiryDate) : null;

  const buildOptionSymbolCandidates = (underlyingSymbol, strike, type, expiryChoice) => {
    if (!underlyingSymbol || !strike || !type) return [];
    const base = baseSymbolForUnderlying(underlyingSymbol)?.replace(/\s+/g, '');
    const strikeStr = String(strike).replace(/\.\d+/, '');
    const { currentWeek, nextWeek } = getWeeklyExpiryDates();
    const expiryDate = expiryChoice === 'next' ? nextWeek : currentWeek;
    const dd = String(expiryDate.getDate()).padStart(2, '0');
    const mmm = expiryDate.toLocaleString('en-GB', { month: 'short' }).toUpperCase();
    const yy = String(expiryDate.getFullYear()).slice(-2);
    const monthNum = String(expiryDate.getMonth() + 1).padStart(2, '0');
    const kiteMonthCode = expiryDate.getMonth() + 1 <= 9
      ? String(expiryDate.getMonth() + 1)
      : ({ 10: 'O', 11: 'N', 12: 'D' }[expiryDate.getMonth() + 1]);

    // Candidate formats (descending likelihood):
    // 0. Kite weekly format: BASE + YY + month-code + DD + strike + type (NIFTY2651924500PE)
    // 1. Weekly full: BASE + DD + MMM + YY + strike + type  (NIFTY30SEP25 24500 CE => NIFTY30SEP2524500CE)
    // 2. Weekly no year: BASE + DD + MMM + strike + type    (NIFTY30SEP24500CE)
    // 3. Compact year first two digits + strike + type? (Legacy examples like NIFTY159500CE appear to be year(15)+strike+type NO month) -> BASE + YY + strike + type
    // 4. Monthly style: BASE + MMM + YY + strike + type      (NIFTYSEP2524500CE)
    // 5. Alt numeric date: BASE + DD + MM + YY + strike + type (NIFTY30092524500CE)
    const candidates = [
      `${base}${yy}${kiteMonthCode}${dd}${strikeStr}${type}`,
      `${base}${dd}${mmm}${yy}${strikeStr}${type}`,
      `${base}${dd}${mmm}${strikeStr}${type}`,
      `${base}${yy}${strikeStr}${type}`,
      `${base}${mmm}${yy}${strikeStr}${type}`,
      `${base}${dd}${monthNum}${yy}${strikeStr}${type}`
    ];
    if (mmm === 'SEP') {
      // Some data sources may list September as SEPT
      candidates.push(
        `${base}${dd}SEPT${yy}${strikeStr}${type}`,
        `${base}${dd}SEPT${strikeStr}${type}`,
        `${base}SEPT${yy}${strikeStr}${type}`
      );
    }
    return Array.from(new Set(candidates));
  };

  // Resolve option instrument tokens when strikes and instrument selected or expiry changes
  useEffect(() => {
    let cancelled = false;
    async function resolveTokens() {
      setPeOptionToken(null); setCeOptionToken(null);
      setPeFibLevels(null); setCeFibLevels(null);
      setPeHma({ '15m': null, '1h': null, '1d': null });
      setCeHma({ '15m': null, '1h': null, '1d': null });
      liveHmaCandlesRef.current = { PE: {}, CE: {} };
      peSubscribed.current = false; ceSubscribed.current = false;
      setPeLtp(null); setCeLtp(null);
      setPeLastClose(null); setCeLastClose(null);
      if (!selectedInstrument || !peStrike || !ceStrike) return;
      const under = selectedInstrument.tradingsymbol;
      // Capture expiry context for this resolution cycle
      const { currentWeek, nextWeek } = getWeeklyExpiryDates();
      const chosenExpiryDate = optionExpiry === 'next' ? nextWeek : currentWeek;
      const chosenExpiryCode = chosenExpiryDate ? formatExpiryCode(chosenExpiryDate) : null;
      const peSymbols = buildOptionSymbolCandidates(under, peStrike, 'PE', optionExpiry);
      const ceSymbols = buildOptionSymbolCandidates(under, ceStrike, 'CE', optionExpiry);
      setDebugInfo(prev => ({
        ...prev,
        pe: { ...prev.pe, candidates: peSymbols, resolved: null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } },
        ce: { ...prev.ce, candidates: ceSymbols, resolved: null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } }
      }));
      async function resolveOne(symbolList, setter, side) {
        for (const sym of symbolList) {
          if (cancelled) return;
          try {
            console.log(`[OptionResolve] Trying ${side} symbol candidate: ${sym}`);
            let res = await TradingService.getInstrumentsBySymbol(sym);
            if (!cancelled && Array.isArray(res) && res.length) {
              const token = res[0].instrument_token || res[0].token;
              console.log(`[OptionResolve] ${side} resolved via direct symbol: ${sym} -> token ${token}`);
              setter(token);
              // Fetch initial LTP immediately
              try {
                const q = await TradingService.getQuote(token);
                if (side === 'PE' && q?.last_price != null) setPeLtp(q.last_price);
                if (side === 'CE' && q?.last_price != null) setCeLtp(q.last_price);
                setDebugInfo(prev => ({ ...prev, [side.toLowerCase()]: { ...prev[side.toLowerCase()], resolved: { symbol: sym, token, method: 'direct', ltp: q?.last_price ?? null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } } }));
              } catch (_) {
                setDebugInfo(prev => ({ ...prev, [side.toLowerCase()]: { ...prev[side.toLowerCase()], resolved: { symbol: sym, token, method: 'direct', ltp: null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } } }));
              }
              return;
            }
            // Fallback: broader search prefix of base + strike part
            const basePrefix = sym.slice(0, Math.min(8, sym.length));
            const searchRes = await TradingService.searchInstruments(basePrefix);
            if (!cancelled && Array.isArray(searchRes)) {
              const exact = searchRes.find(r => r.tradingsymbol === sym);
              if (exact) {
                const token = exact.instrument_token || exact.token;
                console.log(`[OptionResolve] ${side} resolved via search exact: ${sym} -> token ${token}`);
                setter(token);
                try {
                  const q = await TradingService.getQuote(token);
                  if (side === 'PE' && q?.last_price != null) setPeLtp(q.last_price);
                  if (side === 'CE' && q?.last_price != null) setCeLtp(q.last_price);
                  setDebugInfo(prev => ({ ...prev, [side.toLowerCase()]: { ...prev[side.toLowerCase()], resolved: { symbol: sym, token, method: 'search-exact', ltp: q?.last_price ?? null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } } }));
                } catch (_) {
                  setDebugInfo(prev => ({ ...prev, [side.toLowerCase()]: { ...prev[side.toLowerCase()], resolved: { symbol: sym, token, method: 'search-exact', ltp: null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } } }));
                }
                return;
              }
              const strikeMatch = sym.match(/(\d{3,6})(CE|PE)$/);
              const strikePart = String(strikeMatch?.[1] || '');
              const typePart = strikeMatch?.[2] || (sym.endsWith('CE') ? 'CE' : sym.endsWith('PE') ? 'PE' : '');
              const partial = searchRes.find(r => r.tradingsymbol?.includes(strikePart) && r.tradingsymbol?.endsWith(typePart));
              if (partial) {
                const token = partial.instrument_token || partial.token;
                console.log(`[OptionResolve] ${side} resolved via search partial: ${partial.tradingsymbol} -> token ${token}`);
                setter(token);
                try {
                  const q = await TradingService.getQuote(token);
                  if (side === 'PE' && q?.last_price != null) setPeLtp(q.last_price);
                  if (side === 'CE' && q?.last_price != null) setCeLtp(q.last_price);
                  setDebugInfo(prev => ({ ...prev, [side.toLowerCase()]: { ...prev[side.toLowerCase()], resolved: { symbol: partial.tradingsymbol, token, method: 'search-partial', ltp: q?.last_price ?? null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } } }));
                } catch (_) {
                  setDebugInfo(prev => ({ ...prev, [side.toLowerCase()]: { ...prev[side.toLowerCase()], resolved: { symbol: partial.tradingsymbol, token, method: 'search-partial', ltp: null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } } }));
                }
                return;
              }
            }
          } catch (err) {
            console.warn(`[OptionResolve] Error for candidate ${sym}:`, err.message);
          }
        }
        console.warn(`[OptionResolve] Failed to resolve any candidate for ${side}`);
      }
      await Promise.all([
        resolveOne(peSymbols, setPeOptionToken, 'PE'),
        resolveOne(ceSymbols, setCeOptionToken, 'CE')
      ]);
    }
    resolveTokens();
    return () => { cancelled = true; };
  }, [selectedInstrument, peStrike, ceStrike, optionExpiry]);

  // LTP initial quote & polling fallback if ticks absent
  const lastTickRef = useRef({ pe: null, ce: null });
  const pollRef = useRef(null);
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!peOptionToken && !ceOptionToken) return;
    let cancelled = false;
    (async () => {
      try {
        if (peOptionToken) {
          const q = await TradingService.getQuote(peOptionToken);
          if (!cancelled && q?.last_price != null) setPeLtp(q.last_price);
        }
        if (ceOptionToken) {
          const q = await TradingService.getQuote(ceOptionToken);
          if (!cancelled && q?.last_price != null) setCeLtp(q.last_price);
        }
      } catch (err) { console.warn('Initial option quote fetch failed', err.message); }
      pollRef.current = setInterval(async () => {
        const now = Date.now();
        const needPe = peOptionToken && (!lastTickRef.current.pe || now - lastTickRef.current.pe > 20000);
        const needCe = ceOptionToken && (!lastTickRef.current.ce || now - lastTickRef.current.ce > 20000);
        if (!needPe && !needCe) return;
        try {
          if (needPe) {
            const q = await TradingService.getQuote(peOptionToken);
            if (!cancelled && q?.last_price != null) setPeLtp(q.last_price);
          }
          if (needCe) {
            const q = await TradingService.getQuote(ceOptionToken);
            if (!cancelled && q?.last_price != null) setCeLtp(q.last_price);
          }
        } catch (e) { console.warn('Polling option quote failed', e.message); }
      }, 15000);
    })();
    return () => { cancelled = true; if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [peOptionToken, ceOptionToken]);

  // HMA computation helpers
  const computeWMA = (arr, period, endIndex) => {
    if (endIndex + 1 < period) return null;
    let weightSum = period * (period + 1) / 2;
    let wsum = 0; let w = 1;
    for (let i = endIndex - period + 1; i <= endIndex; i++) {
      wsum += arr[i] * w; w++;
    }
    return wsum / weightSum;
  };

  const computeHMA = (closes, period = 50) => {
    if (!closes || closes.length < period) return null;
    const half = Math.floor(period / 2);
    const sqrtP = Math.floor(Math.sqrt(period));
    const diffSeries = [];
    for (let i = period - 1; i < closes.length; i++) {
      const wmaFull = computeWMA(closes, period, i);
      const wmaHalf = computeWMA(closes, half, i);
      if (wmaFull == null || wmaHalf == null) continue;
      diffSeries.push(2 * wmaHalf - wmaFull);
    }
    if (diffSeries.length < sqrtP) return null;
    // Apply WMA on diffSeries for last sqrtP values
    let weightSum = sqrtP * (sqrtP + 1) / 2;
    let wsum = 0; let w = 1;
    for (let i = diffSeries.length - sqrtP; i < diffSeries.length; i++) {
      wsum += diffSeries[i] * w; w++;
    }
    return wsum / weightSum;
  };

  const timeframeToInterval = { '15m': '15minute', '1h': '60minute', '1d': 'day' };
  const timeframeToSeconds = { '15m': 15 * 60, '1h': 60 * 60, '1d': 24 * 60 * 60 };
  const liveHmaLookbackDays = { '15m': 20, '1h': 45, '1d': 90 };

  const formatDateTimeForKite = (date) => {
    const pad = (value) => String(value).padStart(2, '0');
    return [
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    ].join(' ');
  };

  const getTickTime = (tick) => {
    const rawTime = tick?.exchange_timestamp || tick?.last_trade_time || tick?.timestamp || tick?.last_update_time;
    if (!rawTime) return new Date();
    const parsed = rawTime instanceof Date ? rawTime : new Date(rawTime);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  };

  const getBucketStartEpoch = (date, timeframe) => {
    const seconds = timeframeToSeconds[timeframe] || timeframeToSeconds['15m'];
    if (timeframe === '1d') {
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      return Math.floor(dayStart.getTime() / 1000);
    }

    return Math.floor(Math.floor(date.getTime() / 1000) / seconds) * seconds;
  };

  const normalizeCandle = (candle) => ([
    Number(candle?.[0]),
    Number(candle?.[1]),
    Number(candle?.[2]),
    Number(candle?.[3]),
    Number(candle?.[4]),
    Number(candle?.[5] || 0)
  ]);

  const calculateHmaFromCandles = (candles) => {
    const closes = (candles || [])
      .map(c => Number(c?.[4]))
      .filter(value => Number.isFinite(value));
    return computeHMA(closes, 50);
  };

  const setSideHma = (side, timeframe, value) => {
    if (side === 'PE') setPeHma(prev => ({ ...prev, [timeframe]: value }));
    if (side === 'CE') setCeHma(prev => ({ ...prev, [timeframe]: value }));
  };

  const applyLiveTickToHma = (side, timeframe, price, tickTime) => {
    const sideCandles = liveHmaCandlesRef.current[side] || {};
    const existing = sideCandles[timeframe];
    if (!Array.isArray(existing) || !existing.length || !Number.isFinite(price)) return;

    const bucketStart = getBucketStartEpoch(tickTime, timeframe);
    const candles = existing.slice();
    const lastIndex = candles.length - 1;
    const last = candles[lastIndex];

    if (last && last[0] === bucketStart) {
      candles[lastIndex] = [
        last[0],
        last[1],
        Math.max(Number(last[2]), price),
        Math.min(Number(last[3]), price),
        price,
        last[5]
      ];
    } else if (!last || bucketStart > last[0]) {
      candles.push([bucketStart, price, price, price, price, 0]);
    } else {
      return;
    }

    const trimmed = candles.slice(-240);
    liveHmaCandlesRef.current = {
      ...liveHmaCandlesRef.current,
      [side]: {
        ...sideCandles,
        [timeframe]: trimmed
      }
    };
    setSideHma(side, timeframe, calculateHmaFromCandles(trimmed));
  };

  const computeOptionLevels = (candles) => {
    if (!Array.isArray(candles) || !candles.length) return null;
    let low = Infinity;
    let high = -Infinity;
    candles.forEach(c => {
      const candleLow = Number(c?.[3]);
      const candleHigh = Number(c?.[2]);
      if (Number.isFinite(candleLow) && candleLow < low) low = candleLow;
      if (Number.isFinite(candleHigh) && candleHigh > high) high = candleHigh;
    });
    if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
    const diff = high - low;
    return { low, mid: low + diff * 0.5, high, ext: low + diff * 1.618 };
  };

  const fetchStaticOptionLevels = async (token, side) => {
    if (!token) return;
    try {
      const fromDateTime = `${fromDate} 09:15:00`;
      const toDateTime = `${toDate} 15:30:00`;
      const data = await TradingService.getHistoricalData(token, fromDateTime, toDateTime, 'minute');
      const candles = data?.candles || [];
      if (candles.length) {
        const lastClose = candles[candles.length - 1]?.[4] ?? null;
        const levels = computeOptionLevels(candles);
        if (side === 'PE') {
          setPeLastClose(lastClose);
          setPeFibLevels(levels);
        }
        if (side === 'CE') {
          setCeLastClose(lastClose);
          setCeFibLevels(levels);
        }
      }
    } catch (e) { console.warn('Option level fetch failed', e.message); }
  };

  const fetchLiveHmaSeed = async (token, side, timeframe) => {
    if (!token || !timeframeToInterval[timeframe]) return;
    try {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - (liveHmaLookbackDays[timeframe] || 20));
      const data = await TradingService.getHistoricalData(
        token,
        formatDateTimeForKite(from),
        formatDateTimeForKite(to),
        timeframeToInterval[timeframe]
      );
      const candles = (data?.candles || [])
        .map(normalizeCandle)
        .filter(candle => candle.every(value => Number.isFinite(value)));

      liveHmaCandlesRef.current = {
        ...liveHmaCandlesRef.current,
        [side]: {
          ...(liveHmaCandlesRef.current[side] || {}),
          [timeframe]: candles.slice(-240)
        }
      };
      setSideHma(side, timeframe, calculateHmaFromCandles(candles));
    } catch (e) { console.warn(`Live ${side} HMA seed fetch failed`, e.message); }
  };

  useEffect(() => { if (peOptionToken) fetchStaticOptionLevels(peOptionToken, 'PE'); }, [peOptionToken, fromDate, toDate]);
  useEffect(() => { if (ceOptionToken) fetchStaticOptionLevels(ceOptionToken, 'CE'); }, [ceOptionToken, fromDate, toDate]);
  useEffect(() => { if (peOptionToken) fetchLiveHmaSeed(peOptionToken, 'PE', peTimeframe); }, [peOptionToken, peTimeframe]);
  useEffect(() => { if (ceOptionToken) fetchLiveHmaSeed(ceOptionToken, 'CE', ceTimeframe); }, [ceOptionToken, ceTimeframe]);

  // Subscribe to real-time option ticks and update live LTP/HMA.
  useEffect(() => {
    const tokens = [peOptionToken, ceOptionToken]
      .map(token => Number(token))
      .filter(token => Number.isFinite(token));
    if (!tokens.length) return undefined;

    TradingService.subscribeToInstruments(tokens);
    tokens.forEach(token => {
      if (Number(token) === Number(peOptionToken)) peSubscribed.current = true;
      if (Number(token) === Number(ceOptionToken)) ceSubscribed.current = true;
    });

    function handleTicks(ticks) {
      if (!Array.isArray(ticks)) return;
      ticks.forEach(t => {
        const tickToken = Number(t.instrument_token);
        const price = Number(t.last_price);
        if (!Number.isFinite(tickToken) || !Number.isFinite(price)) return;

        if (tickToken === Number(peOptionToken)) {
          setPeLtp(price);
          lastTickRef.current.pe = Date.now();
          applyLiveTickToHma('PE', peTimeframeRef.current, price, getTickTime(t));
        }
        if (tickToken === Number(ceOptionToken)) {
          setCeLtp(price);
          lastTickRef.current.ce = Date.now();
          applyLiveTickToHma('CE', ceTimeframeRef.current, price, getTickTime(t));
        }
      });
    }

    const unsubscribe = TradingService.subscribeToTicks(handleTicks);
    return () => { if (unsubscribe) unsubscribe(); };
  }, [peOptionToken, ceOptionToken]);
  return (
    <div className="analytics-section">
      {/* Header */}
      <div className="analytics-header">
        <div className="header-content">
          <h1 className="section-title">
            <ChartBarIcon className="title-icon" />
            Historical Analysis
          </h1>

        </div>
      </div>
      <div className="debug-toggle" onClick={() => setDebugOpen(o => !o)}>{debugOpen ? 'Hide Option Debug' : 'Show Option Debug'}</div>
      {debugOpen && (
        <div className="option-debug-panel">
          <h4>Option Resolution Debug</h4>
          <div className="expiry-meta">Expiry: {expiryDisplay} ({optionExpiry === 'next' ? 'Next Wk' : 'Current Wk'}) {expiryCode && <span className="expiry-code-chip">{expiryCode}</span>}</div>
          <div className="debug-row">
            <div className="debug-block">
              <h5>PE Candidates</h5>
              <ul>{debugInfo.pe.candidates.map(c => <li key={c} className={debugInfo.pe.resolved?.symbol === c ? 'resolved' : ''}>{c}</li>)}</ul>
              <div className="resolved-line">Resolved: {debugInfo.pe.resolved ? `${debugInfo.pe.resolved.symbol} -> ${debugInfo.pe.resolved.token} (${debugInfo.pe.resolved.method})` : '—'}</div>
              {debugInfo.pe.resolved?.expiry && <div className="expiry-line">Expiry Code: {debugInfo.pe.resolved.expiry.code}</div>}
              <div className="ltp-line">LTP: {peLtp != null ? peLtp : '—'}</div>
            </div>
            <div className="debug-block">
              <h5>CE Candidates</h5>
              <ul>{debugInfo.ce.candidates.map(c => <li key={c} className={debugInfo.ce.resolved?.symbol === c ? 'resolved' : ''}>{c}</li>)}</ul>
              <div className="resolved-line">Resolved: {debugInfo.ce.resolved ? `${debugInfo.ce.resolved.symbol} -> ${debugInfo.ce.resolved.token} (${debugInfo.ce.resolved.method})` : '—'}</div>
              {debugInfo.ce.resolved?.expiry && <div className="expiry-line">Expiry Code: {debugInfo.ce.resolved.expiry.code}</div>}
              <div className="ltp-line">LTP: {ceLtp != null ? ceLtp : '—'}</div>
            </div>
          </div>
          <div className="debug-notes">If no resolution, verify actual contract symbol via backend search endpoint. Strike or expiry formatting may differ.</div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="analytics-main">
        {/* Left Column - Configuration */}
        <div className="config-column">
          <div className="config-card">
            <div className="config-card-inner">
              <h3 className="config-title">Analysis Configuration</h3>
              <div className="config-layout">
                {/* Sidebar (Quick Select + Tips) */}
                <aside className="config-sidebar">
                  <div className="panel-group">
                    <div className="panel-block">
                      <h4 className="panel-label">Quick Select</h4>
                      <div className="quick-select-buttons vertical tight">
                        <button
                          className="quick-btn"
                          onClick={() => handleInstrumentSelect({
                            tradingsymbol: 'NIFTY 50',
                            name: 'Nifty 50',
                            exchange: 'NSE',
                            instrument_token: '256265'
                          })}
                        >
                          NIFTY 50
                        </button>
                        <button
                          className="quick-btn"
                          onClick={() => handleInstrumentSelect({
                            tradingsymbol: 'BANK NIFTY',
                            name: 'Bank Nifty',
                            exchange: 'NSE',
                            instrument_token: '260105'
                          })}
                        >
                          BANK NIFTY
                        </button>
                        <button
                          className="quick-btn"
                          onClick={() => handleInstrumentSelect({
                            tradingsymbol: 'GIFT NIFTY',
                            name: 'Gift Nifty',
                            exchange: 'NSEIX',
                            instrument_token: '291849'
                          })}
                        >
                          GIFT NIFTY
                        </button>
                      </div>
                    </div>
                    <div className="panel-block tips-block">
                      <div className="tips-header">
                        <InformationCircleIcon className="tips-icon" />
                        <span className="tips-title">Guidelines</span>
                      </div>
                      <ul className="tips-list">
                        <li>Use dates ending ≥ 2 days ago</li>
                        <li>Range ≤ 10 days for performance</li>
                        <li>Weekends auto-excluded</li>
                      </ul>
                    </div>
                  </div>
                </aside>

                {/* Main Form */}
                <div className="config-main">
                  {/* Instrument */}
                  <div className="form-group instrument-group">
                    <label className="config-label inline-label">
                      <MagnifyingGlassIcon className="label-icon" />
                      Instrument
                    </label>
                    <div className="instrument-selector compact">
                      {selectedInstrument ? (
                        <div className="selected-instrument compact">
                          <div className="instrument-info">
                            <span className="instrument-symbol">{selectedInstrument.tradingsymbol}</span>
                            {selectedInstrument.name && selectedInstrument.name.trim().toLowerCase() !== selectedInstrument.tradingsymbol.trim().toLowerCase() && (
                              <span className="instrument-name">{selectedInstrument.name}</span>
                            )}
                            <span className="instrument-exchange">{selectedInstrument.exchange}</span>
                          </div>
                          <button
                            className="change-instrument-btn ghost"
                            aria-label="Change instrument"
                            onClick={() => setShowInstrumentSearch(true)}
                          >
                            Change
                          </button>
                        </div>
                      ) : (
                        <button
                          className="select-instrument-btn"
                          onClick={() => setShowInstrumentSearch(true)}
                        >
                          <MagnifyingGlassIcon className="btn-icon" />
                          Choose Instrument
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Date Range */}
                  <div className="form-group date-group">
                    {/* Expiry selection moved into strike cards */}
                    <div className="group-header">
                      <span className="group-title">Date Range</span>
                      {duration && (
                        <span className="duration-chip" aria-live="polite">{duration} day{duration > 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <div className="date-grid">
                      <div className="date-cell">
                        <label className="config-label small-label">
                          <CalendarDaysIcon className="label-icon" /> From
                        </label>
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => {
                            const newFromDate = e.target.value;
                            setFromDate(newFromDate);
                            if (newFromDate) {
                              const fromDateObj = new Date(newFromDate);
                              const newToDateObj = new Date(fromDateObj);
                              newToDateObj.setDate(newToDateObj.getDate() + 6);

                              const maxDate = new Date();
                              maxDate.setDate(maxDate.getDate() - 2);

                              if (newToDateObj > maxDate) {
                                setToDate(maxDate.toISOString().split('T')[0]);
                              } else {
                                setToDate(newToDateObj.toISOString().split('T')[0]);
                              }
                            }
                          }}
                          className="date-input compact"
                          max={(() => {
                            const maxDate = new Date();
                            maxDate.setDate(maxDate.getDate() - 2);
                            return maxDate.toISOString().split('T')[0];
                          })()}
                          aria-label="From date (must be earlier than To date)"
                        />
                      </div>
                      <div className="date-cell">
                        <label className="config-label small-label">
                          <CalendarDaysIcon className="label-icon" /> To
                        </label>
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="date-input compact"
                          min={fromDate}
                          max={(() => {
                            const maxDate = new Date();
                            maxDate.setDate(maxDate.getDate() - 2);
                            return maxDate.toISOString().split('T')[0];
                          })()}
                          aria-label="To date (must be after From date)"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Inline Extended Tips (optional expansion could be future) */}
                  <div className="inline-help" role="note">
                    <p>Market hours applied automatically (09:15–15:30). Holidays excluded.</p>
                  </div>

                  {/* Actions */}
                  <div className="form-actions compact-actions">
                    <button
                      className="action-btn secondary subtle"
                      onClick={handleClear}
                      disabled={!selectedInstrument && !fromDate && !toDate}
                    >
                      Clear
                    </button>
                    <button
                      className="action-btn primary"
                      onClick={handleAnalyze}
                      disabled={loading || !selectedInstrument || !fromDate || !toDate}
                    >
                      {loading ? 'Analyzing...' : 'Analyze'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="error-card">
              <InformationCircleIcon className="error-icon" />
              <div className="error-content">
                <h4>Analysis Error</h4>
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Results */}
        <div className="results-column">
          {/* Loading State */}
          {loading && (
            <div className="loading-section">
              <div className="loading-spinner"></div>
              <p>Analyzing historical data...</p>
            </div>
          )}

          {/* Results Display */}
          {highLowData && (
            <div className="results-section">
              <h3 className="results-title">Analysis Results</h3>

              <div className="results-grid">
                {/* High Price Card */}
                <div className="result-card high-card">
                  <div className="card-header">
                    <h4 className="card-title">Index high</h4>
                    <ArrowTrendingUpIcon className="card-icon high-icon" />
                  </div>
                  <div className="card-value high-value">
                    ₹{normalizedHigh?.toLocaleString?.()}
                  </div>

                  {peStrike && (
                    <div className="strike-line pe-strike">
                      <div className="strike-header">
                        <span className="strike-label">PE Strike</span>
                        <span className="strike-value">₹{peStrike}</span>
                      </div>
                      <div className="strike-controls">
                        <div className="strike-ltp">
                          {typeof peLtp === 'number'
                            ? `Live LTP: ₹${peLtp.toFixed(2)}`
                            : (typeof peLastClose === 'number'
                              ? `Last close: ₹${peLastClose.toFixed(2)}`
                              : 'LTP: --')}
                        </div>
                        <div className="expiry-select-wrap">
                          <select className="expiry-select small" value={optionExpiry} onChange={e => setOptionExpiry(e.target.value)}>
                            <option value="current">Current Wk</option>
                            <option value="next">Next Wk</option>
                          </select>
                          <span className="expiry-display" title="Derived weekly expiry date">{expiryDisplay.split(',')[0]}</span>
                        </div>
                      </div>
                      <div className="fib-grid">
                        <div className="fib-item">
                          <div className="fib-label">0 (Low)</div>
                          <div className="fib-value">{peFibLevels && typeof peFibLevels.low === 'number' ? `₹${peFibLevels.low.toFixed(2)}` : '--'}</div>
                        </div>
                        <div className="fib-item">
                          <div className="fib-label">0.5 (Mid)</div>
                          <div className="fib-value">{peFibLevels && typeof peFibLevels.mid === 'number' ? `₹${peFibLevels.mid.toFixed(2)}` : '--'}</div>
                        </div>
                        <div className="fib-item">
                          <div className="fib-label">1 (High)</div>
                          <div className="fib-value">{peFibLevels && typeof peFibLevels.high === 'number' ? `₹${peFibLevels.high.toFixed(2)}` : '--'}</div>
                        </div>
                        <div className="fib-item">
                          <div className="fib-label">1.618 (Ext)</div>
                          <div className="fib-value">{peFibLevels && typeof peFibLevels.ext === 'number' ? `₹${peFibLevels.ext.toFixed(2)}` : '--'}</div>
                        </div>
                      </div>
                      <div className="hma-row">
                        <select className="hma-select" value={peTimeframe} onChange={e => setPeTimeframe(e.target.value)}>
                          <option value="15m">15m</option>
                          <option value="1h">1h</option>
                          <option value="1d">1d</option>
                        </select>
                        <div className="hma-value">HMA50: {typeof peHma[peTimeframe] === 'number' ? peHma[peTimeframe].toFixed(2) : '--'}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Low Price Card */}
                <div className="result-card low-card">
                  <div className="card-header">
                    <h4 className="card-title">Lowest Price</h4>
                    <ArrowTrendingDownIcon className="card-icon low-icon" />
                  </div>
                  <div className="card-value low-value">
                    ₹{normalizedLow?.toLocaleString?.()}
                  </div>

                  {ceStrike && (
                    <div className="strike-line ce-strike">
                      <div className="strike-header">
                        <span className="strike-label">CE Strike</span>
                        <span className="strike-value">₹{ceStrike}</span>
                      </div>
                      <div className="strike-controls">
                        <div className="strike-ltp">
                          {typeof ceLtp === 'number'
                            ? `Live LTP: ₹${ceLtp.toFixed(2)}`
                            : (typeof ceLastClose === 'number'
                              ? `Last close: ₹${ceLastClose.toFixed(2)}`
                              : 'LTP: --')}
                        </div>
                        <div className="expiry-select-wrap">
                          <select className="expiry-select small" value={optionExpiry} onChange={e => setOptionExpiry(e.target.value)}>
                            <option value="current">Current Wk</option>
                            <option value="next">Next Wk</option>
                          </select>
                          <span className="expiry-display" title="Derived weekly expiry date">{expiryDisplay.split(',')[0]}</span>
                        </div>
                      </div>
                      <div className="fib-grid">
                        <div className="fib-item">
                          <div className="fib-label">0 (Low)</div>
                          <div className="fib-value">{ceFibLevels && typeof ceFibLevels.low === 'number' ? `₹${ceFibLevels.low.toFixed(2)}` : '--'}</div>
                        </div>
                        <div className="fib-item">
                          <div className="fib-label">0.5 (Mid)</div>
                          <div className="fib-value">{ceFibLevels && typeof ceFibLevels.mid === 'number' ? `₹${ceFibLevels.mid.toFixed(2)}` : '--'}</div>
                        </div>
                        <div className="fib-item">
                          <div className="fib-label">1 (High)</div>
                          <div className="fib-value">{ceFibLevels && typeof ceFibLevels.high === 'number' ? `₹${ceFibLevels.high.toFixed(2)}` : '--'}</div>
                        </div>
                        <div className="fib-item">
                          <div className="fib-label">1.618 (Ext)</div>
                          <div className="fib-value">{ceFibLevels && typeof ceFibLevels.ext === 'number' ? `₹${ceFibLevels.ext.toFixed(2)}` : '--'}</div>
                        </div>
                      </div>
                      <div className="hma-row">
                        <select className="hma-select" value={ceTimeframe} onChange={e => setCeTimeframe(e.target.value)}>
                          <option value="15m">15m</option>
                          <option value="1h">1h</option>
                          <option value="1d">1d</option>
                        </select>
                        <div className="hma-value">HMA50: {typeof ceHma[ceTimeframe] === 'number' ? ceHma[ceTimeframe].toFixed(2) : '--'}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Range Card */}
                <div className="result-card range-card">
                  <div className="card-header">
                    <h4 className="card-title">Price Range</h4>
                    <ChartBarIcon className="card-icon range-icon" />
                  </div>
                  <div className="card-value range-value">
                    ₹{(highLowData.high - highLowData.low).toLocaleString()}
                  </div>
                  <div className="card-subtitle">
                    {(typeof highLowData.high === 'number' && typeof highLowData.low === 'number' && highLowData.low !== 0)
                      ? (((highLowData.high - highLowData.low) / highLowData.low) * 100).toFixed(2)
                      : '--'}% variation
                  </div>
                </div>

                {/* Trading Days Card */}
                <div className="result-card data-card">
                  <div className="card-header">
                    <h4 className="card-title">Trading Days</h4>
                    <ClockIcon className="card-icon data-icon" />
                  </div>
                  <div className="card-value data-value">
                    {highLowData.dataPoints}
                  </div>
                  <div className="card-subtitle">
                    Trading days analyzed
                  </div>
                </div>
              </div>

              {/* Summary Info */}
              <div className="results-summary">
                <div className="summary-card">
                  <h4 className="summary-title">Analysis Summary</h4>
                  <div className="summary-content">
                    <p>
                      <strong>{selectedInstrument.tradingsymbol}</strong> traded between{' '}
                      <span className="low-highlight">₹{highLowData.low}</span> and{' '}
                      <span className="high-highlight">₹{highLowData.high}</span> during the selected period.
                    </p>
                    <p>
                      The price range represents a{' '}
                      <strong>{(typeof highLowData.high === 'number' && typeof highLowData.low === 'number' && highLowData.low !== 0)
                        ? (((highLowData.high - highLowData.low) / highLowData.low) * 100).toFixed(2)
                        : '--'}%</strong> variation
                      over <strong>{duration} calendar days</strong> with <strong>{highLowData.dataPoints}</strong> trading sessions.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Placeholder when no results */}
          {!highLowData && !loading && !error && (
            <div className="results-placeholder">
              <ChartBarIcon className="placeholder-icon" />
              <h3>Ready for Analysis</h3>
              <p>Configure your analysis parameters and click "Analyze" to see results here.</p>
            </div>
          )}
        </div>
      </div>

      {/* Instrument Search Modal */}
      {showInstrumentSearch && (
        <InstrumentSearch
          onSelectInstrument={handleInstrumentSelect}
          onClose={() => setShowInstrumentSearch(false)}
        />
      )}
    </div>
  );
};

export default Analytics;

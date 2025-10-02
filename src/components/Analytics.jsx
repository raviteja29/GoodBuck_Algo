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
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState({ pe: { candidates: [], resolved: null }, ce: { candidates: [], resolved: null } });
  const peSubscribed = useRef(false);
  const ceSubscribed = useRef(false);
  
  // Set default dates to a week ago (more likely to have data)
  const getDefaultDates = () => {
    const today = new Date();
    const oneWeekAgo = new Date();
    const twoWeeksAgo = new Date();
    
    oneWeekAgo.setDate(today.getDate() - 7);
    twoWeeksAgo.setDate(today.getDate() - 14);
    
    return {
      from: twoWeeksAgo.toISOString().split('T')[0],
      to: oneWeekAgo.toISOString().split('T')[0]
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
  // ================= Strike Derivation Helpers =================
  // Step size: 100 for BANK NIFTY related symbols, else 50
  const getStrikeStep = (symbol) => /BANK/i.test(symbol || '') ? 100 : 50;
  const roundUpTo = (val, step) => (typeof val === 'number') ? Math.ceil(val / step) * step : null;
  const roundDownTo = (val, step) => (typeof val === 'number') ? Math.floor(val / step) * step : null;

  // Normalize potential key name variations (defensive)
  const normalizeHighLow = (data) => {
    if (!data) return { high: null, low: null };
    const highCandidates = ['high','highest','max'];
    const lowCandidates = ['low','lowest','min'];
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

  // Simple approach: Use direct search like positions API does
  const searchForOption = async (underlying, strike, optionType, expiryChoice) => {
    try {
      // Map display names to option search terms
      const underlyingMap = {
        'NIFTY 50': 'NIFTY',
        'BANKNIFTY': 'BANKNIFTY',
        'FINNIFTY': 'FINNIFTY'
      };
      
      const searchUnderlying = underlyingMap[underlying] || underlying;
      console.log(`[OptionSearch] Searching for ${searchUnderlying} ${strike}${optionType} options (mapped from ${underlying})`);
      
      // Search broadly for the underlying instrument (same as positions API)
      const searchResults = await TradingService.searchInstruments(searchUnderlying);
      console.log(`[OptionSearch] Found ${searchResults.length} total instruments for ${searchUnderlying}`);
      
      if (!searchResults.length) return null;
      
      // Filter for option contracts with matching strike and type
      const optionContracts = searchResults.filter(instrument => {
        const symbol = instrument.tradingsymbol || '';
        const isOption = instrument.instrument_type === 'OPT' || symbol.includes('CE') || symbol.includes('PE');
        const hasStrike = symbol.includes(String(strike));
        const hasType = symbol.includes(optionType);
        
        console.log(`[OptionSearch] Checking ${symbol}: isOption=${isOption}, hasStrike=${hasStrike} (looking for ${strike}), hasType=${hasType} (looking for ${optionType})`);
        
        return isOption && hasStrike && hasType;
      });
      
      console.log(`[OptionSearch] Found ${optionContracts.length} option contracts for ${strike}${optionType}:`, 
        optionContracts.map(c => c.tradingsymbol));
      
      // Also log some examples of what was filtered out
      const sampleFilteredOut = searchResults
        .filter(instrument => {
          const symbol = instrument.tradingsymbol || '';
          return (symbol.includes('CE') || symbol.includes('PE')) && 
                 symbol.includes(String(strike)) && 
                 !symbol.includes(optionType);
        })
        .slice(0, 3);
      
      if (sampleFilteredOut.length > 0) {
        console.log(`[OptionSearch] Sample contracts with same strike but different type:`, 
          sampleFilteredOut.map(c => c.tradingsymbol));
      }
      
      if (optionContracts.length === 0) return null;
      
      // If multiple contracts found, try to pick the most relevant one
      // Prefer weekly contracts that are closer to current date
      const bestMatch = optionContracts.reduce((best, current) => {
        // Simple heuristic: shorter symbol names are often weekly contracts
        if (!best) return current;
        return current.tradingsymbol.length < best.tradingsymbol.length ? current : best;
      });
      
      console.log(`[OptionSearch] Selected best match:`, bestMatch.tradingsymbol);
      return bestMatch;
      
    } catch (error) {
      console.error(`[OptionSearch] Search failed:`, error);
      return null;
    }
  };

  // Resolve option instrument tokens when strikes and instrument selected or expiry changes
  useEffect(() => {
    let cancelled = false;
    async function resolveTokens() {
      setPeOptionToken(null); setCeOptionToken(null);
      setPeFibLevels(null); setCeFibLevels(null);
      peSubscribed.current = false; ceSubscribed.current = false;
      setPeLtp(null); setCeLtp(null);
      if (!selectedInstrument || !peStrike || !ceStrike) return;
      
      const under = selectedInstrument.tradingsymbol;
      // Capture expiry context for this resolution cycle
      const { currentWeek, nextWeek } = getWeeklyExpiryDates();
      const chosenExpiryDate = optionExpiry === 'next' ? nextWeek : currentWeek;
      const chosenExpiryCode = chosenExpiryDate ? formatExpiryCode(chosenExpiryDate) : null;
      
      setDebugInfo(prev => ({
        ...prev,
        pe: { ...prev.pe, candidates: [`Searching for ${under} ${peStrike}PE options...`], resolved: null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } },
        ce: { ...prev.ce, candidates: [`Searching for ${under} ${ceStrike}CE options...`], resolved: null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } }
      }));

      // Use simple search approach (same as positions API)
      try {
        // Search for PE option
        const peOption = await searchForOption(under, peStrike, 'PE', optionExpiry);
        if (peOption) {
          const token = peOption.instrument_token || peOption.token;
          console.log(`[OptionResolve] PE resolved: ${peOption.tradingsymbol} -> token ${token}`);
          setPeOptionToken(token);
          
          // Fetch initial LTP
          try {
            const q = await TradingService.getQuote(token);
            if (q?.last_price != null) setPeLtp(q.last_price);
            setDebugInfo(prev => ({ ...prev, pe: { ...prev.pe, resolved: { symbol: peOption.tradingsymbol, token, method: 'direct-search', ltp: q?.last_price ?? null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } }}));
          } catch(_) {
            setDebugInfo(prev => ({ ...prev, pe: { ...prev.pe, resolved: { symbol: peOption.tradingsymbol, token, method: 'direct-search', ltp: null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } }}));
          }
        } else {
          setDebugInfo(prev => ({ ...prev, pe: { ...prev.pe, resolved: { error: 'No PE option found' } }}));
        }

        // Search for CE option  
        const ceOption = await searchForOption(under, ceStrike, 'CE', optionExpiry);
        if (ceOption) {
          const token = ceOption.instrument_token || ceOption.token;
          console.log(`[OptionResolve] CE resolved: ${ceOption.tradingsymbol} -> token ${token}`);
          setCeOptionToken(token);
          
          // Fetch initial LTP
          try {
            const q = await TradingService.getQuote(token);
            if (q?.last_price != null) setCeLtp(q.last_price);
            setDebugInfo(prev => ({ ...prev, ce: { ...prev.ce, resolved: { symbol: ceOption.tradingsymbol, token, method: 'direct-search', ltp: q?.last_price ?? null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } }}));
          } catch(_) {
            setDebugInfo(prev => ({ ...prev, ce: { ...prev.ce, resolved: { symbol: ceOption.tradingsymbol, token, method: 'direct-search', ltp: null, expiry: { choice: optionExpiry, date: chosenExpiryDate, code: chosenExpiryCode } } }}));
          }
        } else {
          setDebugInfo(prev => ({ ...prev, ce: { ...prev.ce, resolved: { error: 'No CE option found' } }}));
        }
        
      } catch (error) {
        console.error('[OptionResolve] Resolution failed:', error);
        setDebugInfo(prev => ({
          ...prev,
          pe: { ...prev.pe, resolved: { error: error.message } },
          ce: { ...prev.ce, resolved: { error: error.message } }
        }));
      }
    }
    resolveTokens();
    return () => { cancelled = true; };
  }, [selectedInstrument, peStrike, ceStrike, optionExpiry]);

  // Static Fibonacci levels (per option token + date range). Cached so they don't change with live LTP.
  const fibCacheRef = useRef({}); // key: token|fromDate|toDate
  useEffect(() => {
    let cancelled = false;
    async function computeFib(token, setter) {
      if (!token || !fromDate || !toDate) return;
      const key = `${token}|${fromDate}|${toDate}`;
      if (fibCacheRef.current[key]) { setter(fibCacheRef.current[key]); return; }
      try {
        const fromDateTime = `${fromDate} 09:15:00`;
        const toDateTime = `${toDate} 15:30:00`;
        const data = await TradingService.getHistoricalData(token, fromDateTime, toDateTime, 'day');
        const candles = data?.candles || [];
        if (!candles.length) { if(!cancelled) setter(null); return; }
        let low = Infinity, high = -Infinity;
        candles.forEach(c => { if (c[3] < low) low = c[3]; if (c[2] > high) high = c[2]; });
        if (low === Infinity || high === -Infinity) { if(!cancelled) setter(null); return; }
        const diff = high - low;
        const fibs = { 0: low, 0.5: low + diff * 0.5, 1: high, 1.618: low + diff * 1.618 };
        fibCacheRef.current[key] = fibs;
        if (!cancelled) setter(fibs);
      } catch(e) {
        console.warn('Fib fetch failed', e.message);
      }
    }
    if (peOptionToken && !peFibLevels) computeFib(peOptionToken, setPeFibLevels);
    if (ceOptionToken && !ceFibLevels) computeFib(ceOptionToken, setCeFibLevels);
    return () => { cancelled = true; };
  }, [peOptionToken, ceOptionToken, peFibLevels, ceFibLevels, fromDate, toDate]);

  // Subscribe to real-time option data with fallback when WebSocket fails
  const lastTickRef = useRef({ pe: null, ce: null });
  const fallbackIntervalRef = useRef(null);

  // Fallback quote fetching when WebSocket is unavailable
  useEffect(() => {
    if (!peOptionToken && !ceOptionToken) return;
    
    let cancelled = false;
    
    // Initial quote fetch
    const fetchInitialQuotes = async () => {
      try {
        if (peOptionToken) {
          const peQuote = await TradingService.getQuote(peOptionToken);
          if (!cancelled && peQuote?.last_price != null) {
            setPeLtp(peQuote.last_price);
            console.log(`[Analytics] PE initial LTP: ${peQuote.last_price}`);
          }
        }
        if (ceOptionToken) {
          const ceQuote = await TradingService.getQuote(ceOptionToken);
          if (!cancelled && ceQuote?.last_price != null) {
            setCeLtp(ceQuote.last_price);
            console.log(`[Analytics] CE initial LTP: ${ceQuote.last_price}`);
          }
        }
      } catch (err) {
        console.warn('[Analytics] Initial quote fetch failed:', err.message);
      }
    };

    // Start with initial fetch
    fetchInitialQuotes();

    // Set up fallback polling for when WebSocket fails
    fallbackIntervalRef.current = setInterval(async () => {
      try {
        if (peOptionToken) {
          const peQuote = await TradingService.getQuote(peOptionToken);
          if (!cancelled && peQuote?.last_price != null) {
            setPeLtp(peQuote.last_price);
          }
        }
        if (ceOptionToken) {
          const ceQuote = await TradingService.getQuote(ceOptionToken);
          if (!cancelled && ceQuote?.last_price != null) {
            setCeLtp(ceQuote.last_price);
          }
        }
      } catch (err) {
        console.warn('[Analytics] Fallback quote polling failed:', err.message);
      }
    }, 10000); // Poll every 10 seconds as fallback

    return () => {
      cancelled = true;
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [peOptionToken, ceOptionToken]);

  // Subscribe to real-time option ticks (with graceful WebSocket failure handling)
  useEffect(() => {
    const unsubscribers = [];
    
    // Real-time tick handler
    function handleTicks(ticks) {
      if (!Array.isArray(ticks)) return;
      console.log(`[Analytics] Received ${ticks.length} ticks via WebSocket`);
      
      ticks.forEach(tick => {
        if (!tick || !tick.instrument_token) return;
        
        // Update PE option LTP
        if (tick.instrument_token === peOptionToken && tick.last_price != null) {
          console.log(`[Analytics] PE LTP from WebSocket: ${tick.last_price}`);
          setPeLtp(tick.last_price);
          lastTickRef.current.pe = Date.now();
        }
        
        // Update CE option LTP  
        if (tick.instrument_token === ceOptionToken && tick.last_price != null) {
          console.log(`[Analytics] CE LTP from WebSocket: ${tick.last_price}`);
          setCeLtp(tick.last_price);
          lastTickRef.current.ce = Date.now();
        }
      });
    }
    
    // Try to subscribe to WebSocket (will fail gracefully if server unavailable)
    const tokens = [];
    if (peOptionToken && !peSubscribed.current) {
      tokens.push(peOptionToken);
      peSubscribed.current = true;
    }
    if (ceOptionToken && !ceSubscribed.current) {
      tokens.push(ceOptionToken);
      ceSubscribed.current = true;
    }
    
    if (tokens.length > 0) {
      console.log(`[Analytics] Attempting WebSocket subscription to tokens:`, tokens);
      try {
        TradingService.subscribeToInstruments(tokens);
        const unsub = TradingService.subscribeToTicks(handleTicks);
        unsubscribers.push(unsub);
        console.log(`[Analytics] WebSocket subscription successful`);
      } catch (error) {
        console.warn(`[Analytics] WebSocket subscription failed, using fallback polling:`, error.message);
      }
    }
    
    return () => { 
      unsubscribers.forEach(u => u && u()); 
    };
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

  const computeHMA = (closes, period=50) => {
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

  const fetchHMAIfNeeded = async (token, timeframe, stateObj, setStateObj) => {
    if (!token) return;
    if (stateObj[timeframe] != null) return; // already computed
    try {
      const fromDateTime = `${fromDate} 09:15:00`;
      const toDateTime = `${toDate} 15:30:00`;
      const interval = timeframeToInterval[timeframe];
      const data = await TradingService.getHistoricalData(token, fromDateTime, toDateTime, interval);
      const candles = data?.candles || [];
      const closes = candles.map(c => c[4]);
      const hmaVal = computeHMA(closes, 50);
      setStateObj(prev => ({ ...prev, [timeframe]: hmaVal }));
    } catch (e) { console.warn('HMA fetch failed', e.message); }
  };

  useEffect(() => { if (peOptionToken) fetchHMAIfNeeded(peOptionToken, peTimeframe, peHma, setPeHma); }, [peOptionToken, peTimeframe]);
  useEffect(() => { if (ceOptionToken) fetchHMAIfNeeded(ceOptionToken, ceTimeframe, ceHma, setCeHma); }, [ceOptionToken, ceTimeframe]);
  
  // Debug LTP changes
  useEffect(() => {
    console.log(`[Analytics Debug] PE LTP changed:`, peLtp);
  }, [peLtp]);
  
  useEffect(() => {
    console.log(`[Analytics Debug] CE LTP changed:`, ceLtp);
  }, [ceLtp]);

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
      <div className="debug-toggle" onClick={() => setDebugOpen(o=>!o)}>{debugOpen ? 'Hide Option Debug' : 'Show Option Debug'}</div>
      {debugOpen && (
        <div className="option-debug-panel">
          <h4>Option Resolution Debug</h4>
          <div className="expiry-meta">Expiry: {expiryDisplay} ({optionExpiry === 'next' ? 'Next Wk' : 'Current Wk'}) {expiryCode && <span className="expiry-code-chip">{expiryCode}</span>}</div>
          <div className="debug-row">
            <div className="debug-block">
              <h5>PE Candidates</h5>
              <ul>{debugInfo.pe.candidates.map(c => <li key={c} className={debugInfo.pe.resolved?.symbol===c? 'resolved':''}>{c}</li>)}</ul>
              <div className="resolved-line">Resolved: {debugInfo.pe.resolved ? `${debugInfo.pe.resolved.symbol} -> ${debugInfo.pe.resolved.token} (${debugInfo.pe.resolved.method})` : '—'}</div>
              {debugInfo.pe.resolved?.expiry && <div className="expiry-line">Expiry Code: {debugInfo.pe.resolved.expiry.code}</div>}
              <div className="ltp-line">LTP: {peLtp != null ? peLtp : '—'}</div>
            </div>
            <div className="debug-block">
              <h5>CE Candidates</h5>
              <ul>{debugInfo.ce.candidates.map(c => <li key={c} className={debugInfo.ce.resolved?.symbol===c? 'resolved':''}>{c}</li>)}</ul>
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
                        <span className="duration-chip" aria-live="polite">{duration} day{duration>1?'s':''}</span>
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
                          onChange={(e) => setFromDate(e.target.value)}
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
                      <div style={{fontSize: '10px', color: '#666'}}>Debug: peLtp={String(peLtp)} type={typeof peLtp}</div>
                      <div className="strike-ltp">LTP: {peLtp != null ? `₹${peLtp.toFixed(2)}` : '--'}</div>
                      <div className="expiry-select-wrap">
                        <select className="expiry-select small" value={optionExpiry} onChange={e=>setOptionExpiry(e.target.value)}>
                          <option value="current">Current Wk</option>
                          <option value="next">Next Wk</option>
                        </select>
                        <span className="expiry-display" title="Derived weekly expiry date">{expiryDisplay.split(',')[0]}</span>
                      </div>
                    </div>
                    <div className="fib-grid">
                      <div className="fib-item">
                        <div className="fib-label">0 (Low)</div>
                        <div className="fib-value">{peFibLevels ? `₹${peFibLevels.low.toFixed(2)}` : '--'}</div>
                      </div>
                      <div className="fib-item">
                        <div className="fib-label">0.5 (Mid)</div>
                        <div className="fib-value">{peFibLevels ? `₹${peFibLevels.mid.toFixed(2)}` : '--'}</div>
                      </div>
                      <div className="fib-item">
                        <div className="fib-label">1 (High)</div>
                        <div className="fib-value">{peFibLevels ? `₹${peFibLevels.high.toFixed(2)}` : '--'}</div>
                      </div>
                      <div className="fib-item">
                        <div className="fib-label">1.618 (Ext)</div>
                        <div className="fib-value">{peFibLevels ? `₹${peFibLevels.ext.toFixed(2)}` : '--'}</div>
                      </div>
                    </div>
                    <div className="hma-row">
                      <select className="hma-select" value={peTimeframe} onChange={e=>setPeTimeframe(e.target.value)}>
                        <option value="15m">15m</option>
                        <option value="1h">1h</option>
                        <option value="1d">1d</option>
                      </select>
                      <div className="hma-value">HMA50: {peHma[peTimeframe] != null ? peHma[peTimeframe].toFixed(2) : '--'}</div>
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
                        <div style={{fontSize: '10px', color: '#666'}}>Debug: ceLtp={String(ceLtp)} type={typeof ceLtp}</div>
                        <div className="strike-ltp">LTP: {ceLtp != null ? `₹${ceLtp.toFixed(2)}` : '--'}</div>
                        <div className="expiry-select-wrap">
                          <select className="expiry-select small" value={optionExpiry} onChange={e=>setOptionExpiry(e.target.value)}>
                            <option value="current">Current Wk</option>
                            <option value="next">Next Wk</option>
                          </select>
                          <span className="expiry-display" title="Derived weekly expiry date">{expiryDisplay.split(',')[0]}</span>
                        </div>
                      </div>
                      <div className="fib-grid">
                        <div className="fib-item">
                          <div className="fib-label">0 (Low)</div>
                          <div className="fib-value">{ceFibLevels ? `₹${ceFibLevels.low.toFixed(2)}` : '--'}</div>
                        </div>
                        <div className="fib-item">
                          <div className="fib-label">0.5 (Mid)</div>
                          <div className="fib-value">{ceFibLevels ? `₹${ceFibLevels.mid.toFixed(2)}` : '--'}</div>
                        </div>
                        <div className="fib-item">
                          <div className="fib-label">1 (High)</div>
                          <div className="fib-value">{ceFibLevels ? `₹${ceFibLevels.high.toFixed(2)}` : '--'}</div>
                        </div>
                        <div className="fib-item">
                          <div className="fib-label">1.618 (Ext)</div>
                          <div className="fib-value">{ceFibLevels ? `₹${ceFibLevels.ext.toFixed(2)}` : '--'}</div>
                        </div>
                      </div>
                      <div className="hma-row">
                        <select className="hma-select" value={ceTimeframe} onChange={e=>setCeTimeframe(e.target.value)}>
                          <option value="15m">15m</option>
                          <option value="1h">1h</option>
                          <option value="1d">1d</option>
                        </select>
                        <div className="hma-value">HMA50: {ceHma[ceTimeframe] != null ? ceHma[ceTimeframe].toFixed(2) : '--'}</div>
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
                    {(((highLowData.high - highLowData.low) / highLowData.low) * 100).toFixed(2)}% variation
                  </div>
                </div>

                {/* Data Points Card */}
                <div className="result-card data-card">
                  <div className="card-header">
                    <h4 className="card-title">Data Points</h4>
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
                      <strong>{(((highLowData.high - highLowData.low) / highLowData.low) * 100).toFixed(2)}%</strong> variation
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
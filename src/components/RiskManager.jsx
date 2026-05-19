import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  ChartBarIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import InstrumentSearch from './InstrumentSearch';
import TradingService from '../services/TradingService';
import './RiskManager.css';

const OPTION_TYPES = ['CE', 'PE'];
const TARGETS = [
  { label: '1:1', value: 1 },
  { label: '1:1.5', value: 1.5 },
  { label: '1:2', value: 2 }
];

const emptyChain = () => ({ CE: {}, PE: {} });

const RiskManager = () => {
  const [selectedInstrument, setSelectedInstrument] = useState(null);
  const [showInstrumentSearch, setShowInstrumentSearch] = useState(false);
  const [optionExpiry, setOptionExpiry] = useState('current');
  const [fromDate, setFromDate] = useState(() => getDefaultDates().from);
  const [toDate, setToDate] = useState(() => getDefaultDates().to);
  const [highLowData, setHighLowData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chainLoading, setChainLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chain, setChain] = useState(emptyChain);
  const [chainTokens, setChainTokens] = useState([]);
  const [lastLiveAt, setLastLiveAt] = useState(null);
  const tokenToContractRef = useRef({});
  const pollRef = useRef(null);

  const { high, low } = normalizeHighLow(highLowData);
  const mid = Number.isFinite(Number(high)) && Number.isFinite(Number(low))
    ? (Number(high) + Number(low)) / 2
    : null;
  const strikeStep = 50;
  const strikes = useMemo(() => getNearbyStrikes(mid, strikeStep, 8), [mid]);
  const selectedExpiryDate = getSelectedExpiryDate(optionExpiry);
  const expiryDisplay = selectedExpiryDate.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const isOptionEligibleInstrument = selectedInstrument
    ? isOptionEligibleSymbol(selectedInstrument.tradingsymbol, selectedInstrument.name)
    : false;

  const handleInstrumentSelect = (instrument) => {
    setSelectedInstrument(instrument);
    setShowInstrumentSearch(false);
    setHighLowData(null);
    setChain(emptyChain());
    setChainTokens([]);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!selectedInstrument) {
      setError('Please select an instrument first');
      return;
    }

    if (!isOptionEligibleInstrument) {
      setError('Risk Manager currently supports NIFTY and BANKNIFTY index option chains.');
      return;
    }

    if (!fromDate || !toDate || new Date(fromDate) >= new Date(toDate)) {
      setError('Please choose a valid date range.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await TradingService.getInstrumentHighLow(
        selectedInstrument.instrument_token,
        `${fromDate} 09:15:00`,
        `${toDate} 15:30:00`
      );
      setHighLowData(data);
    } catch (e) {
      setError(e.message || 'Unable to fetch index range');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function resolveChain() {
      tokenToContractRef.current = {};
      setLastLiveAt(null);

      if (!selectedInstrument || !isOptionEligibleInstrument || !strikes.length) {
        setChain(emptyChain());
        setChainTokens([]);
        return;
      }

      setChainLoading(true);
      setError(null);
      setChain(emptyChain());

      try {
        const contracts = await Promise.all(
          OPTION_TYPES.flatMap(optionType => (
            strikes.map(strike => resolveContract(selectedInstrument.tradingsymbol, strike, optionType, optionExpiry))
          ))
        );

        const nextChain = emptyChain();
        contracts.filter(Boolean).forEach(contract => {
          nextChain[contract.optionType][contract.strike] = contract;
          tokenToContractRef.current[Number(contract.token)] = {
            optionType: contract.optionType,
            strike: contract.strike
          };
        });

        const tokens = contracts.filter(Boolean).map(contract => contract.token);
        if (!cancelled) setChainTokens(tokens.map(Number).filter(Number.isFinite).sort((a, b) => a - b));
        const quotes = tokens.length ? await TradingService.getQuotes(tokens) : {};

        contracts.filter(Boolean).forEach(contract => {
          const quote = normalizeQuote(quotes?.[contract.token] || quotes?.[String(contract.token)]);
          const ltp = getQuoteLastPrice(quote);
          if (Number.isFinite(ltp)) {
            nextChain[contract.optionType][contract.strike] = {
              ...nextChain[contract.optionType][contract.strike],
              ltp,
              lastUpdated: Date.now()
            };
          }
        });

        if (!cancelled) setChain(nextChain);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Unable to build option chain');
      } finally {
        if (!cancelled) setChainLoading(false);
      }
    }

    resolveChain();
    return () => { cancelled = true; };
  }, [
    selectedInstrument,
    selectedInstrument?.tradingsymbol,
    isOptionEligibleInstrument,
    strikes,
    optionExpiry
  ]);

  useEffect(() => {
    const tokens = chainTokens;
    if (!tokens.length) return undefined;

    TradingService.subscribeToInstruments(tokens);

    const unsubscribe = TradingService.subscribeToTicks((ticks) => {
      if (!Array.isArray(ticks)) return;

      setChain(prev => {
        let changed = false;
        const next = {
          CE: { ...prev.CE },
          PE: { ...prev.PE }
        };

        ticks.forEach(tick => {
          const token = Number(tick.instrument_token);
          const ref = tokenToContractRef.current[token];
          const ltp = Number(tick.last_price);
          if (!ref || !Number.isFinite(ltp)) return;

          const existing = next[ref.optionType][ref.strike];
          if (!existing) return;

          next[ref.optionType][ref.strike] = {
            ...existing,
            ltp,
            lastUpdated: Date.now(),
            source: 'tick'
          };
          changed = true;
        });

        return changed ? next : prev;
      });

      if (ticks.length) setLastLiveAt(Date.now());
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, [chainTokens]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    const tokens = chainTokens;
    if (!tokens.length) return undefined;

    const pollQuotes = async () => {
      try {
        const quotes = await TradingService.getQuotes(tokens);
        setChain(prev => {
          let changed = false;
          const next = {
            CE: { ...prev.CE },
            PE: { ...prev.PE }
          };

          tokens.forEach(token => {
            const ref = tokenToContractRef.current[token];
            const quote = normalizeQuote(quotes?.[token] || quotes?.[String(token)]);
            const ltp = getQuoteLastPrice(quote);
            if (!ref || !Number.isFinite(ltp)) return;

            const existing = next[ref.optionType][ref.strike];
            if (!existing) return;

            next[ref.optionType][ref.strike] = {
              ...existing,
              ltp,
              lastUpdated: Date.now(),
              source: 'poll'
            };
            changed = true;
          });

          return changed ? next : prev;
        });
        setLastLiveAt(Date.now());
      } catch (e) {
        console.warn('Risk quote polling failed', e.message);
      }
    };

    pollQuotes();
    pollRef.current = setInterval(pollQuotes, 3000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [chainTokens]);

  const debitSpreads = useMemo(() => ({
    CE: pickTargetDebitSpreads(calculateDebitSpreads('CE', chain.CE)),
    PE: pickTargetDebitSpreads(calculateDebitSpreads('PE', chain.PE))
  }), [chain]);

  return (
    <div className="risk-manager">
      <div className="risk-header">
        <div>
          <h1><ShieldCheckIcon /> Risk Manager</h1>
          <p>Live debit-spread finder for CE and PE structures around the analyzed index midpoint.</p>
        </div>
        <div className={`risk-live-pill ${lastLiveAt ? 'active' : ''}`}>
          <span />
          {lastLiveAt ? `Live ${new Date(lastLiveAt).toLocaleTimeString()}` : 'Waiting for quotes'}
        </div>
      </div>

      <section className="risk-control-panel">
        <div className="risk-field instrument-field">
          <label>Instrument</label>
          {selectedInstrument ? (
            <button className="risk-instrument-button selected" onClick={() => setShowInstrumentSearch(true)}>
              <span>{selectedInstrument.tradingsymbol}</span>
              <small>{selectedInstrument.exchange}</small>
            </button>
          ) : (
            <button className="risk-instrument-button" onClick={() => setShowInstrumentSearch(true)}>
              <MagnifyingGlassIcon />
              Choose Instrument
            </button>
          )}
        </div>

        <div className="risk-quick-buttons">
          <button onClick={() => handleInstrumentSelect(niftyInstrument())}>NIFTY 50</button>
          <button onClick={() => handleInstrumentSelect(bankNiftyInstrument())}>BANK NIFTY</button>
        </div>

        <div className="risk-field">
          <label>From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>

        <div className="risk-field">
          <label>To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>

        <div className="risk-field">
          <label>Expiry</label>
          <select value={optionExpiry} onChange={e => setOptionExpiry(e.target.value)}>
            <option value="current">Current Week</option>
            <option value="next">Next Week</option>
          </select>
        </div>

        <button className="risk-analyze-button" onClick={handleAnalyze} disabled={loading}>
          {loading ? <ArrowPathIcon className="spin" /> : <ChartBarIcon />}
          {loading ? 'Analyzing' : 'Analyze Risk'}
        </button>
      </section>

      {error && <div className="risk-error">{error}</div>}

      <section className="risk-summary-strip">
        {[
          ['Index High', high, getStrike(high, 'CE'), getStrike(high, 'PE')],
          ['Index Mid', mid, getStrike(mid, 'CE'), getStrike(mid, 'PE')],
          ['Index Low', low, getStrike(low, 'CE'), getStrike(low, 'PE')]
        ].map(([label, value, ceStrike, peStrike]) => (
          <div className="risk-summary-card" key={label}>
            <span>{label}</span>
            <strong>{formatRupee(value)}</strong>
            <div>
              <small>CE {ceStrike || '--'}</small>
              <small>PE {peStrike || '--'}</small>
            </div>
          </div>
        ))}
        <div className="risk-summary-card">
          <span>Expiry</span>
          <strong>{expiryDisplay}</strong>
          <div><small>{chainLoading ? 'Resolving chain' : `${countContracts(chain)} contracts`}</small></div>
        </div>
      </section>

      <section className="risk-spread-board">
        <div className="risk-board-header">
          <div>
            <h2>Debit Spread Matrix</h2>
            <p>Closest live spreads for 1:1, 1:1.5 and 1:2 reward-to-risk.</p>
          </div>
        </div>

        <div className="spread-panels">
          {OPTION_TYPES.map(optionType => (
            <SpreadPanel
              key={optionType}
              optionType={optionType}
              spreads={debitSpreads[optionType]}
              loading={chainLoading}
            />
          ))}
        </div>
      </section>

      <section className="risk-chain">
        <div className="risk-board-header">
          <div>
            <h2>Live Option Chain</h2>
            <p>Resolved strikes around the index midpoint. LTP updates from ticks and quote polling.</p>
          </div>
        </div>
        <div className="risk-chain-table-wrap">
          <table className="risk-chain-table">
            <thead>
              <tr>
                <th>CE Symbol</th>
                <th>CE LTP</th>
                <th>Strike</th>
                <th>PE LTP</th>
                <th>PE Symbol</th>
              </tr>
            </thead>
            <tbody>
              {strikes.map(strike => {
                const ce = chain.CE[strike];
                const pe = chain.PE[strike];
                return (
                  <tr key={strike} className={strike === getStrike(mid, 'CE') || strike === getStrike(mid, 'PE') ? 'atm-row' : ''}>
                    <td>{ce?.symbol || '--'}</td>
                    <td>{formatLtp(ce)}</td>
                    <td className="strike-cell">{strike}</td>
                    <td>{formatLtp(pe)}</td>
                    <td>{pe?.symbol || '--'}</td>
                  </tr>
                );
              })}
              {!strikes.length && (
                <tr>
                  <td colSpan="5">Analyze an index range to load the option chain.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showInstrumentSearch && (
        <InstrumentSearch
          onSelectInstrument={handleInstrumentSelect}
          onClose={() => setShowInstrumentSearch(false)}
        />
      )}
    </div>
  );

  function getStrike(value, type) {
    if (!isOptionEligibleInstrument || value == null) return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return type === 'PE'
      ? Math.ceil(numeric / strikeStep) * strikeStep
      : Math.floor(numeric / strikeStep) * strikeStep;
  }
};

const SpreadPanel = ({ optionType, spreads, loading }) => (
  <div className={`spread-panel ${optionType.toLowerCase()}`}>
    <div className="spread-panel-title">
      <h3>{optionType} Debit Spreads</h3>
      <span>{optionType === 'CE' ? 'Buy lower strike, sell higher strike' : 'Buy higher strike, sell lower strike'}</span>
    </div>
    <div className="spread-row-grid spread-head">
      <span>Target</span>
      <span>Buy</span>
      <span>Sell</span>
      <span>Debit</span>
      <span>Max Profit</span>
      <span>Live R:R</span>
    </div>
    {spreads.map(spread => (
      spread.buyStrike ? (
        <div className="spread-row-grid" key={`${optionType}-${spread.target}`}>
          <span className="target-badge">{spread.target}</span>
          <span>{spread.buyStrike}<small>{formatRupee(spread.buyLtp)}</small></span>
          <span>{spread.sellStrike}<small>{formatRupee(spread.sellLtp)}</small></span>
          <span>{formatRupee(spread.maxRisk)}</span>
          <span>{formatRupee(spread.maxReward)}</span>
          <span className="rr-value">1:{spread.rewardRisk.toFixed(2)}</span>
        </div>
      ) : (
        <div className="spread-empty-row" key={`${optionType}-${spread.target}`}>
          <span className="target-badge">{spread.target}</span>
          {loading ? 'Resolving live strikes...' : 'No live spread found yet'}
        </div>
      )
    ))}
  </div>
);

function getDefaultDates() {
  const today = new Date();
  const to = new Date(today);
  to.setDate(today.getDate() - 6);
  const from = new Date(to);
  from.setDate(to.getDate() - 6);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0]
  };
}

function niftyInstrument() {
  return { tradingsymbol: 'NIFTY 50', name: 'Nifty 50', exchange: 'NSE', instrument_token: '256265' };
}

function bankNiftyInstrument() {
  return { tradingsymbol: 'BANK NIFTY', name: 'Bank Nifty', exchange: 'NSE', instrument_token: '260105' };
}

function normalizeHighLow(data) {
  if (!data) return { high: null, low: null };
  const high = data.high ?? data.highest ?? data.max ?? null;
  const low = data.low ?? data.lowest ?? data.min ?? null;
  return { high, low };
}

function normalizeInstrumentKey(value = '') {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isOptionEligibleSymbol(symbol, name) {
  const keys = [symbol, name].map(normalizeInstrumentKey);
  return keys.some(key => key === 'NIFTY' || key === 'NIFTY50' || key === 'BANKNIFTY');
}

function baseSymbolForUnderlying(sym) {
  const key = normalizeInstrumentKey(sym);
  if (key === 'BANKNIFTY') return 'BANKNIFTY';
  if (key === 'NIFTY' || key === 'NIFTY50') return 'NIFTY';
  return null;
}

function getSelectedExpiryDate(expiryChoice) {
  const today = new Date();
  const current = new Date(today);
  if (current.getDay() > 2 || (current.getDay() === 2 && current.getHours() >= 16)) {
    while (current.getDay() !== 2) current.setDate(current.getDate() + 1);
  } else if (current.getDay() < 2) {
    while (current.getDay() !== 2) current.setDate(current.getDate() + 1);
  }
  if (expiryChoice === 'next') current.setDate(current.getDate() + 7);
  return current;
}

function buildOptionSymbolCandidates(underlyingSymbol, strike, type, expiryChoice) {
  const base = baseSymbolForUnderlying(underlyingSymbol);
  if (!base || !strike || !type) return [];

  const expiryDate = getSelectedExpiryDate(expiryChoice);
  const strikeStr = String(strike).replace(/\.\d+/, '');
  const dd = String(expiryDate.getDate()).padStart(2, '0');
  const mmm = expiryDate.toLocaleString('en-GB', { month: 'short' }).toUpperCase();
  const yy = String(expiryDate.getFullYear()).slice(-2);
  const monthNum = String(expiryDate.getMonth() + 1).padStart(2, '0');
  const kiteMonthCode = expiryDate.getMonth() + 1 <= 9
    ? String(expiryDate.getMonth() + 1)
    : ({ 10: 'O', 11: 'N', 12: 'D' }[expiryDate.getMonth() + 1]);

  const candidates = [
    `${base}${yy}${kiteMonthCode}${dd}${strikeStr}${type}`,
    `${base}${dd}${mmm}${yy}${strikeStr}${type}`,
    `${base}${dd}${mmm}${strikeStr}${type}`,
    `${base}${yy}${strikeStr}${type}`,
    `${base}${mmm}${yy}${strikeStr}${type}`,
    `${base}${dd}${monthNum}${yy}${strikeStr}${type}`
  ];

  if (mmm === 'SEP') {
    candidates.push(
      `${base}${dd}SEPT${yy}${strikeStr}${type}`,
      `${base}${dd}SEPT${strikeStr}${type}`,
      `${base}SEPT${yy}${strikeStr}${type}`
    );
  }

  return Array.from(new Set(candidates));
}

async function resolveContract(underlyingSymbol, strike, optionType, optionExpiry) {
  const candidates = buildOptionSymbolCandidates(underlyingSymbol, strike, optionType, optionExpiry);
  for (const symbol of candidates) {
    try {
      const instruments = await TradingService.getInstrumentsBySymbol(symbol);
      if (Array.isArray(instruments) && instruments.length) {
        const instrument = instruments[0];
        return {
          strike,
          optionType,
          symbol: instrument.tradingsymbol || symbol,
          token: instrument.instrument_token || instrument.token
        };
      }
    } catch (e) {
      console.warn(`Risk contract resolution failed for ${symbol}`, e.message);
    }
  }
  return null;
}

function getNearbyStrikes(value, step, count) {
  if (!Number.isFinite(Number(value))) return [];
  const base = Math.round(Number(value) / step) * step;
  const strikes = [];
  for (let i = -count; i <= count; i += 1) {
    const strike = base + i * step;
    if (strike > 0) strikes.push(strike);
  }
  return strikes;
}

function normalizeQuote(quote) {
  return quote?.quote || quote || null;
}

function getQuoteLastPrice(quote) {
  const price = Number(quote?.last_price ?? quote?.ltp ?? quote?.lastPrice);
  return Number.isFinite(price) ? price : null;
}

function calculateDebitSpreads(optionType, quotesByStrike) {
  const sortedStrikes = Object.keys(quotesByStrike)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const spreads = [];

  sortedStrikes.forEach((buyStrike, buyIndex) => {
    sortedStrikes.forEach((sellStrike, sellIndex) => {
      const validDirection = optionType === 'CE' ? sellIndex > buyIndex : sellIndex < buyIndex;
      if (!validDirection) return;

      const buyLtp = Number(quotesByStrike[buyStrike]?.ltp);
      const sellLtp = Number(quotesByStrike[sellStrike]?.ltp);
      const width = Math.abs(sellStrike - buyStrike);
      const maxRisk = buyLtp - sellLtp;
      const maxReward = width - maxRisk;
      if (!Number.isFinite(maxRisk) || maxRisk <= 0 || maxReward <= 0) return;

      spreads.push({
        optionType,
        buyStrike,
        sellStrike,
        buyLtp,
        sellLtp,
        maxRisk,
        maxReward,
        rewardRisk: maxReward / maxRisk
      });
    });
  });

  return spreads;
}

function pickTargetDebitSpreads(spreads) {
  return TARGETS.map(target => {
    const match = spreads.reduce((best, spread) => {
      const distance = Math.abs(spread.rewardRisk - target.value);
      if (!best || distance < best.distance) return { spread, distance };
      return best;
    }, null);

    return {
      target: target.label,
      ...(match?.spread || {})
    };
  });
}

function countContracts(chain) {
  return Object.keys(chain.CE).length + Object.keys(chain.PE).length;
}

function formatRupee(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '--';
  return `₹${numberValue.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  })}`;
}

function formatLtp(contract) {
  if (!contract || !Number.isFinite(Number(contract.ltp))) return '--';
  return `${formatRupee(contract.ltp)} ${contract.source === 'tick' ? 'live' : ''}`.trim();
}

export default RiskManager;

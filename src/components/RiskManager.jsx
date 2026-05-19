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
  const [chainStrikes, setChainStrikes] = useState([]);
  const [spreadMode, setSpreadMode] = useState('debit');
  const [ticket, setTicket] = useState(null);
  const [lots, setLots] = useState(1);
  const [productType, setProductType] = useState('NRML');
  const [confirmOrder, setConfirmOrder] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placementSteps, setPlacementSteps] = useState([]);
  const [lastLiveAt, setLastLiveAt] = useState(null);
  const tokenToContractRef = useRef({});
  const pollRef = useRef(null);

  const { high, low } = normalizeHighLow(highLowData);
  const mid = Number.isFinite(Number(high)) && Number.isFinite(Number(low))
    ? (Number(high) + Number(low)) / 2
    : null;
  const strikeStep = 50;
  const previewStrikes = useMemo(() => getNearbyStrikes(mid, strikeStep, 8), [mid]);
  const strikes = chainStrikes.length ? chainStrikes : previewStrikes;
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
    setChainStrikes([]);
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
      const { high: analyzedHigh, low: analyzedLow } = normalizeHighLow(data);
      const analyzedMid = Number.isFinite(Number(analyzedHigh)) && Number.isFinite(Number(analyzedLow))
        ? (Number(analyzedHigh) + Number(analyzedLow)) / 2
        : null;
      setHighLowData(data);
      setChainStrikes(getNearbyStrikes(analyzedMid, strikeStep, 8));
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
    CE: pickTargetSpreads(calculateSpreadMatrix(spreadMode, 'CE', chain.CE)),
    PE: pickTargetSpreads(calculateSpreadMatrix(spreadMode, 'PE', chain.PE))
  }), [chain, spreadMode]);

  const handleOpenTicket = (spread) => {
    setTicket(spread);
    setLots(1);
    setConfirmOrder(false);
    setPlacementSteps([]);
  };

  const handlePlaceSpread = async () => {
    if (!ticket || placing || !confirmOrder) return;

    const quantity = getSpreadQuantity(ticket, lots);
    const buyOrder = buildOrderParams(ticket.buyContract, 'BUY', quantity, productType);
    const nextSteps = [];

    setPlacing(true);
    setPlacementSteps([{ label: 'Buy leg', status: 'placing', message: `${buyOrder.tradingsymbol} ${quantity}` }]);

    try {
      const buyResult = await TradingService.placeOrder(buyOrder);
      const buySnapshot = await fetchOrderSnapshot(getOrderId(buyResult));
      const buyStepStatus = getOrderStepStatus(buySnapshot);
      const buyFilledQuantity = getFilledQuantity(buySnapshot, quantity);
      nextSteps.push({
        label: 'Buy leg',
        status: buyStepStatus,
        message: formatOrderStepMessage(buyResult, buySnapshot, quantity)
      });

      if (buyStepStatus === 'failed') {
        nextSteps.push({
          label: 'Sell leg',
          status: 'blocked',
          message: 'Sell leg was not sent because the buy leg did not confirm.'
        });
        setPlacementSteps(nextSteps);
        return;
      }

      const sellQuantity = buyFilledQuantity > 0 ? buyFilledQuantity : quantity;
      const sellOrder = buildOrderParams(ticket.sellContract, 'SELL', sellQuantity, productType);
      setPlacementSteps([...nextSteps, {
        label: 'Sell leg',
        status: 'placing',
        message: `${sellOrder.tradingsymbol} ${sellQuantity}`
      }]);

      try {
        const sellResult = await TradingService.placeOrder(sellOrder);
        const sellSnapshot = await fetchOrderSnapshot(getOrderId(sellResult));
        nextSteps.push({
          label: 'Sell leg',
          status: getOrderStepStatus(sellSnapshot),
          message: formatOrderStepMessage(sellResult, sellSnapshot, sellQuantity)
        });
        setPlacementSteps(nextSteps);
      } catch (sellError) {
        nextSteps.push({
          label: 'Sell leg',
          status: 'failed',
          message: sellError.message || 'Sell leg failed after buy leg was submitted'
        });
        setPlacementSteps(nextSteps);
      }
    } catch (buyError) {
      setPlacementSteps([{
        label: 'Buy leg',
        status: 'failed',
        message: buyError.message || 'Buy leg failed. Sell leg was not sent.'
      }]);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="risk-manager">
      <div className="risk-header">
        <div>
          <h1><ShieldCheckIcon /> Risk Manager</h1>
          <p>Live debit and credit spread finder for CE and PE structures around the analyzed index midpoint.</p>
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
            <h2>{spreadMode === 'debit' ? 'Debit' : 'Credit'} Spread Matrix</h2>
            <p>Closest live spreads for 1:1, 1:1.5 and 1:2 reward-to-risk.</p>
          </div>
          <div className="spread-mode-toggle" role="group" aria-label="Spread type">
            {['debit', 'credit'].map(mode => (
              <button
                key={mode}
                type="button"
                className={spreadMode === mode ? 'active' : ''}
                onClick={() => setSpreadMode(mode)}
              >
                {mode === 'debit' ? 'Debit' : 'Credit'}
              </button>
            ))}
          </div>
        </div>

        <div className="spread-panels">
          {OPTION_TYPES.map(optionType => (
            <SpreadPanel
              key={optionType}
              optionType={optionType}
              spreads={debitSpreads[optionType]}
              mode={spreadMode}
              loading={chainLoading}
              onTrade={handleOpenTicket}
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

      {ticket && (
        <TradeTicket
          spread={ticket}
          lots={lots}
          setLots={setLots}
          productType={productType}
          setProductType={setProductType}
          confirmOrder={confirmOrder}
          setConfirmOrder={setConfirmOrder}
          placing={placing}
          placementSteps={placementSteps}
          onClose={() => {
            if (!placing) setTicket(null);
          }}
          onPlace={handlePlaceSpread}
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

const SpreadPanel = ({ optionType, spreads, mode, loading, onTrade }) => (
  <div className={`spread-panel ${optionType.toLowerCase()}`}>
    <div className="spread-panel-title">
      <h3>{optionType} {mode === 'debit' ? 'Debit' : 'Credit'} Spreads</h3>
      <span>{getSpreadDescription(mode, optionType)}</span>
    </div>
    <div className="spread-row-grid spread-head">
      <span>Target</span>
      <span>Buy</span>
      <span>Sell</span>
      <span>{mode === 'debit' ? 'Debit' : 'Credit'}</span>
      <span>Max Profit</span>
      <span>Live R:R</span>
      <span>Action</span>
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
          <button className="spread-trade-btn" type="button" onClick={() => onTrade(spread)}>
            Trade
          </button>
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

const TradeTicket = ({
  spread,
  lots,
  setLots,
  productType,
  setProductType,
  confirmOrder,
  setConfirmOrder,
  placing,
  placementSteps,
  onClose,
  onPlace
}) => {
  const quantity = getSpreadQuantity(spread, lots);
  const premiumLabel = spread.mode === 'credit' ? 'Estimated credit' : 'Estimated debit';

  return (
    <div className="ticket-backdrop" role="presentation">
      <div className="trade-ticket" role="dialog" aria-modal="true" aria-label="Confirm spread trade">
        <div className="ticket-header">
          <div>
            <span className="ticket-kicker">{spread.optionType} {spread.mode} spread</span>
            <h3>{spread.target} Reward-to-Risk</h3>
          </div>
          <button type="button" onClick={onClose} disabled={placing}>Close</button>
        </div>

        <div className="ticket-leg-grid">
          <LegCard title="Buy leg" contract={spread.buyContract} action="BUY" />
          <LegCard title="Sell leg" contract={spread.sellContract} action="SELL" />
        </div>

        <div className="ticket-controls">
          <label>
            Lots
            <input
              type="number"
              min="1"
              step="1"
              value={lots}
              onChange={e => setLots(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label>
            Quantity
            <input value={quantity} readOnly />
          </label>
          <label>
            Product
            <select value={productType} onChange={e => setProductType(e.target.value)}>
              <option value="NRML">NRML</option>
              <option value="MIS">MIS</option>
            </select>
          </label>
          <label>
            Order type
            <input value="MARKET" readOnly />
          </label>
        </div>

        <div className="ticket-risk-grid">
          <div><span>{premiumLabel}</span><strong>{formatRupee(spread.netPremium)}</strong></div>
          <div><span>Max risk</span><strong>{formatRupee(spread.maxRisk)}</strong></div>
          <div><span>Max reward</span><strong>{formatRupee(spread.maxReward)}</strong></div>
          <div><span>Live R:R</span><strong>1:{spread.rewardRisk.toFixed(2)}</strong></div>
        </div>

        <label className="ticket-confirm">
          <input
            type="checkbox"
            checked={confirmOrder}
            onChange={e => setConfirmOrder(e.target.checked)}
            disabled={placing}
          />
          I understand this will place live broker orders. Place buy leg first, then sell leg.
        </label>

        {!!placementSteps.length && (
          <div className="ticket-steps">
            {placementSteps.map(step => (
              <div className={`ticket-step ${step.status}`} key={step.label}>
                <span>{step.label}</span>
                <strong>{step.status}</strong>
                <small>{step.message}</small>
              </div>
            ))}
          </div>
        )}

        <div className="ticket-actions">
          <button type="button" className="ticket-secondary" onClick={onClose} disabled={placing}>Cancel</button>
          <button type="button" className="ticket-primary" onClick={onPlace} disabled={!confirmOrder || placing}>
            {placing ? 'Placing orders...' : 'Place spread'}
          </button>
        </div>
      </div>
    </div>
  );
};

const LegCard = ({ title, contract, action }) => (
  <div className={`ticket-leg ${action.toLowerCase()}`}>
    <span>{title}</span>
    <h4>{contract?.symbol || '--'}</h4>
    <div>
      <small>{action}</small>
      <small>Strike {contract?.strike || '--'}</small>
      <small>LTP {formatRupee(contract?.ltp)}</small>
    </div>
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
          token: instrument.instrument_token || instrument.token,
          exchange: instrument.exchange || 'NFO',
          lotSize: Number(instrument.lot_size || instrument.lotSize || instrument.lotsize || 1) || 1
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

function calculateSpreadMatrix(mode, optionType, quotesByStrike) {
  const sortedStrikes = Object.keys(quotesByStrike)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const spreads = [];

  sortedStrikes.forEach((buyStrike, buyIndex) => {
    sortedStrikes.forEach((sellStrike, sellIndex) => {
      const validDirection = getSpreadDirection(mode, optionType, buyIndex, sellIndex);
      if (!validDirection) return;

      const buyContract = quotesByStrike[buyStrike];
      const sellContract = quotesByStrike[sellStrike];
      const buyLtp = Number(buyContract?.ltp);
      const sellLtp = Number(sellContract?.ltp);
      const width = Math.abs(sellStrike - buyStrike);
      const netPremium = mode === 'credit' ? sellLtp - buyLtp : buyLtp - sellLtp;
      const maxRisk = mode === 'credit' ? width - netPremium : netPremium;
      const maxReward = mode === 'credit' ? netPremium : width - netPremium;
      if (!Number.isFinite(maxRisk) || maxRisk <= 0 || maxReward <= 0) return;

      spreads.push({
        mode,
        optionType,
        buyStrike,
        sellStrike,
        buyContract,
        sellContract,
        buyLtp,
        sellLtp,
        netPremium,
        maxRisk,
        maxReward,
        rewardRisk: maxReward / maxRisk
      });
    });
  });

  return spreads;
}

function getSpreadDirection(mode, optionType, buyIndex, sellIndex) {
  if (mode === 'debit') {
    return optionType === 'CE' ? sellIndex > buyIndex : sellIndex < buyIndex;
  }

  return optionType === 'CE' ? buyIndex > sellIndex : buyIndex < sellIndex;
}

function pickTargetSpreads(spreads) {
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

function getSpreadDescription(mode, optionType) {
  if (mode === 'debit') {
    return optionType === 'CE'
      ? 'Buy lower strike, sell higher strike'
      : 'Buy higher strike, sell lower strike';
  }

  return optionType === 'CE'
    ? 'Buy higher hedge, sell lower strike'
    : 'Buy lower hedge, sell higher strike';
}

function getSpreadQuantity(spread, lots) {
  const lotSize = Math.max(
    Number(spread?.buyContract?.lotSize) || 1,
    Number(spread?.sellContract?.lotSize) || 1
  );
  return Math.max(1, Number(lots) || 1) * lotSize;
}

function buildOrderParams(contract, transactionType, quantity, productType) {
  return {
    exchange: contract.exchange || 'NFO',
    tradingsymbol: contract.symbol,
    transaction_type: transactionType,
    quantity,
    product: productType,
    order_type: 'MARKET',
    validity: 'DAY'
  };
}

function getOrderId(orderResult) {
  return orderResult?.order_id || orderResult?.orderId || orderResult?.id || null;
}

async function fetchOrderSnapshot(orderId) {
  if (!orderId) return null;
  await sleep(900);
  try {
    const orders = await TradingService.getOrders();
    return Array.isArray(orders)
      ? orders.find(order => String(order.order_id) === String(orderId))
      : null;
  } catch (e) {
    console.warn('Unable to verify order status', e.message);
    return null;
  }
}

function getOrderStepStatus(order) {
  const status = String(order?.status || '').toUpperCase();
  if (['REJECTED', 'CANCELLED'].includes(status)) return 'failed';

  const filled = Number(order?.filled_quantity || 0);
  const quantity = Number(order?.quantity || 0);
  if (quantity > 0 && filled > 0 && filled < quantity) return 'partial';

  return 'placed';
}

function getFilledQuantity(order, fallbackQuantity) {
  const filled = Number(order?.filled_quantity);
  if (Number.isFinite(filled) && filled > 0) return filled;
  return fallbackQuantity;
}

function formatOrderStepMessage(orderResult, order, requestedQuantity) {
  const orderId = getOrderId(orderResult) || order?.order_id || 'submitted';
  const status = order?.status ? `Status ${order.status}` : 'Submitted';
  const filled = Number(order?.filled_quantity);
  const quantity = Number(order?.quantity || requestedQuantity);
  const fillText = Number.isFinite(filled) && quantity
    ? `, filled ${filled}/${quantity}`
    : `, quantity ${requestedQuantity}`;
  const message = order?.status_message ? `, ${order.status_message}` : '';
  return `Order ${orderId}: ${status}${fillText}${message}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

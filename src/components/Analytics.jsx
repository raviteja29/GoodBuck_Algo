import React, { useState } from 'react';
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
                    <span className="strike-label">PE Strike</span>
                    <span className="strike-value">₹{peStrike}</span>
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
                      <span className="strike-label">CE Strike</span>
                      <span className="strike-value">₹{ceStrike}</span>
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
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

  return (
    <div className="analytics-section">
      {/* Header */}
      <div className="analytics-header">
        <div className="header-content">
          <h1 className="section-title">
            <ChartBarIcon className="title-icon" />
            Historical Analysis
          </h1>
          <p className="section-subtitle">
            Analyze high and low prices for selected instruments within date ranges
          </p>
        </div>
      </div>

      {/* Configuration Panel */}
      <div className="analysis-config">
        <div className="config-card">
          <h3 className="config-title">Analysis Configuration</h3>
          
          {/* Instrument Selection */}
          <div className="config-row">
            <div className="config-item">
              <label className="config-label">
                <MagnifyingGlassIcon className="label-icon" />
                Select Instrument
              </label>
              <div className="instrument-selector">
                {selectedInstrument ? (
                  <div className="selected-instrument">
                    <div className="instrument-info">
                      <span className="instrument-symbol">{selectedInstrument.tradingsymbol}</span>
                      <span className="instrument-name">{selectedInstrument.name}</span>
                      <span className="instrument-exchange">{selectedInstrument.exchange}</span>
                    </div>
                    <button 
                      className="change-instrument-btn"
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
                    Select Instrument
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Date Range Selection */}
          <div className="config-row">
            <div className="config-item">
              <label className="config-label">
                <CalendarDaysIcon className="label-icon" />
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="date-input"
                max={(() => {
                  const maxDate = new Date();
                  maxDate.setDate(maxDate.getDate() - 2); // At least 2 days ago
                  return maxDate.toISOString().split('T')[0];
                })()} 
              />
            </div>
            
            <div className="config-item">
              <label className="config-label">
                <CalendarDaysIcon className="label-icon" />
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="date-input"
                min={fromDate} // Can't be earlier than from date
                max={(() => {
                  const maxDate = new Date();
                  maxDate.setDate(maxDate.getDate() - 2); // At least 2 days ago
                  return maxDate.toISOString().split('T')[0];
                })()} 
              />
            </div>
          </div>

          {/* Duration Info */}
          {duration && (
            <div className="config-row">
              <div className="duration-info">
                <ClockIcon className="duration-icon" />
                <span>Analysis period: {duration} days</span>
              </div>
            </div>
          )}

          {/* Date Selection Help */}
          <div className="config-row">
            <div className="info-message">
              <InformationCircleIcon className="info-icon" />
              <div className="info-text">
                <p><strong>Date Selection Tips:</strong></p>
                <ul>
                  <li>Select dates at least 2 days ago for data availability</li>
                  <li>Market hours will be applied automatically (9:15 AM to 3:30 PM)</li>
                  <li>Weekends and holidays will be automatically ignored</li>
                  <li>Keep date range within 10 days for optimal performance</li>
                  <li>Analysis will show high/low for available trading days only</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="config-actions">
            <button 
              className="action-btn secondary"
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

      {/* Results Display */}
      {highLowData && (
        <div className="results-section">
          <h3 className="results-title">Analysis Results</h3>
          
          <div className="results-grid">
            {/* High Price Card */}
            <div className="result-card high-card">
              <div className="card-header">
                <h4 className="card-title">Highest Price</h4>
                <ArrowTrendingUpIcon className="card-icon high-icon" />
              </div>
              <div className="card-value high-value">
                ₹{highLowData.high.toLocaleString()}
              </div>
              <div className="card-subtitle">
                Period High ({formatDate(highLowData.dateRange.from)} to {formatDate(highLowData.dateRange.to)})
              </div>
            </div>

            {/* Low Price Card */}
            <div className="result-card low-card">
              <div className="card-header">
                <h4 className="card-title">Lowest Price</h4>
                <ArrowTrendingDownIcon className="card-icon low-icon" />
              </div>
              <div className="card-value low-value">
                ₹{highLowData.low.toLocaleString()}
              </div>
              <div className="card-subtitle">
                Period Low ({formatDate(highLowData.dateRange.from)} to {formatDate(highLowData.dateRange.to)})
              </div>
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

      {/* Loading State */}
      {loading && (
        <div className="loading-section">
          <div className="loading-spinner"></div>
          <p>Analyzing historical data...</p>
        </div>
      )}

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
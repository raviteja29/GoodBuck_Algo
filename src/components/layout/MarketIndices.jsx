import React, { useState, useEffect, useRef } from 'react';
import { ChartPieIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, SparklesIcon } from '@heroicons/react/24/outline';
import tradingService from '../../services/TradingService';
import './MarketIndices.css';

const MarketIndices = ({ className = "" }) => {
  const [indices, setIndices] = useState({
    nifty: { value: '—', change: '0.00', changePercent: '0.00%' },
    banknifty: { value: '—', change: '0.00', changePercent: '0.00%' },
    indiavix: { value: '—', change: '0.00', changePercent: '0.00%' }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedIndex, setUpdatedIndex] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const timeoutRef = useRef(null);
  const lastTickAtRef = useRef(0);
  const connectionStatusRef = useRef(tradingService.getConnectionStatus());
  const previousValues = useRef({});

  // Market indices token mapping
  const indicesTokens = {
    256265: 'nifty',    // NIFTY 50
    260105: 'banknifty', // BANK NIFTY  
    264969: 'indiavix'   // INDIA VIX
  };

  useEffect(() => {
    // Store initial values
    previousValues.current = {
      nifty: indices.nifty.value,
      banknifty: indices.banknifty.value,
      indiavix: indices.indiavix.value
    };

    // Initial data fetch
    const fetchIndices = async (silent = false) => {
      try {
        console.log('[MarketIndices] Initial fetch of market indices...');
        const data = await tradingService.getMarketIndices();
        console.log('[MarketIndices] Received initial data:', data);
        setIndices(data);
        setLoading(false);
        setError(null);
        setLastUpdated(new Date());
        
        // Update previous values
        Object.keys(data).forEach(key => {
          previousValues.current[key] = data[key].value;
        });
      } catch (err) {
        console.error('Error fetching initial market indices:', err);
        if (!silent) setError('Unable to fetch market data. Please check your connection and login status.');
        setLoading(false);
      }
    };

    fetchIndices();

    const unsubscribeStatus = tradingService.onConnectionStatusChange(status => {
      connectionStatusRef.current = status;
    });

    // Subscribe to real-time market data for instant updates
    console.log('[MarketIndices] Setting up real-time subscriptions...');
    
    // Subscribe to the index tokens for real-time updates
    const tokens = Object.keys(indicesTokens).map(Number);
    tradingService.subscribeToInstruments(tokens);

    // Subscribe to real-time ticks
    const unsubscribe = tradingService.subscribeToTicks(ticks => {
      console.log('[MarketIndices] Received real-time ticks:', ticks.length);
      
      if (!ticks || !Array.isArray(ticks) || ticks.length === 0) return;

      let hasUpdates = false;
      const updates = {};

      ticks.forEach(tick => {
        const token = Number(tick?.instrument_token);
        if (!Number.isFinite(token)) return;
        
        const indexKey = indicesTokens[token];
        if (!indexKey) return;

        // Calculate change percentage
        const currentPrice = Number(tick.last_price);
        if (!Number.isFinite(currentPrice)) return;
        const previousClose = tick.ohlc?.close || currentPrice;
        const change = currentPrice - previousClose;
        const changePercent = previousClose !== 0 ? (change / previousClose * 100) : 0;

        const newData = {
          value: currentPrice.toString(),
          change: change.toFixed(2),
          changePercent: `${changePercent > 0 ? '+' : ''}${changePercent.toFixed(2)}%`
        };

        // Check if this is an actual update
        if (newData.value !== previousValues.current[indexKey]) {
          updates[indexKey] = newData;
          hasUpdates = true;
          
          // Set updated indicator
          setUpdatedIndex(indexKey);
          
          // Clear previous timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          
          // Clear updated indicator after 1 second
          timeoutRef.current = setTimeout(() => {
            setUpdatedIndex(null);
          }, 1000);
          
          // Update previous values
          previousValues.current[indexKey] = newData.value;
        }
      });

      if (hasUpdates) {
        lastTickAtRef.current = Date.now();
        console.log('[MarketIndices] Applying real-time updates:', updates);
        setIndices(prev => ({ ...prev, ...updates }));
        setLastUpdated(new Date());
        setError(null);
      }
    });

    const pollInterval = setInterval(() => {
      const tickIsStale = !lastTickAtRef.current || Date.now() - lastTickAtRef.current > 5000;
      if (connectionStatusRef.current !== 'connected' || tickIsStale) {
        fetchIndices(true);
      }
    }, 3000);

    return () => {
      console.log('[MarketIndices] Cleaning up subscriptions...');
      unsubscribe();
      unsubscribeStatus();
      clearInterval(pollInterval);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const formatValue = (value) => {
    if (value === '—' || isNaN(parseFloat(value))) return value;
    
    return parseFloat(value).toLocaleString('en-IN', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2
    });
  };

  // Mini trend chart component
  const MiniTrendChart = ({ isPositive, changePercent }) => {
    const points = isPositive ? "2,12 8,4 14,8 20,2" : "2,2 8,8 14,4 20,12";
    const color = isPositive ? "#00ff88" : "#ff4444";
    
    return (
      <svg width="24" height="16" className="mini-chart">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy={isPositive ? "2" : "12"} r="1.5" fill={color} />
      </svg>
    );
  };

  // Performance indicator component
  const PerformanceIndicator = ({ changePercent }) => {
    const change = parseFloat(changePercent);
    const isPositive = change > 0;
    const intensity = Math.min(Math.abs(change), 3) / 3; // Cap at 3% for full intensity
    
    return (
      <div className={`performance-indicator ${isPositive ? 'positive' : 'negative'}`}>
        <div 
          className="performance-bar" 
          style={{ 
            width: `${intensity * 100}%`,
            background: isPositive 
              ? `linear-gradient(90deg, rgba(0,255,136,0.3) 0%, rgba(0,255,136,${0.1 + intensity * 0.4}) 100%)`
              : `linear-gradient(90deg, rgba(255,68,68,0.3) 0%, rgba(255,68,68,${0.1 + intensity * 0.4}) 100%)`
          }}
        />
      </div>
    );
  };

  const renderIndices = () => {
    if (loading) {
      return <div className="loading-state">Loading market data...</div>;
    }

    if (error) {
      return <div className="loading-state">{error}</div>;
    }

    return (
      <div className="market-indices-content">
        {renderIndexItem('NIFTY 50', indices.nifty, updatedIndex === 'nifty')}
        {renderIndexItem('BANK NIFTY', indices.banknifty, updatedIndex === 'banknifty')}
        {renderIndexItem('INDIA VIX', indices.indiavix, updatedIndex === 'indiavix')}
        <div className="last-updated">
          Live updates • {lastUpdated.toLocaleTimeString()}
        </div>
      </div>
    );
  };

  const renderIndexItem = (name, data, isUpdated) => {
    const changeValue = parseFloat(data.change);
    const changePercent = parseFloat(data.changePercent);
    const isPositive = changeValue > 0;
    const isNeutral = changeValue === 0;
    const valueClass = isPositive ? 'positive' : (isNeutral ? '' : 'negative');
    
    // Get appropriate icon based on index
    const getIndexIcon = (indexName) => {
      if (indexName.includes('NIFTY')) return '📊';
      if (indexName.includes('BANK')) return '🏦';
      if (indexName.includes('VIX')) return '📈';
      return '💹';
    };
    
    return (
      <div className={`market-index-item ${isUpdated ? 'updated' : ''} ${valueClass}`} key={name}>
        <div className="index-header">
          <div className="index-name-section">
            <span className="index-icon">{getIndexIcon(name)}</span>
            <div className="index-details">
              <div className="index-name">{name}</div>
              <PerformanceIndicator changePercent={data.changePercent} />
            </div>
          </div>
          <MiniTrendChart isPositive={isPositive} changePercent={changePercent} />
        </div>
        
        <div className="index-values">
          <div className={`index-value ${valueClass}`}>
            {formatValue(data.value)}
          </div>
          <div className={`index-change ${valueClass}`}>
            {isPositive ? (
              <ArrowTrendingUpIcon className="trend-icon" />
            ) : isNeutral ? (
              <SparklesIcon className="trend-icon neutral" />
            ) : (
              <ArrowTrendingDownIcon className="trend-icon" />
            )}
            <span className="change-text">
              {isPositive ? '+' : ''}{formatValue(data.change)} ({data.changePercent})
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`grid-item market-indices-card ${className}`}>
      <div className="card-header premium-header">
        <div className="header-content">
          <h3 className="card-title">Market Pulse</h3>
        </div>
        <div className="header-icon-container">
          <ChartPieIcon className="card-icon" />
          <div className="icon-glow"></div>
        </div>
      </div>
      {renderIndices()}
    </div>
  );
};

export default MarketIndices;

import React, { useState, useEffect, useRef } from 'react';
import { ChartPieIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline';
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
  const previousValues = useRef({});

  useEffect(() => {
    // Store initial values
    previousValues.current = {
      nifty: indices.nifty.value,
      banknifty: indices.banknifty.value,
      indiavix: indices.indiavix.value
    };

    const fetchIndices = async () => {
      try {
        const data = await tradingService.getMarketIndices();
        setIndices(data);
        setLoading(false);
        setLastUpdated(new Date());
        
        // Check which indices have updated
        Object.keys(data).forEach(key => {
          if (data[key].value !== previousValues.current[key]) {
            setUpdatedIndex(key);
            
            // Clear previous timeout if exists
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }
            
            // Set timeout to clear the updated state
            timeoutRef.current = setTimeout(() => {
              setUpdatedIndex(null);
            }, 1000);
            
            // Update previous values
            previousValues.current[key] = data[key].value;
          }
        });
      } catch (err) {
        console.error('Error fetching market indices:', err);
        setError('Unable to fetch market data');
        setLoading(false);
      }
    };

    fetchIndices();
    
    // Set up interval to refresh data every 5 seconds
    const intervalId = setInterval(fetchIndices, 5000);
    
    return () => {
      clearInterval(intervalId);
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
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      </div>
    );
  };

  const renderIndexItem = (name, data, isUpdated) => {
    const changeValue = parseFloat(data.change);
    const isPositive = changeValue > 0;
    const isNeutral = changeValue === 0;
    const valueClass = isPositive ? 'positive' : (isNeutral ? '' : 'negative');
    
    return (
      <div className={`market-index-item ${isUpdated ? 'updated' : ''}`} key={name}>
        <div className="index-name">{name}</div>
        <div className={`index-value ${valueClass}`}>
          {formatValue(data.value)}
          <span className="index-change">
            {isPositive ? (
              <ArrowTrendingUpIcon className="trend-icon" />
            ) : isNeutral ? null : (
              <ArrowTrendingDownIcon className="trend-icon" />
            )}
            {isPositive ? '+' : ''}{formatValue(data.change)} ({data.changePercent})
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className={`grid-item market-indices-card ${className}`}>
      <div className="card-header">
        <h3 className="card-title">Market Indices</h3>
        <ChartPieIcon className="card-icon" />
      </div>
      {renderIndices()}
    </div>
  );
};

export default MarketIndices;
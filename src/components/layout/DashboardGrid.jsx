import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  CurrencyRupeeIcon,
  ClockIcon,
  BoltIcon,
  PlusIcon,
  EyeIcon,
  AdjustmentsHorizontalIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import TradingService from '../../services/TradingService';
import MarketIndices from './MarketIndices';
import Strategies from '../Strategies';
import Analytics from '../Analytics';
import RiskManager from '../RiskManager';
import GiftNiftyBacktest from '../GiftNiftyBacktest';
import './DashboardGrid.css';

const WATCHLIST_CONFIG = [
  { symbol: 'NIFTY', label: 'Nifty 50', token: 256265 },
  { symbol: 'BANKNIFTY', label: 'Bank Nifty', token: 260105 },
  { symbol: 'INDIAVIX', label: 'India VIX', token: 264969 }
];

const CHART_INTERVAL_MAP = {
  '1m': 'minute',
  '5m': '5minute',
  '15m': '15minute',
  '1h': '60minute',
  D: 'day'
};

const CHART_LOOKBACK_DAYS = {
  '1m': 3,
  '5m': 7,
  '15m': 20,
  '1h': 45,
  D: 180
};

const DashboardGrid = ({ activeSection, dashboardData: _dashboardData, userInfo: _userInfo }) => {
  void _dashboardData;
  void _userInfo;

  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [realTimeData, setRealTimeData] = useState({});
  const [margins, setMargins] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [watchlistQuotes, setWatchlistQuotes] = useState({});
  const [selectedWatchToken, setSelectedWatchToken] = useState(256265);
  const [chartTimeframe, setChartTimeframe] = useState('15m');
  const [hmaPeriod, setHmaPeriod] = useState(50);
  const [chartCandlesData, setChartCandlesData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(null);
  const lastTickAtRef = useRef(0);
  const positionsRef = useRef([]);
  const watchlistTickAtRef = useRef(0);


  // Helper functions to extract margin values from different possible API structures
  const getAvailableMargin = (margins) => {
    if (!margins) return 0;
    
    // Try different possible structures
    if (margins.equity?.available) {
      return (margins.equity.available.cash || 0) + (margins.equity.available.collateral || 0);
    }
    
    // Alternative structure: margins.available
    if (margins.available) {
      return (margins.available.cash || 0) + (margins.available.collateral || 0);
    }
    
    // Direct cash value
    if (margins.cash) return margins.cash;
    
    return 0;
  };

  const getAvailableCash = (margins) => {
    if (!margins) return 0;
    
    if (margins.equity?.available?.cash) return margins.equity.available.cash;
    if (margins.available?.cash) return margins.available.cash;
    if (margins.cash) return margins.cash;
    
    return 0;
  };

  const getUsedMargin = (margins) => {
    if (!margins) return 0;
    
    if (margins.equity?.utilised?.debits) return margins.equity.utilised.debits;
    if (margins.utilised?.debits) return margins.utilised.debits;
    if (margins.used) return margins.used;
    
    return 0;
  };

  const formatDateTimeForApi = (date) => {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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

  const getQuoteChange = (quote) => {
    const last = Number(quote?.last_price);
    const previousClose = Number(quote?.ohlc?.close);
    if (!Number.isFinite(last) || !Number.isFinite(previousClose) || previousClose === 0) {
      return { change: 0, changePercent: 0 };
    }

    const change = last - previousClose;
    return { change, changePercent: (change / previousClose) * 100 };
  };

  // Function to update positions with real-time data
  const updatePositionsWithRealTimeData = useCallback((ticks) => {
    if (!ticks || !ticks.length || !positions.length) return;
    
    console.log(`Updating positions with ${ticks.length} ticks`);
    
    setPositions(currentPositions => {
      // Use the TradingService utility to merge ticks and recalculate P&L
      return TradingService.mergeTicksAndRecalculatePnL([...currentPositions], ticks);
    });
  }, [positions.length]);

  const applyTickUpdates = useCallback((ticks) => {
    if (!ticks || !Array.isArray(ticks) || ticks.length === 0) return;

    lastTickAtRef.current = Date.now();

    setRealTimeData(prev => {
      const updates = {};
      ticks.forEach(tick => {
        const token = Number(tick?.instrument_token);
        const ltp = Number(tick?.last_price);
        if (!Number.isFinite(token) || !Number.isFinite(ltp)) return;

        updates[token] = {
          ltp,
          change: tick.change ||
            ((ltp && tick.ohlc && tick.ohlc.open) ?
              ((ltp - tick.ohlc.open) / tick.ohlc.open * 100).toFixed(2) + '%' :
              '0%'),
          volume: tick.volume || 0
        };
      });
      return Object.keys(updates).length ? { ...prev, ...updates } : prev;
    });

    updatePositionsWithRealTimeData(ticks);
  }, [updatePositionsWithRealTimeData]);

  const pollPositionQuotes = useCallback(async () => {
    const tokens = Array.from(new Set(
      positionsRef.current
        .filter(pos => Number(pos?.instrument_token))
        .map(pos => Number(pos.instrument_token))
    ));

    if (!tokens.length) return;

    try {
      const quotes = await TradingService.getQuotes(tokens);
      const ticks = Object.entries(quotes || {})
        .map(([token, quote]) => ({
          instrument_token: Number(token),
          last_price: Number(quote?.last_price),
          ohlc: quote?.ohlc,
          volume: quote?.volume,
          timestamp: new Date()
        }))
        .filter(tick => Number.isFinite(tick.instrument_token) && Number.isFinite(tick.last_price));

      applyTickUpdates(ticks);
    } catch (error) {
      console.warn('[DashboardGrid] Position quote polling failed:', error.message);
    }
  }, [applyTickUpdates]);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    const tokens = WATCHLIST_CONFIG.map(item => item.token);
    let cancelled = false;

    const applyQuoteMap = (quotes = {}) => {
      if (cancelled) return;
      const updates = {};
      WATCHLIST_CONFIG.forEach(item => {
        const quote = quotes[item.token];
        if (quote?.last_price) {
          updates[item.token] = {
            last_price: Number(quote.last_price),
            ohlc: quote.ohlc,
            timestamp: new Date()
          };
        }
      });
      if (Object.keys(updates).length) setWatchlistQuotes(prev => ({ ...prev, ...updates }));
    };

    const fetchWatchlistQuotes = async () => {
      try {
        const quotes = await TradingService.getQuotes(tokens);
        applyQuoteMap(quotes);
      } catch (error) {
        console.warn('[DashboardGrid] Watchlist quote fetch failed:', error.message);
      }
    };

    TradingService.subscribeToInstruments(tokens);
    fetchWatchlistQuotes();

    const unsubscribeTicks = TradingService.subscribeToTicks(ticks => {
      if (!Array.isArray(ticks)) return;
      const updates = {};
      ticks.forEach(tick => {
        const token = Number(tick?.instrument_token);
        const price = Number(tick?.last_price);
        if (!tokens.includes(token) || !Number.isFinite(price)) return;
        updates[token] = {
          last_price: price,
          ohlc: tick.ohlc,
          timestamp: new Date()
        };
      });

      if (Object.keys(updates).length) {
        watchlistTickAtRef.current = Date.now();
        setWatchlistQuotes(prev => ({ ...prev, ...updates }));
      }
    });

    const pollInterval = setInterval(() => {
      const stale = !watchlistTickAtRef.current || Date.now() - watchlistTickAtRef.current > 5000;
      if (connectionStatus !== 'connected' || stale) fetchWatchlistQuotes();
    }, 3000);

    return () => {
      cancelled = true;
      unsubscribeTicks();
      clearInterval(pollInterval);
      TradingService.unsubscribeFromInstruments(tokens);
    };
  }, [connectionStatus]);

  useEffect(() => {
    let cancelled = false;

    const fetchChartCandles = async () => {
      setChartLoading(true);
      setChartError(null);
      try {
        const to = new Date();
        const from = new Date(to);
        from.setDate(from.getDate() - (CHART_LOOKBACK_DAYS[chartTimeframe] || 20));
        const interval = CHART_INTERVAL_MAP[chartTimeframe] || '15minute';
        const data = await TradingService.getHistoricalData(
          selectedWatchToken,
          formatDateTimeForApi(from),
          formatDateTimeForApi(to),
          interval
        );
        const candles = (data?.candles || [])
          .map(normalizeCandle)
          .filter(candle => ['open', 'high', 'low', 'close'].every(key => Number.isFinite(candle[key])));

        if (!cancelled) {
          setChartCandlesData(candles.slice(-90));
          if (!candles.length) setChartError('No historical candles returned for this symbol.');
        }
      } catch (error) {
        console.warn('[DashboardGrid] Chart candle fetch failed:', error.message);
        if (!cancelled) {
          setChartCandlesData([]);
          setChartError(error.message || 'Unable to load chart candles.');
        }
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };

    fetchChartCandles();
    const intervalId = setInterval(fetchChartCandles, 60000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [selectedWatchToken, chartTimeframe]);

  // Fetch positions and orders data on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch positions, orders, and margins (core functionality)
        const [positionsData, ordersData, marginsData] = await Promise.all([
          TradingService.getPositions(),
          TradingService.getOrders(),
          TradingService.getMargins()
        ]);
        
        console.log('[DashboardGrid] Margins data received:', marginsData);
        console.log('[DashboardGrid] Margins structure:', JSON.stringify(marginsData, null, 2));
        
        // Log calculated margin values
        if (marginsData) {
          console.log('[DashboardGrid] Calculated margin values:', {
            availableMargin: getAvailableMargin(marginsData),
            availableCash: getAvailableCash(marginsData),
            usedMargin: getUsedMargin(marginsData)
          });
        }
        
        // Extract positions from the response
        const positionsList = positionsData?.net || [];
        console.log('[DashboardGrid] Positions data received:', positionsData);
        console.log('[DashboardGrid] Extracted positions list:', positionsList);
        console.log('[DashboardGrid] Sample position object:', positionsList[0]);
        setPositions(positionsList);
        setOrders(ordersData || []);
        setMargins(marginsData || null);
        setOrders(ordersData || []);
        setMargins(marginsData || null);
        
        // Fetch holdings separately (non-critical)
        try {
          console.log('[DashboardGrid] Fetching holdings...');
          const holdingsData = await TradingService.getHoldings();
          console.log('[DashboardGrid] Holdings data received:', holdingsData);
          setHoldings(holdingsData || []);
        } catch (holdingsError) {
          console.warn('[DashboardGrid] Failed to fetch holdings:', holdingsError);
          setHoldings([]); // Set empty array if holdings fetch fails
        }
        
        // If we have positions, ensure we subscribe to their instrument tokens
        if (positionsList.length > 0) {
          const tokens = positionsList
            .filter(pos => pos.instrument_token)
            .map(pos => pos.instrument_token);
          
          if (tokens.length > 0) {
            console.log(`Subscribing to ${tokens.length} position instruments`);
            TradingService.subscribeToInstruments(tokens);
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Subscribe to connection status changes
    const unsubscribeStatus = TradingService.onConnectionStatusChange(status => {
      setConnectionStatus(status);
    });
    
    return () => {
      unsubscribeStatus();
    };
  }, []);

  // Subscribe to real-time market data
  useEffect(() => {
    console.log('Setting up real-time tick subscription');
    
    // Subscribe to real-time ticks
    const unsubscribe = TradingService.subscribeToTicks(applyTickUpdates);

    return () => {
      console.log('Cleaning up real-time tick subscription');
      unsubscribe();
    };
  }, [applyTickUpdates]);

  useEffect(() => {
    if (!positions.length) return undefined;

    pollPositionQuotes();

    const intervalId = setInterval(() => {
      const tickIsStale = !lastTickAtRef.current || Date.now() - lastTickAtRef.current > 5000;
      if (connectionStatus !== 'connected' || tickIsStale) {
        pollPositionQuotes();
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [positions.length, connectionStatus, pollPositionQuotes]);

  // Calculate total P&L from positions
  // Try different P&L fields that Kite API might use
  const totalPnL = positions.reduce((sum, pos) => {
    const pnl = pos.pnl || pos.unrealised || pos.m2m || 0;
    return sum + pnl;
  }, 0);
  const todayPnL = positions.reduce((sum, pos) => {
    const dayPnl = pos.day_pnl || pos.realised || 0;
    return sum + dayPnl;
  }, 0);

  const activePositions = positions.filter(p => p.quantity !== 0);
  const pendingOrders = orders.filter(o => o.status === 'PENDING');
  const holdingsPnl = holdings?.reduce((sum, holding) => sum + (holding?.pnl || holding?.unrealised || holding?.m2m || 0), 0) || 0;
  const strategyCards = [
    {
      name: 'NIFTY Range Breakout',
      mode: 'Paper',
      status: 'Live scan',
      pnl: todayPnL * 0.42,
      allocation: 250000,
      checks: '1m',
      deployments: 1
    },
    {
      name: 'Bank Index Spread Engine',
      mode: 'Live',
      status: 'Guarded',
      pnl: todayPnL * 0.35,
      allocation: 400000,
      checks: '15s',
      deployments: 2
    },
    {
      name: 'Expiry Risk Balancer',
      mode: 'Paper',
      status: 'Paused',
      pnl: todayPnL * 0.23,
      allocation: 150000,
      checks: '5m',
      deployments: 1
    }
  ];
  const marketTapeItems = [
    { symbol: 'NIFTY', label: 'Nifty 50', value: 'Live', change: totalPnL >= 0 ? '+Bias' : '-Bias', tone: totalPnL >= 0 ? 'positive' : 'negative' },
    { symbol: 'BANKNIFTY', label: 'Bank Nifty', value: `${activePositions.length} Pos`, change: 'Options', tone: 'neutral' },
    { symbol: 'ORDERS', label: 'Order Flow', value: pendingOrders.length, change: 'Pending', tone: pendingOrders.length ? 'warning' : 'positive' },
    { symbol: 'MARGIN', label: 'Available', value: `₹${getAvailableMargin(margins).toLocaleString()}`, change: 'Cash', tone: 'positive' },
    { symbol: 'RISK', label: 'Used Margin', value: `₹${getUsedMargin(margins).toLocaleString()}`, change: 'Guard', tone: 'neutral' }
  ];
  
  // Debug P&L calculation
  if (positions.length > 0) {
    console.log('[DashboardGrid] P&L Calculation Debug:');
    console.log('Positions count:', positions.length);
    positions.forEach((pos, index) => {
      console.log(`Position ${index}:`, {
        symbol: pos.tradingsymbol,
        pnl: pos.pnl,
        day_pnl: pos.day_pnl,
        unrealised: pos.unrealised,
        realised: pos.realised,
        m2m: pos.m2m,
        quantity: pos.quantity
      });
    });
    console.log('Total PnL:', totalPnL);
    console.log('Today PnL:', todayPnL);
  }

  // Performance Card Component
  const PerformanceCard = ({ title, value, subtitle, icon, trend, className = "" }) => {
    const CardIcon = icon;

    return (
      <div className={`grid-item performance-card ${className}`}>
        <div className="card-header">
          <h3 className="card-title">{title}</h3>
          <CardIcon className="card-icon" />
        </div>
        <div className={`card-value ${value >= 0 ? 'positive' : 'negative'}`}>
          ₹{Math.abs(value).toLocaleString()}
        </div>
        <div className="card-subtitle">
          {subtitle}
          {trend && (
            <div className={`change-indicator ${trend >= 0 ? 'positive' : 'negative'}`}>
              {trend >= 0 ? <ArrowTrendingUpIcon /> : <ArrowTrendingDownIcon />}
              {Math.abs(trend).toFixed(2)}%
            </div>
          )}
        </div>
      </div>
    );
  };

  // Connection Status Indicator
  const ConnectionStatus = () => (
    <div className={`connection-status ${connectionStatus}`}>
      <span className="status-indicator"></span>
      <span className="status-text">
        {connectionStatus === 'connected' ? 'Connected' : 
         connectionStatus === 'connecting' ? 'Connecting...' : 
         connectionStatus === 'disconnected' ? 'Disconnected' : 
         connectionStatus === 'authentication_failed' ? 'Auth Failed' : 
         connectionStatus === 'error' ? 'Connection Error' : 
         connectionStatus === 'failed' ? 'Connection Failed' : 'Unknown'}
      </span>
    </div>
  );

  // Quick Stats Component
  const QuickStats = () => (
    <div className="grid-item grid-3x1">
      <div className="table-header">
        <h3 className="table-title">Quick Stats</h3>
        <ConnectionStatus />
      </div>
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-label">Active Positions</div>
          <div className="stat-value">{positions.filter(p => p.quantity !== 0).length}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Pending Orders</div>
          <div className="stat-value">{orders.filter(o => o.status === 'PENDING').length}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Available Margin</div>
          <div className="stat-value">₹{getAvailableMargin(margins).toLocaleString()}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Available Cash</div>
          <div className="stat-value">₹{getAvailableCash(margins).toLocaleString()}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Used Margin</div>
          <div className="stat-value">₹{getUsedMargin(margins).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );

  const WorkspaceHeader = () => (
    <section className="workspace-hero">
      <div className="workspace-copy">
        <div className="workspace-kicker">GoodBuck Workspace</div>
        <h1>Trading Dashboard</h1>
        <p>
          Live positions, strategy control and risk checks arranged for fast intraday decisions.
        </p>
      </div>
      <div className="workspace-actions">
        <button className="workspace-btn primary">
          <BoltIcon />
          Quick Order
        </button>
        <button className="workspace-btn">
          <ShieldCheckIcon />
          Risk Manager
        </button>
      </div>
    </section>
  );

  const MarketTape = () => (
    <section className="market-tape">
      {marketTapeItems.map(item => (
        <div className={`tape-tile ${item.tone}`} key={item.symbol}>
          <div>
            <span className="tape-symbol">{item.symbol}</span>
            <span className="tape-label">{item.label}</span>
          </div>
          <strong>{item.value}</strong>
          <small>{item.change}</small>
        </div>
      ))}
    </section>
  );

  const StrategyCommandCenter = () => (
    <section className="grid-item grid-12x1 strategy-command-center">
      <div className="command-header">
        <div>
          <h3>Strategy Command Center</h3>
          <p>Created strategies with deploy-style controls, allocation and live run state.</p>
        </div>
        <div className="command-tabs">
          <button className="active">Created</button>
          <button>Deployed</button>
          <button>Paper</button>
        </div>
      </div>
      <div className="strategy-command-grid">
        {strategyCards.map(strategy => (
          <article className="strategy-command-card" key={strategy.name}>
            <div className="strategy-card-top">
              <div>
                <h4>{strategy.name}</h4>
                <span>{strategy.mode} · {strategy.checks} checks</span>
              </div>
              <span className={`strategy-state ${strategy.status.toLowerCase().replace(/\s+/g, '-')}`}>
                {strategy.status}
              </span>
            </div>
            <div className="strategy-metrics-row">
              <div>
                <span>Today P&L</span>
                <strong className={strategy.pnl >= 0 ? 'positive' : 'negative'}>
                  ₹{Math.abs(strategy.pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </strong>
              </div>
              <div>
                <span>Allocation</span>
                <strong>₹{strategy.allocation.toLocaleString()}</strong>
              </div>
              <div>
                <span>Deployments</span>
                <strong>{strategy.deployments}</strong>
              </div>
            </div>
            <div className="strategy-card-actions">
              <button title="Start strategy">
                <PlayIcon />
              </button>
              <button title="Pause strategy">
                <PauseIcon />
              </button>
              <button title="Stop strategy">
                <StopIcon />
              </button>
              <button className="inspect">Inspect</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );

  // Premium loading skeleton component
  const LoadingSkeleton = ({ rows = 5, cols = 6 }) => (
    <div className="premium-loading">
      <div className="loading-header">
        <div className="skeleton-bar skeleton-title"></div>
        <div className="skeleton-bar skeleton-subtitle"></div>
      </div>
      <div className="loading-table">
        {/* Header row */}
        <div className="skeleton-row header-skeleton">
          {Array.from({ length: cols }).map((_, index) => (
            <div key={index} className="skeleton-bar skeleton-header"></div>
          ))}
        </div>
        {/* Data rows */}
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="skeleton-row" style={{ animationDelay: `${rowIndex * 0.1}s` }}>
            {Array.from({ length: cols }).map((_, colIndex) => (
              <div 
                key={colIndex} 
                className="skeleton-bar skeleton-cell"
                style={{ animationDelay: `${(rowIndex * cols + colIndex) * 0.05}s` }}
              ></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  // Card loading component
  const CardLoading = () => (
    <div className="card-loading">
      <div className="card-header premium-header">
        <div className="header-content">
          <div className="skeleton-bar skeleton-card-title"></div>
          <div className="skeleton-bar skeleton-card-subtitle"></div>
        </div>
        <div className="skeleton-icon"></div>
      </div>
      <div className="card-content-loading">
        <div className="skeleton-metrics">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="skeleton-metric" style={{ animationDelay: `${index * 0.2}s` }}>
              <div className="skeleton-bar skeleton-metric-label"></div>
              <div className="skeleton-bar skeleton-metric-value"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Margin utilization component
  const MarginUtilization = ({ margins }) => {
    const totalMargin = getAvailableMargin(margins);
    const usedMargin = getUsedMargin(margins);
    const utilizationPercentage = totalMargin > 0 ? (usedMargin / totalMargin) * 100 : 0;
    
    const getUtilizationColor = (percentage) => {
      if (percentage < 50) return 'var(--profit-primary)';
      if (percentage < 80) return '#ffad00';
      return 'var(--loss-primary)';
    };

    const getUtilizationStatus = (percentage) => {
      if (percentage < 50) return { text: 'Safe', icon: '🟢' };
      if (percentage < 80) return { text: 'Moderate', icon: '🟡' };
      return { text: 'High Risk', icon: '🔴' };
    };

    const status = getUtilizationStatus(utilizationPercentage);

    return (
      <div className="margin-utilization">
        <div className="utilization-header">
          <span className="utilization-label">Margin Utilization</span>
          <div className="utilization-status">
            <span className="status-icon">{status.icon}</span>
            <span className="status-text">{status.text}</span>
          </div>
        </div>
        <div className="utilization-bar-container">
          <div 
            className="utilization-bar" 
            style={{ 
              width: `${Math.min(utilizationPercentage, 100)}%`,
              background: `linear-gradient(90deg, rgba(var(--brand-primary-rgb), 0.3) 0%, ${getUtilizationColor(utilizationPercentage)} 100%)`
            }}
          />
        </div>
        <div className="utilization-percentage">
          {utilizationPercentage.toFixed(1)}% utilized
        </div>
      </div>
    );
  };

  // Enhanced margin breakdown component
  const MarginBreakdown = ({ margins }) => {
    const marginItems = [
      {
        label: 'Total Available',
        value: getAvailableMargin(margins),
        icon: '💰',
        color: 'var(--brand-primary)'
      },
      {
        label: 'Cash',
        value: getAvailableCash(margins),
        icon: '💵',
        color: 'var(--profit-primary)'
      },
      {
        label: 'Used Margin',
        value: getUsedMargin(margins),
        icon: '📊',
        color: 'var(--loss-primary)'
      }
    ];

    return (
      <div className="margin-breakdown-enhanced">
        {marginItems.map((item, index) => (
          <div key={index} className="margin-item-enhanced">
            <div className="margin-item-header">
              <span className="margin-icon">{item.icon}</span>
              <span className="margin-label">{item.label}</span>
            </div>
            <div className="margin-value-enhanced" style={{ color: item.color }}>
              ₹{item.value.toLocaleString()}
            </div>
            <div className="margin-bar">
              <div 
                className="margin-bar-fill" 
                style={{ 
                  width: '100%',
                  background: `linear-gradient(90deg, ${item.color}20 0%, ${item.color}40 100%)`
                }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  };
  const PnLIndicator = ({ value, isDay = false }) => {
    const isPositive = value >= 0;
    const percentage = Math.min(Math.abs(value) / 10000, 1) * 100; // Normalize to 100%
    
    return (
      <div className="pnl-cell">
        <div className={`pnl-value ${isPositive ? 'positive' : 'negative'}`}>
          ₹{value?.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }) || '0.00'}
        </div>
        <div className="pnl-bar-container">
          <div 
            className={`pnl-bar ${isPositive ? 'positive' : 'negative'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {isDay && (
          <div className="pnl-badge">
            {isPositive ? '📈' : '📉'}
          </div>
        )}
      </div>
    );
  };

  // Symbol with icon component
  const SymbolCell = ({ symbol, exchange }) => {
    const getSymbolIcon = (symbol) => {
      if (symbol?.includes('NIFTY')) return '🏛️';
      if (symbol?.includes('BANK')) return '🏦';
      if (symbol?.includes('RELIANCE')) return '⚡';
      if (symbol?.includes('TCS')) return '💻';
      if (symbol?.includes('HDFC')) return '🏪';
      return '📊';
    };

    return (
      <div className="symbol-cell">
        <span className="symbol-icon">{getSymbolIcon(symbol)}</span>
        <div className="symbol-details">
          <div className="symbol-name">{symbol}</div>
          <div className="symbol-exchange">{exchange}</div>
        </div>
      </div>
    );
  };

  // Positions Table Component
  const PositionsTable = () => (
    <div className="grid-item grid-12x1 data-table premium-table">
      <div className="table-header premium-table-header">
        <div className="table-title-section">
          <h3 className="table-title">Portfolio Positions</h3>
        </div>
        <div className="table-actions">
          <button className="table-btn secondary">
            <AdjustmentsHorizontalIcon />
            Filter
          </button>
          <button className="table-btn primary">
            <PlusIcon />
            New Position
          </button>
        </div>
      </div>
      <div className="table-content">
        <table className="table">
          <thead>
            <tr>
              <th>Symbol & Exchange</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Avg Price</th>
              <th>LTP</th>
              <th>Total P&L</th>
              <th>Day P&L</th>
              <th>M2M</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="9" style={{ padding: 0, border: 'none' }}>
                  <LoadingSkeleton rows={4} cols={9} />
                </td>
              </tr>
            ) : positions.length > 0 ? (
              positions.map((position, index) => {
                const hasRealTimeUpdates = position.instrument_token && 
                  realTimeData[position.instrument_token];
                
                return (
                  <tr key={index} className={`position-row ${hasRealTimeUpdates ? 'has-updates' : ''}`}>
                    <td>
                      <SymbolCell symbol={position.tradingsymbol} exchange={position.exchange} />
                    </td>
                    <td>
                      <span className={`product-badge ${position.product?.toLowerCase()}`}>
                        {position.product}
                      </span>
                    </td>
                    <td className="quantity-cell">
                      <span className="quantity-value">{position.quantity}</span>
                      <div className="quantity-indicator">
                        {position.quantity > 0 ? '🟢' : '🔴'}
                      </div>
                    </td>
                    <td className="price-cell">₹{position.average_price?.toFixed(2) || '0.00'}</td>
                    <td className={`price-cell ltp ${hasRealTimeUpdates ? 'highlight pulse' : ''}`}>
                      ₹{position.last_price?.toFixed(2) || '0.00'}
                      {hasRealTimeUpdates && <div className="live-indicator">●</div>}
                    </td>
                    <td>
                      <PnLIndicator value={position.pnl || position.unrealised || position.m2m || 0} />
                    </td>
                    <td>
                      <PnLIndicator value={position.day_pnl || position.realised || 0} isDay={true} />
                    </td>
                    <td className={position.m2m >= 0 ? 'positive' : 'negative'}>
                      ₹{position.m2m?.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }) || '0.00'}
                    </td>
                    <td>
                      <div className="action-buttons">
                        <button className="table-btn icon-btn" title="View Details">
                          <EyeIcon />
                        </button>
                        <button className="table-btn icon-btn secondary" title="Trade">
                          📈
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="10" className="empty-state" style={{ padding: '3rem' }}>
                  <ChartBarIcon className="empty-state-icon" />
                  <div className="empty-state-title">No Active Positions</div>
                  <div className="empty-state-description">
                    Your trading positions will appear here once you place orders
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // Orders Table Component
  const OrdersTable = () => (
    <div className="grid-item grid-12x1 data-table">
      <div className="table-header">
        <h3 className="table-title">Recent Orders</h3>
        <div className="table-actions">
          <button className="table-btn">
            <ClockIcon />
            History
          </button>
          <button className="table-btn primary">
            <BoltIcon />
            Quick Order
          </button>
        </div>
      </div>
      <div className="table-content">
        <table className="table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Symbol</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Status</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="loading-skeleton" style={{ height: '20px', width: '100%' }}></div>
                </td>
              </tr>
            ) : orders.length > 0 ? (
              orders.slice(0, 10).map((order, index) => (
                <tr key={index}>
                  <td style={{ fontFamily: 'monospace', fontSize: 'var(--font-size-xs)' }}>
                    {order.order_id}
                  </td>
                  <td style={{ fontWeight: 'var(--font-semibold)' }}>
                    {order.tradingsymbol}
                  </td>
                  <td>
                    <span className={`order-type ${order.transaction_type.toLowerCase()}`}>
                      {order.transaction_type}
                    </span>
                  </td>
                  <td>{order.quantity}</td>
                  <td>₹{order.price || order.average_price || '0.00'}</td>
                  <td>
                    <span className={`order-status ${order.status.toLowerCase()}`}>
                      {order.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 'var(--font-size-xs)' }}>
                    {new Date(order.order_timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="empty-state" style={{ padding: '3rem' }}>
                  <ClockIcon className="empty-state-icon" />
                  <div className="empty-state-title">No Recent Orders</div>
                  <div className="empty-state-description">
                    Your order history will appear here once you start trading
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const formatCurrency = (value = 0) => `₹${Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2
  })}`;

  const formatMarketValue = (value) => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
    : '—';

  const orderBookAsks = [
    { price: 22568.5, qty: 1250, depth: 64 },
    { price: 22567.2, qty: 890, depth: 48 },
    { price: 22566.8, qty: 1725, depth: 82 }
  ];

  const orderBookBids = [
    { price: 22564.2, qty: 1120, depth: 44 },
    { price: 22563.5, qty: 1460, depth: 68 },
    { price: 22562.8, qty: 740, depth: 36 }
  ];

  const watchlistItems = WATCHLIST_CONFIG.map(item => {
    const quote = watchlistQuotes[item.token];
    const { changePercent } = getQuoteChange(quote);
    const hasLivePrice = Number.isFinite(Number(quote?.last_price));
    return {
      ...item,
      price: hasLivePrice ? formatMarketValue(quote.last_price) : '—',
      change: hasLivePrice ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%` : 'Waiting',
      tone: changePercent >= 0 ? 'positive' : 'negative',
      isLive: hasLivePrice
    };
  });

  const selectedWatchItem = watchlistItems.find(item => item.token === selectedWatchToken) || watchlistItems[0];
  const latestChartCandle = chartCandlesData[chartCandlesData.length - 1];
  const hmaSeries = computeHMASeries(chartCandlesData, hmaPeriod);
  const latestHma = [...hmaSeries].reverse().find(value => Number.isFinite(value));
  const chartMin = chartCandlesData.length
    ? Math.min(...chartCandlesData.flatMap(candle => [candle.low, candle.close]), ...hmaSeries.filter(Number.isFinite))
    : null;
  const chartMax = chartCandlesData.length
    ? Math.max(...chartCandlesData.flatMap(candle => [candle.high, candle.close]), ...hmaSeries.filter(Number.isFinite))
    : null;
  const chartRange = chartMax != null && chartMin != null ? Math.max(chartMax - chartMin, 1) : 1;
  const chartWidth = 900;
  const chartHeight = 420;
  const chartPadding = { top: 32, right: 36, bottom: 42, left: 36 };
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const chartX = (index) => chartPadding.left + (chartCandlesData.length <= 1 ? 0 : index / (chartCandlesData.length - 1) * plotWidth);
  const chartY = (value) => chartPadding.top + ((chartMax - value) / chartRange) * plotHeight;
  const hmaPath = hmaSeries
    .map((value, index) => Number.isFinite(value) ? `${index === hmaSeries.findIndex(Number.isFinite) ? 'M' : 'L'} ${chartX(index).toFixed(2)} ${chartY(value).toFixed(2)}` : '')
    .filter(Boolean)
    .join(' ');
  const volumeMax = Math.max(...chartCandlesData.map(candle => candle.volume || 0), 1);

  const activePositionRows = activePositions.length ? activePositions.slice(0, 4) : [
    {
      tradingsymbol: 'NIFTY26MAY22550CE',
      quantity: 75,
      average_price: 124.5,
      last_price: 143.2,
      pnl: 1402.5,
      product: 'MIS'
    }
  ];

  const TerminalDashboard = () => (
    <div className="terminal-workspace">
      <section className="terminal-watchlist">
        <div className="terminal-panel-header">
          <span>Watchlist</span>
          <button type="button">Search</button>
        </div>
        <div className="terminal-watchlist-table">
          {watchlistItems.map(item => (
            <button
              className={`terminal-watchlist-row ${item.token === selectedWatchToken ? 'active' : ''}`}
              type="button"
              key={item.symbol}
              onClick={() => setSelectedWatchToken(item.token)}
            >
              <span>
                <strong><i className={item.isLive ? 'live' : ''} />{item.symbol}</strong>
                <small>{item.label}</small>
              </span>
              <span>
                <strong>{item.price}</strong>
                <small className={item.tone}>{item.change}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="terminal-signal-box">
          <div className="terminal-panel-title">Signal Alerts</div>
          <article>
            <div>
              <span>NIFTY</span>
              <span>LIVE</span>
            </div>
            <strong>RSI_OVERSOLD</strong>
          </article>
          <div className="terminal-holdings-pnl">
            <span>Holdings P&L</span>
            <strong className={holdingsPnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(holdingsPnl)}</strong>
          </div>
        </div>
      </section>

      <section className="terminal-chart-panel">
        <div className="terminal-chart-toolbar">
          <div>
            <strong>{selectedWatchItem?.symbol || 'NIFTY'} · {chartTimeframe}</strong>
            <div className="terminal-timeframes">
              {['1m', '5m', '15m', '1h', 'D'].map(frame => (
                <button
                  className={frame === chartTimeframe ? 'active' : ''}
                  type="button"
                  key={frame}
                  onClick={() => setChartTimeframe(frame)}
                >
                  {frame}
                </button>
              ))}
              <span className="terminal-toolbar-divider" aria-hidden="true" />
              <label className="terminal-hma-select">
                HMA
                <select value={hmaPeriod} onChange={event => setHmaPeriod(Number(event.target.value))}>
                  {[20, 50, 100, 200].map(period => (
                    <option value={period} key={period}>{period}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="terminal-ohlc">
            <span>O: <b>{formatMarketValue(latestChartCandle?.open)}</b></span>
            <span>H: <b>{formatMarketValue(latestChartCandle?.high)}</b></span>
            <span>L: <b>{formatMarketValue(latestChartCandle?.low)}</b></span>
            <span>C: <b>{formatMarketValue(latestChartCandle?.close)}</b></span>
          </div>
        </div>

        <div className="terminal-chart-surface">
          <div className="terminal-crosshair" aria-hidden="true">
            <span className="terminal-crosshair-x" />
            <span className="terminal-crosshair-y" />
            <strong className="terminal-price-tag">{formatMarketValue(latestChartCandle?.close)}</strong>
            <strong className="terminal-time-tag">14:20:00</strong>
          </div>
          <div className="terminal-drawing-tools" aria-label="Drawing tools">
            {[
              { icon: '⌖', label: 'Cursor', active: true },
              { icon: '↗', label: 'Trend line' },
              { icon: '⌁', label: 'Study' },
              { icon: '✎', label: 'Brush' },
              { icon: 'T', label: 'Text' },
              { icon: '⟂', label: 'Measure' }
            ].map(tool => (
              <button className={tool.active ? 'active' : ''} type="button" key={tool.label} title={tool.label}>
                {tool.icon}
              </button>
            ))}
          </div>
          <div className="terminal-indicators">
            <span><b aria-hidden="true">◉</b> HMA({hmaPeriod}, close): {formatMarketValue(latestHma)}</span>
            <span><b aria-hidden="true">◉</b> Source: {chartCandlesData.length ? 'Historical + live quote refresh' : 'Waiting for candles'}</span>
          </div>
          {chartLoading && <div className="terminal-chart-state">Loading candles...</div>}
          {!chartLoading && chartError && <div className="terminal-chart-state error">{chartError}</div>}
          {!chartLoading && !chartError && chartCandlesData.length > 0 && (
            <svg className="terminal-live-chart" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${selectedWatchItem?.symbol || 'NIFTY'} candlestick chart with HMA ${hmaPeriod}`}>
              <g className="terminal-chart-grid">
                {[0, 1, 2, 3, 4].map(row => (
                  <line
                    x1={chartPadding.left}
                    x2={chartWidth - chartPadding.right}
                    y1={chartPadding.top + row * plotHeight / 4}
                    y2={chartPadding.top + row * plotHeight / 4}
                    key={`h-${row}`}
                  />
                ))}
                {[0, 1, 2, 3, 4, 5, 6].map(col => (
                  <line
                    y1={chartPadding.top}
                    y2={chartHeight - chartPadding.bottom}
                    x1={chartPadding.left + col * plotWidth / 6}
                    x2={chartPadding.left + col * plotWidth / 6}
                    key={`v-${col}`}
                  />
                ))}
              </g>
              <g>
                {chartCandlesData.map((candle, index) => {
                  const x = chartX(index);
                  const openY = chartY(candle.open);
                  const closeY = chartY(candle.close);
                  const highY = chartY(candle.high);
                  const lowY = chartY(candle.low);
                  const up = candle.close >= candle.open;
                  const bodyTop = Math.min(openY, closeY);
                  const bodyHeight = Math.max(Math.abs(openY - closeY), 2);
                  const candleWidth = Math.max(3, Math.min(10, plotWidth / Math.max(chartCandlesData.length, 1) * 0.55));
                  return (
                    <g className={up ? 'up' : 'down'} key={`${candle.time}-${index}`}>
                      <line className="wick" x1={x} x2={x} y1={highY} y2={lowY} />
                      <rect
                        className="body"
                        x={x - candleWidth / 2}
                        y={bodyTop}
                        width={candleWidth}
                        height={bodyHeight}
                        rx="1"
                      />
                    </g>
                  );
                })}
              </g>
              {hmaPath && <path className="terminal-hma-line" d={hmaPath} />}
              <g className="terminal-chart-volume">
                {chartCandlesData.map((candle, index) => {
                  const x = chartX(index);
                  const width = Math.max(2, Math.min(8, plotWidth / Math.max(chartCandlesData.length, 1) * 0.45));
                  const height = Math.max(2, (candle.volume || 0) / volumeMax * 52);
                  return (
                    <rect
                      className={candle.close >= candle.open ? 'up' : 'down'}
                      x={x - width / 2}
                      y={chartHeight - chartPadding.bottom + 30 - height}
                      width={width}
                      height={height}
                      key={`vol-${candle.time}-${index}`}
                    />
                  );
                })}
              </g>
            </svg>
          )}
        </div>
      </section>

      <section className="terminal-order-panel">
        <div className="terminal-order-tabs">
          {['Limit', 'Market', 'Stop'].map((tab, index) => (
            <button className={index === 0 ? 'active' : ''} type="button" key={tab}>{tab}</button>
          ))}
        </div>
        <div className="terminal-ticket">
          <label>
            <span>Price (INR)</span>
            <input value="22,564.00" readOnly />
          </label>
          <label>
            <span>Quantity</span>
            <input placeholder="0" readOnly />
          </label>
          <div className="terminal-size-grid">
            {[25, 50, 75, 100].map(size => (
              <button type="button" key={size}>{size}%</button>
            ))}
          </div>
          <button className="terminal-buy" type="button">
            <span>Buy / Long</span>
            <strong>NIFTY</strong>
          </button>
          <button className="terminal-sell" type="button">
            <span>Sell / Short</span>
            <strong>NIFTY</strong>
          </button>
          <div className="terminal-ticket-meta">
            <span>Total Value <b>{formatCurrency(0)}</b></span>
            <span>Est. Fee <b>{formatCurrency(0)}</b></span>
          </div>
        </div>
        <div className="terminal-order-book">
          <div className="terminal-panel-title">Order Book</div>
          {orderBookAsks.map(row => (
            <div className="book-row ask" key={row.price}>
              <i style={{ width: `${row.depth}%` }} />
              <span>{row.price.toLocaleString()}</span>
              <span>{row.qty}</span>
            </div>
          ))}
          <div className="terminal-spread">Spread: 4.30 (0.019%)</div>
          {orderBookBids.map(row => (
            <div className="book-row bid" key={row.price}>
              <i style={{ width: `${row.depth}%` }} />
              <span>{row.price.toLocaleString()}</span>
              <span>{row.qty}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="terminal-bottom-panel">
        <div className="terminal-bottom-tabs">
          <button className="active" type="button">Open Positions ({activePositionRows.length})</button>
          <button type="button">Active Orders ({pendingOrders.length})</button>
          <button type="button">Trade History</button>
        </div>
        <div className="terminal-position-table">
          <table>
            <thead>
              <tr>
                <th>Market</th>
                <th>Product</th>
                <th>Size</th>
                <th>Entry Price</th>
                <th>LTP</th>
                <th>PnL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7">Loading terminal data...</td>
                </tr>
              ) : activePositionRows.map((position, index) => {
                const pnl = position.pnl || position.unrealised || position.m2m || 0;
                return (
                  <tr key={`${position.tradingsymbol}-${index}`}>
                    <td>{position.tradingsymbol}</td>
                    <td>{position.product || 'MIS'}</td>
                    <td>{position.quantity}</td>
                    <td>{formatCurrency(position.average_price)}</td>
                    <td>{formatCurrency(position.last_price)}</td>
                    <td className={pnl >= 0 ? 'positive' : 'negative'}>{formatCurrency(pnl)}</td>
                    <td><button type="button">Close Position</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  if (activeSection === 'strategies') {
    return <Strategies />;
  }

  if (activeSection === 'analytics') {
    return <Analytics />;
  }

  if (activeSection === 'risk') {
    return <RiskManager />;
  }

  if (activeSection === 'backtest') {
    return <GiftNiftyBacktest />;
  }

  if (activeSection !== 'dashboard') {
    return (
      <div className="dashboard-grid">
        <div className="grid-item grid-12x1" style={{ textAlign: 'center', padding: '3rem' }}>
          <h2 style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            {activeSection.charAt(0).toUpperCase() + activeSection.slice(1)} Section
          </h2>
          <p style={{ color: 'var(--text-tertiary)' }}>
            This section is under development. Please check back soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TerminalDashboard />
  );
};

export default DashboardGrid;

import React, { useState, useEffect } from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  CurrencyRupeeIcon,
  ClockIcon,
  BoltIcon,
  PlusIcon,
  EyeIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';
import TradingService from '../../services/TradingService';

const DashboardGrid = ({ activeSection, dashboardData, userInfo, onDataRefresh }) => {
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [realTimeData, setRealTimeData] = useState({});
  const [loading, setLoading] = useState(true);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [lastPnlRefresh, setLastPnlRefresh] = useState(new Date());
  const [mockPnL, setMockPnL] = useState(10000); // Simple mock P&L with direct state

  // Fetch initial data on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        const [positionsData, ordersData] = await Promise.all([
          TradingService.getPositions(),
          TradingService.getOrders()
        ]);
        
        setPositions(positionsData?.net || []);
        setOrders(ordersData || []);
        setLastRefresh(new Date());
        onDataRefresh?.(); // Notify parent component of data refresh
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch - only once
    fetchInitialData();
  }, []);

  // Simple P&L fluctuation for algo trading visualization
  useEffect(() => {
    const updateMockPnL = () => {
      // Create a simple random fluctuation between -500 and +500
      const change = Math.floor(Math.random() * 1000) - 500;
      setMockPnL(prev => {
        // Add some volatility but keep in a reasonable range
        const newValue = prev + change;
        // Ensure it stays within reasonable bounds
        return Math.max(-50000, Math.min(50000, newValue));
      });
      setLastPnlRefresh(new Date());
    };

    // Update P&L values every 1 second for visible fluctuation
    const pnlInterval = setInterval(updateMockPnL, 1000);
    return () => clearInterval(pnlInterval);
  }, []);

  // Manual refresh function
  const handleManualRefresh = async () => {
    try {
      setLoading(true);
      const [positionsData, ordersData] = await Promise.all([
        TradingService.getPositions(),
        TradingService.getOrders()
      ]);
      
      setPositions(positionsData?.net || []);
      setOrders(ordersData || []);
      setLastRefresh(new Date());
      onDataRefresh?.(); // Notify parent component of data refresh;
    } catch (error) {
      console.error('Error refreshing dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to real-time data and update P&L calculations
  useEffect(() => {
    const unsubscribe = TradingService.subscribeToTicks(ticks => {
      setRealTimeData(prev => {
        const updates = {};
        ticks.forEach(tick => {
          updates[tick.instrument_token] = {
            ltp: tick.last_price,
            change: ((tick.last_price - tick.ohlc.open) / tick.ohlc.open * 100).toFixed(2) + '%',
            volume: tick.volume
          };
        });
        return { ...prev, ...updates };
      });
    });

    return () => unsubscribe();
  }, []);

  // Use mock P&L for visualization
  const displayTotalPnL = mockPnL;
  const displayTodayPnL = mockPnL * 0.4;
  
  // Calculate P&L trend (simple percentage change)
  const totalPnLTrend = displayTotalPnL !== 0 ? (displayTotalPnL / Math.abs(displayTotalPnL)) * 5 : 0;
  const todayPnLTrend = displayTodayPnL !== 0 ? (displayTodayPnL / Math.abs(displayTodayPnL)) * 3 : 0;

  // Performance Card Component with refresh indicator
  const PerformanceCard = ({ title, value, subtitle, icon: Icon, trend, className = "", showRefresh = false }) => {
    const [prevValue, setPrevValue] = useState(value);
    const [isIncreasing, setIsIncreasing] = useState(null);

    // Track value changes for animation
    useEffect(() => {
      if (value !== prevValue) {
        setIsIncreasing(value > prevValue);
        setPrevValue(value);
        
        // Reset animation after a brief moment
        const timer = setTimeout(() => setIsIncreasing(null), 1000);
        return () => clearTimeout(timer);
      }
    }, [value, prevValue]);

    return (
      <div className={`grid-item performance-card ${className} ${isIncreasing === true ? 'value-increasing' : isIncreasing === false ? 'value-decreasing' : ''}`}>
        <div className="card-header">
          <h3 className="card-title">{title}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {showRefresh && (
              <button 
                onClick={handleManualRefresh}
                className="refresh-btn"
                disabled={loading}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-tertiary)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  padding: '4px',
                  borderRadius: '4px',
                  transition: 'color 0.2s'
                }}
                onMouseOver={(e) => !loading && (e.target.style.color = 'var(--brand-primary)')}
                onMouseOut={(e) => (e.target.style.color = 'var(--text-tertiary)')}
              >
                <svg 
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor"
                  className={loading ? 'spinning' : ''}
                  style={{
                    animation: loading ? 'spin 1s linear infinite' : 'none'
                  }}
                >
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="m20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
                </svg>
              </button>
            )}
            <Icon className="card-icon" />
          </div>
        </div>
        <div className={`card-value ${value >= 0 ? 'positive' : 'negative'}`}>
          ₹{Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          {isIncreasing !== null && (
            <span className={`value-change-indicator ${isIncreasing ? 'increasing' : 'decreasing'}`}>
              {isIncreasing ? '↗' : '↘'}
            </span>
          )}
        </div>
        <div className="card-subtitle">
          {subtitle}
          {trend !== undefined && (
            <div className={`change-indicator ${trend >= 0 ? 'positive' : 'negative'}`}>
              {trend >= 0 ? <ArrowTrendingUpIcon /> : <ArrowTrendingDownIcon />}
              {Math.abs(trend).toFixed(2)}%
            </div>
          )}
          <div style={{ 
            fontSize: 'var(--font-size-xs)', 
            color: 'var(--text-disabled)',
            marginTop: '0.25rem'
          }}>
            {showRefresh ? (
              <>
                P&L: {lastPnlRefresh.toLocaleTimeString()}
                {pnlLoading && <span style={{ color: 'var(--brand-primary)' }}> ●</span>}
              </>
            ) : (
              `Updated: ${lastRefresh.toLocaleTimeString()}`
            )}
          </div>
        </div>
      </div>
    );
  };

  // Quick Stats Component
  const QuickStats = () => (
    <div className="grid-item grid-3x1">
      <div className="table-header">
        <h3 className="table-title">Quick Stats</h3>
      </div>
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-label">Active Positions</div>
          <div className="stat-value">{positions.length}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Pending Orders</div>
          <div className="stat-value">{orders.filter(o => o.status === 'PENDING').length}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Available Margin</div>
          <div className="stat-value">₹{userInfo?.margins?.available?.cash?.toLocaleString() || '0'}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Used Margin</div>
          <div className="stat-value">₹{userInfo?.margins?.utilised?.debits?.toLocaleString() || '0'}</div>
        </div>
      </div>
    </div>
  );

  // Positions Table Component
  const PositionsTable = () => (
    <div className="grid-item grid-12x1 data-table">
      <div className="table-header">
        <h3 className="table-title">Positions</h3>
        <div className="table-actions">
          <button className="table-btn">
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
              <th>Symbol</th>
              <th>Qty</th>
              <th>Avg Price</th>
              <th>LTP</th>
              <th>P&L</th>
              <th>Day P&L</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                  <div className="loading-skeleton" style={{ height: '20px', width: '100%' }}></div>
                </td>
              </tr>
            ) : positions.length > 0 ? (
              positions.map((position, index) => {
                const realTimePrice = realTimeData[position.instrument_token]?.ltp || position.last_price;
                const isRealTimeUpdate = realTimeData[position.instrument_token]?.ltp;
                
                return (
                  <tr key={index} className={isRealTimeUpdate ? 'real-time-update' : ''}>
                    <td style={{ fontWeight: 'var(--font-semibold)' }}>
                      {position.tradingsymbol}
                      {isRealTimeUpdate && (
                        <span style={{ 
                          marginLeft: '0.5rem', 
                          color: 'var(--brand-primary)', 
                          fontSize: 'var(--font-size-xs)' 
                        }}>
                          ●
                        </span>
                      )}
                    </td>
                    <td>{position.quantity}</td>
                    <td>₹{position.average_price?.toFixed(2) || '0.00'}</td>
                    <td style={{ 
                      color: isRealTimeUpdate ? 'var(--brand-primary)' : 'inherit',
                      fontWeight: isRealTimeUpdate ? 'var(--font-semibold)' : 'inherit'
                    }}>
                      ₹{realTimePrice?.toFixed(2) || '0.00'}
                    </td>
                    <td className={position.pnl >= 0 ? 'positive' : 'negative'}>
                      ₹{position.pnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0'}
                    </td>
                    <td className={position.day_pnl >= 0 ? 'positive' : 'negative'}>
                      ₹{position.day_pnl?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) || '0'}
                    </td>
                    <td>
                      <button className="table-btn" style={{ padding: '0.25rem 0.5rem' }}>
                        <EyeIcon style={{ width: '14px', height: '14px' }} />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="7" className="empty-state" style={{ padding: '3rem' }}>
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
    <div className="dashboard-grid">
      {/* Performance Cards Row */}
      <PerformanceCard 
        title="Total P&L"
        value={displayTotalPnL}
        subtitle="All Time"
        icon={CurrencyRupeeIcon}
        trend={totalPnLTrend}
        className="grid-3x1 featured"
        showRefresh={true}
      />
      
      <PerformanceCard 
        title="Today's P&L"
        value={displayTodayPnL}
        subtitle="Current Session"
        icon={ArrowTrendingUpIcon}
        trend={todayPnLTrend}
        className="grid-3x1"
      />
      
      <PerformanceCard 
        title="Active Positions"
        value={positions.length}
        subtitle="Open Trades"
        icon={ChartBarIcon}
        className="grid-3x1"
      />
      
      <PerformanceCard 
        title="Available Margin"
        value={userInfo?.margins?.available?.cash || 0}
        subtitle="Buying Power"
        icon={CurrencyRupeeIcon}
        className="grid-3x1"
      />

      {/* Positions Table - Full Width */}
      <PositionsTable />

      {/* Bottom Row: Quick Stats + Orders */}
      <QuickStats />
      <div className="grid-item grid-9x1 data-table">
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
                orders.slice(0, 5).map((order, index) => (
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
    </div>
  );
};

export default DashboardGrid;
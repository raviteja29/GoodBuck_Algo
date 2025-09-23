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

const DashboardGrid = ({ activeSection, dashboardData, userInfo }) => {
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [realTimeData, setRealTimeData] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch data on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [positionsData, ordersData] = await Promise.all([
          TradingService.getPositions(),
          TradingService.getOrders()
        ]);
        
        setPositions(positionsData?.net || []);
        setOrders(ordersData || []);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Subscribe to real-time data
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

  // Calculate total P&L from positions
  const totalPnL = positions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
  const todayPnL = positions.reduce((sum, pos) => sum + (pos.day_pnl || 0), 0);

  // Performance Card Component
  const PerformanceCard = ({ title, value, subtitle, icon: Icon, trend, className = "" }) => (
    <div className={`grid-item performance-card ${className}`}>
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
        <Icon className="card-icon" />
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
              positions.map((position, index) => (
                <tr key={index}>
                  <td style={{ fontWeight: 'var(--font-semibold)' }}>
                    {position.tradingsymbol}
                  </td>
                  <td>{position.quantity}</td>
                  <td>₹{position.average_price?.toFixed(2) || '0.00'}</td>
                  <td>₹{position.last_price?.toFixed(2) || '0.00'}</td>
                  <td className={position.pnl >= 0 ? 'positive' : 'negative'}>
                    ₹{position.pnl?.toLocaleString() || '0'}
                  </td>
                  <td className={position.day_pnl >= 0 ? 'positive' : 'negative'}>
                    ₹{position.day_pnl?.toLocaleString() || '0'}
                  </td>
                  <td>
                    <button className="table-btn" style={{ padding: '0.25rem 0.5rem' }}>
                      <EyeIcon style={{ width: '14px', height: '14px' }} />
                    </button>
                  </td>
                </tr>
              ))
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
        value={totalPnL}
        subtitle="All Time"
        icon={CurrencyRupeeIcon}
        className="grid-3x1 featured"
      />
      
      <PerformanceCard 
        title="Today's P&L"
        value={todayPnL}
        subtitle="Current Session"
        icon={ArrowTrendingUpIcon}
        trend={todayPnL}
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
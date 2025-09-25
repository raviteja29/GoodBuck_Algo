import React, { useState, useEffect, useCallback } from 'react';
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
import MarketIndices from './MarketIndices';
import Strategies from '../Strategies';
import Analytics from '../Analytics';

const DashboardGrid = ({ activeSection, dashboardData, userInfo }) => {
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [realTimeData, setRealTimeData] = useState({});
  const [margins, setMargins] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

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

  // Function to update positions with real-time data
  const updatePositionsWithRealTimeData = useCallback((ticks) => {
    if (!ticks || !ticks.length || !positions.length) return;
    
    console.log(`Updating positions with ${ticks.length} ticks`);
    
    setPositions(currentPositions => {
      // Use the TradingService utility to merge ticks and recalculate P&L
      return TradingService.mergeTicksAndRecalculatePnL([...currentPositions], ticks);
    });
  }, [positions.length]);

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
    const unsubscribe = TradingService.subscribeToTicks(ticks => {
      // Update real-time data state
      setRealTimeData(prev => {
        const updates = {};
        ticks.forEach(tick => {
          if (!tick || !tick.instrument_token) return;
          
          updates[tick.instrument_token] = {
            ltp: tick.last_price,
            change: tick.change || 
              ((tick.last_price && tick.ohlc && tick.ohlc.open) ? 
                ((tick.last_price - tick.ohlc.open) / tick.ohlc.open * 100).toFixed(2) + '%' : 
                '0%'),
            volume: tick.volume || 0
          };
        });
        return { ...prev, ...updates };
      });
      
      // Update positions with real-time data
      updatePositionsWithRealTimeData(ticks);
    });

    return () => {
      console.log('Cleaning up real-time tick subscription');
      unsubscribe();
    };
  }, [updatePositionsWithRealTimeData]);

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

  if (activeSection === 'strategies') {
    return <Strategies />;
  }

  if (activeSection === 'analytics') {
    return <Analytics />;
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
    <div className="dashboard-grid">
      {/* Performance Cards Row */}
      <PerformanceCard 
        title="Total P&L"
        value={totalPnL}
        subtitle="All Time"
        icon={CurrencyRupeeIcon}
        className="grid-3x1 featured"
      />
      
      <MarketIndices className="grid-3x1" />
      
      <div className="grid-item grid-3x1">
        <div className="card-header">
          <h3 className="card-title">Positions & Holdings Summary</h3>
          <ChartBarIcon className="card-icon" />
        </div>
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label">Active Positions</div>
            <div className="stat-value">{positions.filter(p => p.quantity !== 0).length}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Closed Positions</div>
            <div className="stat-value">{positions.filter(p => p.quantity === 0).length}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Holdings</div>
            <div className="stat-value">{holdings?.length || 0}</div>
          </div>
          <div className="stat-item">
            <div className="stat-label">Holdings P&L</div>
            <div className="stat-value">₹{(holdings?.reduce((sum, holding) => sum + (holding?.pnl || holding?.unrealised || holding?.m2m || 0), 0) || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>
      
      <div className="grid-item grid-3x1">
        <div className="card-header">
          <h3 className="card-title">Available Margin</h3>
          <CurrencyRupeeIcon className="card-icon" />
        </div>
        <div className="margin-breakdown">
          <div className="margin-item">
            <div className="margin-label">Available Margin</div>
            <div className="margin-value">₹{getAvailableMargin(margins).toLocaleString()}</div>
          </div>
          <div className="margin-item">
            <div className="margin-label">Available Cash</div>
            <div className="margin-value">₹{getAvailableCash(margins).toLocaleString()}</div>
          </div>
          <div className="margin-item">
            <div className="margin-label">Used Margin</div>
            <div className="margin-value">₹{getUsedMargin(margins).toLocaleString()}</div>
          </div>
        </div>
      </div>

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
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state" style={{ padding: '3rem' }}>
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
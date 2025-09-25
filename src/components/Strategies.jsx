import React, { useState, useEffect } from 'react';
import {
  PlayIcon,
  PauseIcon,
  StopIcon,
  PlusIcon,
  EyeIcon,
  CogIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  BoltIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  AdjustmentsHorizontalIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import './Strategies.css';

const Strategies = () => {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Sample strategy data - in real implementation, this would come from API
  useEffect(() => {
    const fetchStrategies = async () => {
      setLoading(true);
      
      // Simulate API call
      setTimeout(() => {
        const sampleStrategies = [
          {
            id: 1,
            name: 'NIFTY Momentum Strategy',
            description: 'Long momentum strategy on NIFTY 50 index with RSI and moving average crossover',
            status: 'running',
            createdDate: '2024-01-15',
            lastModified: '2024-03-20',
            performance: {
              totalPnL: 125450,
              todayPnL: 8750,
              winRate: 67.5,
              totalTrades: 247,
              winningTrades: 167,
              losingTrades: 80,
              avgWin: 2150,
              avgLoss: -1420,
              maxDrawdown: -15000,
              sharpeRatio: 1.85
            },
            parameters: {
              symbol: 'NIFTY 50',
              quantity: 50,
              rsiPeriod: 14,
              rsiOverbought: 70,
              rsiOversold: 30,
              maFast: 20,
              maSlow: 50,
              stopLoss: 2,
              takeProfit: 4
            },
            execution: {
              lastExecution: '2024-03-25 14:30:00',
              nextExecution: '2024-03-25 15:30:00',
              executionMode: 'auto',
              frequency: '15m',
              activePositions: 1,
              pendingOrders: 0
            }
          },
          {
            id: 2,
            name: 'Bank NIFTY Scalping',
            description: 'High-frequency scalping strategy for Bank NIFTY with tight stops',
            status: 'running',
            createdDate: '2024-02-10',
            lastModified: '2024-03-22',
            performance: {
              totalPnL: 89320,
              todayPnL: 12450,
              winRate: 72.3,
              totalTrades: 156,
              winningTrades: 113,
              losingTrades: 43,
              avgWin: 1850,
              avgLoss: -980,
              maxDrawdown: -8500,
              sharpeRatio: 2.15
            },
            parameters: {
              symbol: 'BANKNIFTY',
              quantity: 25,
              timeframe: '5m',
              bollingerPeriod: 20,
              bollingerStdDev: 2,
              volumeThreshold: 1.5,
              stopLoss: 1.5,
              takeProfit: 2.5
            },
            execution: {
              lastExecution: '2024-03-25 14:25:00',
              nextExecution: '2024-03-25 14:30:00',
              executionMode: 'auto',
              frequency: '5m',
              activePositions: 2,
              pendingOrders: 1
            }
          },
          {
            id: 3,
            name: 'Options Straddle Strategy',
            description: 'Market neutral strategy using long straddles on high volatility events',
            status: 'paused',
            createdDate: '2024-01-20',
            lastModified: '2024-03-18',
            performance: {
              totalPnL: -12500,
              todayPnL: 0,
              winRate: 45.2,
              totalTrades: 31,
              winningTrades: 14,
              losingTrades: 17,
              avgWin: 4200,
              avgLoss: -2800,
              maxDrawdown: -25000,
              sharpeRatio: 0.65
            },
            parameters: {
              symbol: 'NIFTY',
              expiry: 'weekly',
              strikeSelection: 'ATM',
              volatilityThreshold: 25,
              timeDecayLimit: 7,
              profitTarget: 30,
              lossLimit: 50
            },
            execution: {
              lastExecution: '2024-03-18 10:15:00',
              nextExecution: null,
              executionMode: 'manual',
              frequency: 'event-based',
              activePositions: 0,
              pendingOrders: 0
            }
          },
          {
            id: 4,
            name: 'Sector Rotation Model',
            description: 'Systematic sector rotation based on momentum and relative strength',
            status: 'stopped',
            createdDate: '2024-03-01',
            lastModified: '2024-03-15',
            performance: {
              totalPnL: 45680,
              todayPnL: 0,
              winRate: 58.9,
              totalTrades: 73,
              winningTrades: 43,
              losingTrades: 30,
              avgWin: 2980,
              avgLoss: -1650,
              maxDrawdown: -18500,
              sharpeRatio: 1.32
            },
            parameters: {
              sectors: ['IT', 'Banking', 'Pharma', 'Auto'],
              lookbackPeriod: 30,
              rebalanceFreq: 'weekly',
              momentumThreshold: 0.15,
              maxSectorWeight: 0.4,
              minSectorWeight: 0.1
            },
            execution: {
              lastExecution: '2024-03-15 09:30:00',
              nextExecution: null,
              executionMode: 'manual',
              frequency: 'weekly',
              activePositions: 0,
              pendingOrders: 0
            }
          }
        ];
        
        setStrategies(sampleStrategies);
        setLoading(false);
      }, 1000);
    };

    fetchStrategies();
  }, []);

  // Strategy status management
  const handleStrategyAction = (strategyId, action) => {
    setStrategies(prev => prev.map(strategy => {
      if (strategy.id === strategyId) {
        switch (action) {
          case 'start':
            return { ...strategy, status: 'running' };
          case 'pause':
            return { ...strategy, status: 'paused' };
          case 'stop':
            return { ...strategy, status: 'stopped' };
          default:
            return strategy;
        }
      }
      return strategy;
    }));
  };

  // Get status icon and color
  const getStatusIcon = (status) => {
    switch (status) {
      case 'running': return PlayIcon;
      case 'paused': return PauseIcon;
      case 'stopped': return StopIcon;
      default: return PlayIcon;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return '#22c55e';
      case 'paused': return '#f59e0b';
      case 'stopped': return '#ef4444';
      default: return '#6b7280';
    }
  };

  // Performance card component
  const PerformanceCard = ({ title, value, subtitle, icon: Icon, trend, format = 'number' }) => {
    const formatValue = (val) => {
      if (format === 'currency') return `₹${Math.abs(val).toLocaleString()}`;
      if (format === 'percentage') return `${val}%`;
      return val?.toLocaleString() || '0';
    };

    const isPositive = typeof value === 'number' ? value >= 0 : true;

    return (
      <div className="performance-card">
        <div className="card-header">
          <h4 className="card-title">{title}</h4>
          <Icon className="card-icon" />
        </div>
        <div className={`card-value ${format === 'currency' ? (isPositive ? 'positive' : 'negative') : ''}`}>
          {formatValue(value)}
        </div>
        {subtitle && (
          <div className="card-subtitle">
            {subtitle}
            {trend !== undefined && (
              <div className={`trend-indicator ${trend >= 0 ? 'positive' : 'negative'}`}>
                {trend >= 0 ? <ArrowTrendingUpIcon /> : <ArrowTrendingDownIcon />}
                {Math.abs(trend)}%
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Strategy card component
  const StrategyCard = ({ strategy }) => {
    const StatusIcon = getStatusIcon(strategy.status);
    const statusColor = getStatusColor(strategy.status);

    return (
      <div className="strategy-card">
        <div className="strategy-header">
          <div className="strategy-info">
            <h3 className="strategy-name">{strategy.name}</h3>
            <p className="strategy-description">{strategy.description}</p>
            <div className="strategy-meta">
              <span className="meta-item">
                <ClockIcon className="meta-icon" />
                Created: {new Date(strategy.createdDate).toLocaleDateString()}
              </span>
              <span className="meta-item">
                <BoltIcon className="meta-icon" />
                {strategy.execution.frequency} execution
              </span>
            </div>
          </div>
          <div className="strategy-status-section">
            <div className="strategy-status" style={{ color: statusColor }}>
              <StatusIcon className="status-icon" />
              <span className="status-text">{strategy.status.toUpperCase()}</span>
            </div>
            <div className="strategy-actions">
              {strategy.status !== 'running' && (
                <button 
                  className="action-btn success"
                  onClick={() => handleStrategyAction(strategy.id, 'start')}
                  title="Start Strategy"
                >
                  <PlayIcon />
                </button>
              )}
              {strategy.status === 'running' && (
                <button 
                  className="action-btn warning"
                  onClick={() => handleStrategyAction(strategy.id, 'pause')}
                  title="Pause Strategy"
                >
                  <PauseIcon />
                </button>
              )}
              {strategy.status !== 'stopped' && (
                <button 
                  className="action-btn danger"
                  onClick={() => handleStrategyAction(strategy.id, 'stop')}
                  title="Stop Strategy"
                >
                  <StopIcon />
                </button>
              )}
              <button className="action-btn secondary" title="Edit Strategy">
                <CogIcon />
              </button>
              <button 
                className="action-btn secondary" 
                onClick={() => setSelectedStrategy(strategy)}
                title="View Details"
              >
                <EyeIcon />
              </button>
            </div>
          </div>
        </div>

        <div className="strategy-metrics">
          <div className="metric-item">
            <div className="metric-label">Total P&L</div>
            <div className={`metric-value ${strategy.performance.totalPnL >= 0 ? 'positive' : 'negative'}`}>
              ₹{strategy.performance.totalPnL.toLocaleString()}
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-label">Win Rate</div>
            <div className="metric-value">
              {strategy.performance.winRate}%
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-label">Total Trades</div>
            <div className="metric-value">
              {strategy.performance.totalTrades}
            </div>
          </div>
          <div className="metric-item">
            <div className="metric-label">Active Positions</div>
            <div className="metric-value">
              {strategy.execution.activePositions}
            </div>
          </div>
        </div>

        <div className="strategy-progress">
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ 
                width: `${strategy.performance.winRate}%`,
                backgroundColor: strategy.performance.winRate > 60 ? '#22c55e' : strategy.performance.winRate > 50 ? '#f59e0b' : '#ef4444'
              }}
            />
          </div>
          <div className="progress-label">Performance Score</div>
        </div>
      </div>
    );
  };

  // Strategy overview stats
  const getOverviewStats = () => {
    const runningStrategies = strategies.filter(s => s.status === 'running').length;
    const totalPnL = strategies.reduce((sum, s) => sum + s.performance.totalPnL, 0);
    const avgWinRate = strategies.reduce((sum, s) => sum + s.performance.winRate, 0) / strategies.length || 0;
    const totalTrades = strategies.reduce((sum, s) => sum + s.performance.totalTrades, 0);

    return { runningStrategies, totalPnL, avgWinRate, totalTrades };
  };

  const overviewStats = getOverviewStats();

  if (loading) {
    return (
      <div className="strategies-loading">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading strategies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="strategies-section">
      {/* Header */}
      <div className="strategies-header">
        <div className="header-content">
          <h1 className="section-title">Trading Strategies</h1>
          <p className="section-subtitle">Manage and monitor your automated trading strategies</p>
        </div>
        <div className="header-actions">
          <button className="action-btn secondary">
            <AdjustmentsHorizontalIcon />
            Filter
          </button>
          <button 
            className="action-btn primary"
            onClick={() => setShowCreateModal(true)}
          >
            <PlusIcon />
            New Strategy
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="overview-section">
        <div className="overview-grid">
          <PerformanceCard 
            title="Running Strategies"
            value={overviewStats.runningStrategies}
            subtitle={`${strategies.length} total strategies`}
            icon={PlayIcon}
          />
          <PerformanceCard 
            title="Total P&L"
            value={overviewStats.totalPnL}
            subtitle="All strategies combined"
            icon={ChartBarIcon}
            format="currency"
          />
          <PerformanceCard 
            title="Average Win Rate"
            value={overviewStats.avgWinRate.toFixed(1)}
            subtitle="Across all strategies"
            icon={ArrowTrendingUpIcon}
            format="percentage"
          />
          <PerformanceCard 
            title="Total Trades"
            value={overviewStats.totalTrades}
            subtitle="All time executions"
            icon={BoltIcon}
          />
        </div>
      </div>

      {/* Strategies Grid */}
      <div className="strategies-content">
        <div className="section-header">
          <h2 className="section-title">Your Strategies</h2>
          <div className="view-options">
            <button className="view-btn active">Grid View</button>
            <button className="view-btn">Table View</button>
          </div>
        </div>

        <div className="strategies-grid">
          {strategies.map(strategy => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </div>

        {strategies.length === 0 && (
          <div className="empty-state">
            <BoltIcon className="empty-icon" />
            <h3>No Strategies Yet</h3>
            <p>Create your first trading strategy to get started</p>
            <button 
              className="action-btn primary"
              onClick={() => setShowCreateModal(true)}
            >
              <PlusIcon />
              Create Strategy
            </button>
          </div>
        )}
      </div>

      {/* Strategy Details Modal - Placeholder */}
      {selectedStrategy && (
        <div className="modal-overlay" onClick={() => setSelectedStrategy(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedStrategy.name}</h3>
              <button 
                className="modal-close"
                onClick={() => setSelectedStrategy(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>Strategy details view - Implementation pending</p>
            </div>
          </div>
        </div>
      )}

      {/* Create Strategy Modal - Placeholder */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create New Strategy</h3>
              <button 
                className="modal-close"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p>Strategy creation form - Implementation pending</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Strategies;
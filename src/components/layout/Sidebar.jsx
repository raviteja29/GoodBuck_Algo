import React, { useState } from 'react';
import {
  HomeIcon,
  ChartBarIcon,
  CogIcon,
  BoltIcon,
  DocumentChartBarIcon,
  ShieldCheckIcon,
  BellIcon,
  CurrencyDollarIcon,
  ClockIcon,
  PlayIcon,
  PauseIcon,
  StopIcon,
  EyeIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import './Sidebar.css';

const Sidebar = ({ collapsed, activeSection, onSectionChange }) => {
  const [strategies] = useState([
    { id: 1, name: 'NIFTY Momentum', status: 'running', pnl: '+₹12,450' },
    { id: 2, name: 'Bank Index Scalp', status: 'running', pnl: '+₹8,230' },
    { id: 3, name: 'Options Straddle', status: 'paused', pnl: '-₹1,250' }
  ]);

  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: HomeIcon,
      section: 'main'
    },
    {
      id: 'strategies',
      label: 'Strategies',
      icon: BoltIcon,
      section: 'main',
      badge: strategies.filter(s => s.status === 'running').length
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: ChartBarIcon,
      section: 'main'
    },
    {
      id: 'backtest',
      label: 'Backtesting',
      icon: DocumentChartBarIcon,
      section: 'main'
    },
    {
      id: 'risk',
      label: 'Risk Manager',
      icon: ShieldCheckIcon,
      section: 'tools'
    },
    {
      id: 'alerts',
      label: 'Alerts',
      icon: BellIcon,
      section: 'tools',
      badge: 3
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      icon: CurrencyDollarIcon,
      section: 'tools'
    },
    {
      id: 'history',
      label: 'Trade History',
      icon: ClockIcon,
      section: 'tools'
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: CogIcon,
      section: 'system'
    }
  ];

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running': return PlayIcon;
      case 'paused': return PauseIcon;
      case 'stopped': return StopIcon;
      default: return EyeIcon;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'var(--strategy-running)';
      case 'paused': return 'var(--strategy-paused)';
      case 'stopped': return 'var(--strategy-stopped)';
      default: return 'var(--text-tertiary)';
    }
  };

  const renderNavigationSection = (sectionName, items) => {
    if (collapsed) return null;

    return (
      <div className="nav-section">
        <h3 className="nav-section-title">{sectionName}</h3>
        <div className="nav-items">
          {items.map((item) => renderNavItem(item))}
        </div>
      </div>
    );
  };

  const renderNavItem = (item) => {
    const IconComponent = item.icon;
    const isActive = activeSection === item.id;

    return (
      <button
        key={item.id}
        className={`nav-item ${isActive ? 'active' : ''}`}
        onClick={() => onSectionChange(item.id)}
        title={collapsed ? item.label : ''}
      >
        <div className="nav-item-icon">
          <IconComponent />
        </div>
        {!collapsed && (
          <>
            <span className="nav-item-label">{item.label}</span>
            {item.badge && item.badge > 0 && (
              <span className="nav-item-badge">{item.badge}</span>
            )}
          </>
        )}
      </button>
    );
  };

  const mainItems = navigationItems.filter(item => item.section === 'main');
  const toolItems = navigationItems.filter(item => item.section === 'tools');
  const systemItems = navigationItems.filter(item => item.section === 'system');

  return (
    <aside className={`trading-sidebar glass ${collapsed ? 'collapsed' : ''}`}>
      {/* Main Navigation */}
      <nav className="sidebar-nav">
        {collapsed ? (
          <div className="nav-items-collapsed">
            {navigationItems.map((item) => renderNavItem(item))}
          </div>
        ) : (
          <>
            {renderNavigationSection('Trading', mainItems)}
            {renderNavigationSection('Tools', toolItems)}
            {renderNavigationSection('System', systemItems)}
          </>
        )}
      </nav>

      {/* Strategy Monitor Section */}
      {!collapsed && (
        <div className="strategy-monitor">
          <div className="monitor-header">
            <h3 className="monitor-title">Live Strategies</h3>
            <div className="monitor-stats">
              <span className="stats-item">
                <span className="stats-label">Running:</span>
                <span className="stats-value running">{strategies.filter(s => s.status === 'running').length}</span>
              </span>
            </div>
          </div>

          <div className="strategy-list">
            {strategies.map((strategy) => {
              const StatusIcon = getStatusIcon(strategy.status);
              return (
                <div key={strategy.id} className="strategy-item">
                  <div className="strategy-header">
                    <div 
                      className="strategy-status-icon"
                      style={{ color: getStatusColor(strategy.status) }}
                    >
                      <StatusIcon />
                    </div>
                    <div className="strategy-info">
                      <span className="strategy-name">{strategy.name}</span>
                      <span className="strategy-status">{strategy.status.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="strategy-pnl">
                    <span className={`pnl-value ${strategy.pnl.startsWith('+') ? 'positive' : 'negative'}`}>
                      {strategy.pnl}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="strategy-actions">
            <button className="action-btn primary">
              <BoltIcon />
              <span>New Strategy</span>
            </button>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      {!collapsed && (
        <div className="quick-stats">
          <div className="stat-item">
            <div className="stat-icon positive">
              <CheckCircleIcon />
            </div>
            <div className="stat-content">
              <span className="stat-label">System Status</span>
              <span className="stat-value">Operational</span>
            </div>
          </div>
          <div className="stat-item">
            <div className="stat-icon warning">
              <ExclamationCircleIcon />
            </div>
            <div className="stat-content">
              <span className="stat-label">Risk Level</span>
              <span className="stat-value">Moderate</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
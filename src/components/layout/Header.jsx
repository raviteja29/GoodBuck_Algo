import React, { useState, useEffect } from 'react';
import {
  BellIcon,
  Cog6ToothIcon,
  PowerIcon,
  Bars3Icon,
  QuestionMarkCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import './Header.css';

const Header = ({ userInfo, onLogout, onToggleSidebar, sidebarCollapsed }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [marketInfo, setMarketInfo] = useState({ status: 'CLOSED', isOpen: false });
  const [notifications] = useState(3); // Mock notification count

  // Update time and market status every second
  useEffect(() => {
    const updateTimeAndMarket = () => {
      setCurrentTime(new Date());
      
      // Local market status calculation without API calls
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = currentHour * 100 + currentMinute;
      
      let status, isOpen, message;
      
      // Indian market hours: 9:15 AM to 3:30 PM
      if (currentTime >= 915 && currentTime <= 1530) {
        status = 'OPEN';
        isOpen = true;
        message = 'Market is open for trading';
      } else if (currentTime >= 900 && currentTime < 915) {
        status = 'PRE-MARKET';
        isOpen = false;
        message = 'Pre-market session';
      } else {
        status = 'CLOSED';
        isOpen = false;
        message = 'Market is closed';
      }
      
      setMarketInfo({ status, isOpen, message });
    };
    
    updateTimeAndMarket(); // Initial update
    const timer = setInterval(updateTimeAndMarket, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-IN', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getMarketStatusColor = () => {
    switch (marketInfo.status) {
      case 'OPEN': return 'var(--market-open)';
      case 'PRE-MARKET': 
      case 'AFTER HOURS': return 'var(--market-pre)';
      case 'WEEKEND':
      case 'CLOSED': return 'var(--market-closed)';
      default: return 'var(--text-tertiary)';
    }
  };

  return (
    <header className="trading-header glass">
      <div className="header-left">
        <button 
          className="sidebar-toggle"
          onClick={onToggleSidebar}
          aria-label="Toggle Sidebar"
        >
          {sidebarCollapsed ? <Bars3Icon /> : <XMarkIcon />}
        </button>

        <div className="brand-section">
          <div className="brand-text">
            <h1 className="brand-name">ALGO_TERMINAL_V1</h1>
          </div>
        </div>

        <nav className="terminal-top-nav" aria-label="Primary navigation">
          <a className="active" href="#dashboard">Dashboard</a>
          <a href="#analysis">Analysis</a>
          <a href="#backtest">Backtest</a>
          <a href="#risk">Risk</a>
        </nav>
      </div>

      <div className="header-center">
        <div className="market-status" title={marketInfo.message}>
          <div className="status-indicator">
            <div
              className={`status-dot ${marketInfo.isOpen ? 'pulsing' : ''}`}
              style={{ backgroundColor: getMarketStatusColor() }}
            />
            <span className="status-text">{marketInfo.isOpen ? 'CONNECTED' : marketInfo.status}</span>
          </div>
          <div className="market-time">
            <span className="time-value">12ms</span>
            <span className="time-label">RTT</span>
          </div>
          <div className="market-time">
            <span className="time-value">IST</span>
            <span className="time-label">{formatTime(currentTime)}</span>
          </div>
        </div>
      </div>

      <div className="header-right">
        <div className="account-info">
          <span className="user-name">{userInfo?.user_name || 'User'}</span>
          <span className="user-id">{userInfo?.user_id || 'ID'}</span>
        </div>

        <div className="header-actions">
          <button className="header-btn" title="Notifications">
            <BellIcon />
            {notifications > 0 && <span className="notification-badge">{notifications}</span>}
          </button>
          
          <button className="header-btn" title="Settings">
            <Cog6ToothIcon />
          </button>

          <button className="header-btn" title="Help">
            <QuestionMarkCircleIcon />
          </button>
          
          <button className="header-btn logout-btn" onClick={onLogout} title="Logout">
            <PowerIcon />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;

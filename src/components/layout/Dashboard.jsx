import React, { useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import StrategyHub from '../StrategyHub';
import TradingService from '../../services/TradingService';
import './Dashboard.css';

const Dashboard = ({ userInfo, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Order polling dispatches 'orderUpdate' events that StrategyHub listens to.
  useEffect(() => TradingService.startOrderPolling(10000), []);

  return (
    <div className="dashboard-layout">
      <Header
        userInfo={userInfo}
        onLogout={onLogout}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        sidebarCollapsed={sidebarCollapsed}
      />

      <Sidebar
        collapsed={sidebarCollapsed}
        activeSection="strategies"
        onSectionChange={() => {}}
        onLogout={onLogout}
      />

      <main className={`dashboard-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <StrategyHub />
      </main>
    </div>
  );
};

export default Dashboard;

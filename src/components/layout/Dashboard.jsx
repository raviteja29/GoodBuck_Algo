import React, { useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import DashboardGrid from './DashboardGrid';
import TradingService from '../../services/TradingService';
import './Dashboard.css';

const Dashboard = ({ userInfo, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [dashboardData, setDashboardData] = useState({
    totalPnL: 0,
    todayPnL: 0,
    positions: [],
    orders: [],
    strategies: [],
    alerts: []
  });

  // Toggle sidebar collapse
  const handleToggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed);
  };

  // Handle section navigation
  const handleSectionChange = (section) => {
    setActiveSection(section);
  };

  // Mock data update - replace with real data fetching
  useEffect(() => {
    // Simulate data updates
    const updateData = () => {
      setDashboardData(prev => ({
        ...prev,
        totalPnL: Math.random() * 100000 - 50000,
        todayPnL: Math.random() * 10000 - 5000,
        // Add more real-time data updates here
      }));
    };

    const interval = setInterval(updateData, 2000);
    
    // Start polling for order updates
    const stopOrderPolling = TradingService.startOrderPolling(10000); // Poll every 10 seconds
    
    return () => {
      clearInterval(interval);
      stopOrderPolling(); // Stop order polling when component unmounts
    };
  }, []);

  return (
    <div className="dashboard-layout">
      <Header 
        userInfo={userInfo}
        onLogout={onLogout}
        onToggleSidebar={handleToggleSidebar}
        sidebarCollapsed={sidebarCollapsed}
      />
      
      <Sidebar 
        collapsed={sidebarCollapsed}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
      
      <main className={`dashboard-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <DashboardGrid 
          activeSection={activeSection}
          dashboardData={dashboardData}
          userInfo={userInfo}
        />
      </main>
    </div>
  );
};

export default Dashboard;
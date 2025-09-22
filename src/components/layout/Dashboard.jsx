import React, { useState, useEffect } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import DashboardGrid from './DashboardGrid';
import './Dashboard.css';

const Dashboard = ({ userInfo, onLogout }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
    return () => clearInterval(interval);
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
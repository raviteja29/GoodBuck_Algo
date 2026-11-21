import React from 'react';
import { BoltIcon, PowerIcon } from '@heroicons/react/24/outline';
import './Sidebar.css';

const Sidebar = ({ collapsed, activeSection, onSectionChange, onLogout }) => {
  const navigationItems = [
    { id: 'strategies', label: 'Strategies', icon: BoltIcon, section: 'main' },
    { id: 'logout', label: 'Logout', icon: PowerIcon, section: 'system' }
  ];

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
        onClick={() => item.id === 'logout' ? onLogout?.() : onSectionChange(item.id)}
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
  const systemItems = navigationItems.filter(item => item.section === 'system');

  return (
    <aside className={`trading-sidebar glass ${collapsed ? 'collapsed' : ''}`}>
      {/* Main Navigation */}
      <nav className="sidebar-nav">
        <div className="sidebar-terminal-profile">
          <div className="terminal-avatar">T1</div>
          {!collapsed && (
            <div>
              <strong>TRADER_01</strong>
              <span>API_CONNECTED</span>
            </div>
          )}
        </div>

        {collapsed ? (
          <div className="nav-items-collapsed">
            {navigationItems.map((item) => renderNavItem(item))}
          </div>
        ) : (
          <>
            {renderNavigationSection('Trading', mainItems)}
            {renderNavigationSection('System', systemItems)}
          </>
        )}
      </nav>

    </aside>
  );
};

export default Sidebar;

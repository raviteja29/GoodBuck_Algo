// src/App.jsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import AuthCallback from './components/AuthCallback';
import AuthService from './services/AuthService';
import TradingService from './services/TradingService';
import { 
  BoltIcon, 
  BellIcon, 
  Cog6ToothIcon, 
  ChartBarIcon, 
  CurrencyRupeeIcon, 
  ArrowTrendingUpIcon 
} from '@heroicons/react/24/outline';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  LineChart,
  Line
} from 'recharts';
// ... (keep all your existing dashboard imports)

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userInfo, setUserInfo] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Check authentication status on app load
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        if (AuthService.isAuthenticated()) {
          const userInfo = AuthService.getUserInfo();
          const profile = await TradingService.getProfile();
          
          setUserInfo({ ...userInfo, ...profile });
          setIsAuthenticated(true);
          
          // Redirect to dashboard if on login page
          if (location.pathname === '/' || location.pathname === '/login') {
            navigate('/dashboard');
          }
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        AuthService.logout();
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, [navigate, location]);

  const handleLoginSuccess = async (authResponse) => {
    try {
      const profile = await TradingService.getProfile();
      setUserInfo({ ...authResponse, ...profile });
      setIsAuthenticated(true);
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to load user profile:', error);
      setIsAuthenticated(true); // Still allow login
      navigate('/dashboard');
    }
  };

  const handleLoginError = (error) => {
    console.error('Login error:', error);
    navigate('/');
  };

  const handleLogout = () => {
    AuthService.logout();
    setIsAuthenticated(false);
    setUserInfo(null);
    navigate('/');
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading GoodBuck...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          isAuthenticated ? 
          <Dashboard userInfo={userInfo} onLogout={handleLogout} /> : 
          <Login onLoginSuccess={handleLoginSuccess} />
        } 
      />
      <Route 
        path="/login" 
        element={<Login onLoginSuccess={handleLoginSuccess} />} 
      />
      <Route 
        path="/callback" 
        element={
          <AuthCallback 
            onAuthSuccess={handleLoginSuccess}
            onAuthError={handleLoginError}
          />
        } 
      />
      <Route 
        path="/dashboard" 
        element={
          isAuthenticated ? 
          <Dashboard userInfo={userInfo} onLogout={handleLogout} /> : 
          <Login onLoginSuccess={handleLoginSuccess} />
        } 
      />
    </Routes>
  );
}

// Your existing Dashboard component with slight modifications
const Dashboard = ({ userInfo, onLogout }) => {
  // State for selected instruments
  const [selected, setSelected] = React.useState([]);

  // Remove selected instruments from watchlist
  const handleRemoveSelected = () => {
    setWatchlist(watchlist.filter(inst => !selected.includes(inst)));
    setSelected([]);
  };

  // Toggle checkbox selection
  const handleCheckboxChange = (name) => {
    setSelected(selected.includes(name)
      ? selected.filter(n => n !== name)
      : [...selected, name]);
  };
  // Local state for watchlist instruments and their real-time data
  const [watchlist, setWatchlist] = React.useState([]);
  const [realTimeData, setRealTimeData] = React.useState({});

  // Subscribe to real-time updates when component mounts
  React.useEffect(() => {
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

  // Add instrument to watchlist (fetch from Kite, case-insensitive, no duplicates)
  const handleAddInstrument = async () => {
    const input = prompt('Enter instrument name (e.g. NIFTY, BANKNIFTY):');
    if (!input) return;
    const name = input.trim().toUpperCase();
    if (watchlist.some(inst => (inst.name || inst).toUpperCase() === name)) {
      alert('Instrument already in watchlist.');
      return;
    }
    // Fetch instrument details from Kite (mocked here, replace with API call)
    let instrumentDetails = null;
    try {
      instrumentDetails = await TradingService.getInstrumentDetails(name);
      if (instrumentDetails) {
        setWatchlist(prev => [...prev, instrumentDetails]);
        console.log('Added to watchlist:', instrumentDetails);
      }
    } catch (err) {
      console.error('Error adding instrument:', err);
      alert('Instrument not found. Try NIFTY, BANKNIFTY, or FINNIFTY.');
      return;
    }
  };

  // Remove instrument from watchlist
  const handleRemoveInstrument = (name) => {
    setWatchlist(watchlist.filter(inst => inst !== name));
  };
  // Restore your professional dashboard template, but use actual Kite API data where available
  const [profile, setProfile] = React.useState(null);
  const [margins, setMargins] = React.useState(null);
  const [positions, setPositions] = React.useState(null);
  const [orders, setOrders] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [currentPnL, setCurrentPnL] = React.useState(28450);
  const [todaysPnL, setTodaysPnL] = React.useState(7200);
  const [activeTab, setActiveTab] = React.useState('dashboard');
  const [selectedInstrument, setSelectedInstrument] = React.useState(null);
  const [instrumentChartData, setInstrumentChartData] = React.useState([]);
  const [showOrders, setShowOrders] = React.useState(false);
  // Example instrument list (replace with API fetch if needed)
  const instrumentList = [
    { name: 'NIFTY 50', token: '256265' },
    { name: 'BANKNIFTY', token: '260105' },
    { name: 'FINNIFTY', token: '1213841' }
  ];

  // Load static data once on mount
  React.useEffect(() => {
    let isMounted = true;
    async function fetchStaticData() {
      try {
        if (!isMounted) return;
        setLoading(true);
        const profileData = await TradingService.getProfile();
        setProfile(profileData);
        const marginsData = await TradingService.getMargins();
        setMargins(marginsData);
        const ordersData = await TradingService.getOrders();
        setOrders(ordersData);
      } catch (err) {
        setError('Failed to fetch dashboard data.');
      } finally {
        setLoading(false);
      }
    }
    fetchStaticData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Refresh positions (P&L) every second
  React.useEffect(() => {
    let isMounted = true;
    async function fetchPositions() {
      try {
        if (!isMounted) return;
          const positionsData = await TradingService.getPositions();
          console.log('[P&L DEBUG] Fetched positions:', positionsData);
          setPositions(positionsData);
      } catch (err) {
        // Optionally handle error
      }
    }
    fetchPositions();
    const interval = setInterval(fetchPositions, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Fetch chart data for selected instrument
  React.useEffect(() => {
    async function fetchChart() {
      if (!selectedInstrument) return;
      try {
        // Last 1 day, 5min interval
        const now = new Date();
        const toDate = now.toISOString().slice(0, 10);
        const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const data = await TradingService.getHistoricalData(selectedInstrument.token, fromDate, toDate, '5minute');
        setInstrumentChartData(data.candles || []);
      } catch (err) {
        setInstrumentChartData([]);
      }
    }
    fetchChart();
  }, [selectedInstrument]);

  // Use actual Kite API data for profile, margins, positions, orders
  // Fallback to mock data for charts and tables if needed
  const mockPnLData = [
    { time: '09:15', value: 0, volume: 1200 },
    { time: '09:30', value: 2500, volume: 2300 },
    { time: '09:45', value: 1800, volume: 1800 },
    { time: '10:00', value: 4200, volume: 2800 },
    { time: '10:15', value: 3800, volume: 2100 },
    { time: '10:30', value: 5600, volume: 3200 },
    { time: '10:45', value: 7200, volume: 2900 }
  ];
  const activeStrategies = [
    { name: 'NIFTY Momentum', pnl: '+₹12,450', status: 'active', winRate: '68%' },
    { name: 'Bank Index Scalp', pnl: '+₹8,230', status: 'active', winRate: '72%' },
    { name: 'Options Straddle', pnl: '-₹1,250', status: 'paused', winRate: '45%' }
  ];
  const recentTrades = [
    { symbol: 'NIFTY25JAN28000CE', side: 'BUY', qty: 50, price: 245.50, pnl: '+₹2,450', time: '10:32' },
    { symbol: 'BANKNIFTY25JAN52000PE', side: 'SELL', qty: 25, price: 180.25, pnl: '+₹1,820', time: '10:28' },
    { symbol: 'NIFTY25JAN27500CE', side: 'SELL', qty: 75, price: 320.80, pnl: '-₹890', time: '10:15' }
  ];

  if (loading) {
    return (
      <div className="trading-dashboard minimal-dashboard">
        <div className="minimal-header">Loading...</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="trading-dashboard minimal-dashboard">
        <div className="minimal-header">Error: {error}</div>
        <button className="logout-btn" onClick={onLogout}>Logout</button>
      </div>
    );
  }


  // Top card layout using performance-grid and performance-card
  // Card 1: P&L (refreshes every second)
  // Card 2: Positions (toggle)
  // Card 3: Orders (toggle)
  return (
  <div className="trading-dashboard" style={{minHeight:'100vh', width:'100vw', background:'linear-gradient(135deg, #181818 0%, #232323 100%)', color:'#fff', overflowX:'hidden'}}>
      <div className="dashboard-header" style={{background:'rgba(34,34,34,0.98)', borderBottom:'1px solid #222', boxShadow:'0 2px 16px rgba(0,0,0,0.12)', width:'100vw', minWidth:0, display:'flex', alignItems:'center', height:'64px', padding:'0 2rem'}}>
        <span className="brand" style={{display:'flex', alignItems:'center', gap:'1rem', paddingLeft:'1.5rem'}}>
          <svg className="brand-icon" width="36" height="36" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{display:'block'}}>
            <circle cx="16" cy="16" r="16" fill="#00ff88"/>
            <text x="16" y="21" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#111">₹</text>
          </svg>
          <span style={{fontWeight:700, fontSize:'1.3rem', color:'#00ff88', lineHeight:'36px', display:'flex', alignItems:'center'}}>GoodBuck</span>
        </span>
        <button className="logout-btn" onClick={onLogout} style={{marginLeft:'auto'}}>Logout</button>
      </div>

      <div className="dashboard-container" style={{display:'flex', justifyContent:'center', alignItems:'flex-start', width:'100vw', minWidth:0, margin:'0', padding:'0 2vw'}}>
        <main className="dashboard-main" style={{flex:1, padding:'2.5rem 0', display:'flex', flexDirection:'column', gap:'2.5rem', alignItems:'center', width:'100vw', minWidth:0}}>
          <div className="performance-grid" style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'2.5rem', width:'100%', minWidth:0, justifyItems:'center'}}>
            {/* Card 1: P&L */}
            <div className="performance-card" style={{background:'#181818', border:'none', borderRadius:'24px', padding:'2.5rem 2rem', minWidth:'320px', boxShadow:'0 4px 32px rgba(0,255,136,0.10)'}}>
              <div className="card-header" style={{marginBottom:'1.2rem', display:'flex', alignItems:'center', gap:'0.75rem'}}>
                <ArrowTrendingUpIcon className="trend-icon positive" style={{width:'2.8rem', height:'2.8rem', color:'#fff'}} />
                <h3 style={{fontSize:'1.25rem', color:'#fff', fontWeight:700}}>P&L</h3>
              </div>
              <div className={`card-value ${positions && Array.isArray(positions.net) && positions.net.reduce((sum, pos) => sum + (pos.pnl || 0), 0) >= 0 ? 'positive' : 'negative'}`} style={{fontSize:'2.6rem', fontWeight:700, color:positions && Array.isArray(positions.net) && positions.net.reduce((sum, pos) => sum + (pos.pnl || 0), 0) >= 0 ? '#00ff88' : '#ff4444'}}>
                ₹{Array.isArray(positions?.net)
                  ? positions.net.reduce((sum, pos) => sum + (pos.pnl || 0), 0).toLocaleString()
                  : '0'}
              </div>
              <div className="card-change" style={{fontSize:'1rem', color:'#fff'}}>Live</div>
            </div>
            {/* Card 2: Positions & Orders */}
            <div className="performance-card" style={{background:'#181818', border:'none', borderRadius:'24px', padding:'2.5rem 2rem', minWidth:'320px', boxShadow:'0 4px 32px rgba(0,255,136,0.10)'}}>
              <div className="card-header" style={{marginBottom:'1.2rem', display:'flex', alignItems:'center', gap:'0.75rem'}}>
                <ChartBarIcon className="trend-icon" style={{width:'2.8rem', height:'2.8rem', color:'#fff'}} />
                <h3 style={{fontSize:'1.25rem', color:'#fff', fontWeight:700}}>Positions & Orders</h3>
              </div>
              <div style={{display:'flex', flexDirection:'column', gap:'0.7rem'}}>
                <div className="card-value positive" style={{fontSize:'2.1rem', fontWeight:700, color:'#00ff88', cursor:'pointer'}} onClick={() => setShowOrders(false)}>
                  Positions: {Array.isArray(positions?.net) ? positions.net.length : 0}
                </div>
              <div className="card-value positive" style={{fontSize:'2.1rem', fontWeight:700, color:'#00ff88', cursor:'pointer'}} onClick={() => setShowOrders(true)}>
                  Orders: {Array.isArray(orders) ? orders.length : 0}
              </div>
              </div>
            </div>
            {/* Card 3: Placeholder */}
            <div className="performance-card" style={{background:'#181818', border:'none', borderRadius:'24px', padding:'2.5rem 2rem', minWidth:'320px', boxShadow:'0 4px 32px rgba(0,255,136,0.10)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'1.5rem', fontWeight:600}}>
              Placeholder
            </div>
          </div>

          {/* Main Instrument Table Below Cards */}
          <div className="data-section" style={{width:'100%', marginTop:'2.5rem'}}>
            <div className="data-table" style={{background:'linear-gradient(135deg, #232323 0%, #232323 100%)', border:'none', borderRadius:'20px', padding:'2rem', boxShadow:'0 4px 32px rgba(0,255,136,0.08)'}}>
              <table className="minimal-table" style={{width:'100%', fontSize:'1.08rem', borderCollapse:'separate', borderSpacing:'0'}}>
                <thead>
                  <tr>
                    <th colSpan={7} style={{textAlign:'left', fontSize:'1.15rem', color:'#00ff88', fontWeight:700}}>
                      Watchlist
                      <button className="add-instrument-btn" style={{background:'none',border:'none',cursor:'pointer',marginLeft:'1rem',fontSize:'1.2rem',color:'#00ff88'}} title="Add instrument" onClick={handleAddInstrument}>+</button>
                      {selected.length > 0 && (
                        <button className="delete-instrument-btn" style={{background:'none',border:'none',cursor:'pointer',marginLeft:'0.5rem',fontSize:'1.2rem',color:'#ff4444'}} title="Remove selected" onClick={handleRemoveSelected}>-</button>
                      )}
                    </th>
                  </tr>
                  <tr>
                    <th></th>
                    <th>Instrument</th>
                    <th>LTP</th>
                    <th>Change</th>
                    <th>Qty</th>
                    <th>Avg Price</th>
                    <th>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.length > 0 ? (
                    watchlist.map((inst, idx) => {
                      const realtimeInst = realTimeData[inst.token] || {};
                      return (
                        <tr key={inst.token || inst.name || idx} style={{borderBottom:'1px solid #222'}}>
                          <td style={{textAlign:'center'}}>
                            <input type="checkbox" checked={selected.includes(inst.name)} onChange={() => handleCheckboxChange(inst.name)} />
                          </td>
                          <td style={{color:'#fff', padding:'0.7rem', textAlign:'left'}}>{inst.name}</td>
                          <td style={{color:'#fff', padding:'0.7rem', textAlign:'right'}}>
                            {realtimeInst.ltp !== undefined ? `₹${realtimeInst.ltp}` : inst.ltp !== undefined ? `₹${inst.ltp}` : '-'}
                          </td>
                          <td style={{color:'#fff', padding:'0.7rem', textAlign:'right'}}>
                            {realtimeInst.change !== undefined ? realtimeInst.change : inst.change !== undefined ? inst.change : '-'}
                          </td>
                          <td style={{color:'#fff', padding:'0.7rem', textAlign:'right'}}>
                            {realtimeInst.volume !== undefined ? realtimeInst.volume : inst.qty !== undefined ? inst.qty : '-'}
                          </td>
                          <td style={{color:'#fff', padding:'0.7rem', textAlign:'right'}}>{inst.avgPrice !== undefined ? inst.avgPrice : '-'}</td>
                          <td style={{color:'#fff', padding:'0.7rem', textAlign:'right'}}>{inst.pnl !== undefined ? inst.pnl : '-'}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan={8} style={{textAlign:'center',color:'#fff', padding:'1.2rem'}}>No instruments in watchlist</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Details Section: Positions or Orders (below instrument table) */}
          {!showOrders && Array.isArray(positions?.net) && positions.net.length > 0 && (
            <div className="data-section" style={{width:'100%', marginTop:'2.5rem'}}>
              <div className="data-table" style={{background:'linear-gradient(135deg, #232323 0%, #232323 100%)', border:'none', borderRadius:'20px', padding:'2rem', boxShadow:'0 4px 32px rgba(0,255,136,0.08)'}}>
                <div className="table-header" style={{marginBottom:'1.2rem'}}>
                  <h3 style={{fontSize:'1.15rem', color:'#00ff88', fontWeight:700}}>Position Details</h3>
                </div>
                <table className="minimal-table" style={{width:'100%', fontSize:'1.08rem', borderCollapse:'separate', borderSpacing:'0'}}>
                  <thead>
                    <tr>
                      <th style={{color:'#00ff88', fontWeight:700, padding:'0.7rem'}}>Symbol</th>
                      <th style={{color:'#00ff88', fontWeight:700, padding:'0.7rem'}}>Qty</th>
                      <th style={{color:'#00ff88', fontWeight:700, padding:'0.7rem'}}>Avg Price</th>
                      <th style={{color:'#00ff88', fontWeight:700, padding:'0.7rem'}}>P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.net.map((pos, idx) => (
                      <tr key={idx} style={{borderBottom:'1px solid #222'}}>
                        <td style={{color:'#fff', padding:'0.7rem', textAlign:'left'}}>{pos.tradingsymbol}</td>
                        <td style={{color:'#fff', padding:'0.7rem', textAlign:'right'}}>{pos.quantity}</td>
                        <td style={{color:'#fff', padding:'0.7rem', textAlign:'right'}}>{pos.average_price != null ? pos.average_price.toFixed(2) : '-'}</td>
                        <td style={{color: pos.pnl >= 0 ? '#00ff88' : '#ff4444', padding:'0.7rem', textAlign:'right'}}>₹{pos.pnl?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {showOrders && Array.isArray(orders) && (
            <div className="data-section" style={{width:'100%', marginTop:'2.5rem'}}>
              <div className="data-table" style={{background:'linear-gradient(135deg, #232323 0%, #232323 100%)', border:'none', borderRadius:'20px', padding:'2rem', boxShadow:'0 4px 32px rgba(0,255,136,0.08)'}}>
                <div className="table-header" style={{marginBottom:'1.2rem'}}>
                  <h3 style={{fontSize:'1.15rem', color:'#00ff88', fontWeight:700}}>Orders</h3>
                </div>
                <table className="minimal-table" style={{width:'100%', fontSize:'1.08rem', borderCollapse:'separate', borderSpacing:'0'}}>
                  <thead>
                    <tr>
                      <th style={{color:'#00ff88', fontWeight:700, padding:'0.7rem'}}>Order ID</th>
                      <th style={{color:'#00ff88', fontWeight:700, padding:'0.7rem'}}>Symbol</th>
                      <th style={{color:'#00ff88', fontWeight:700, padding:'0.7rem'}}>Qty</th>
                      <th style={{color:'#00ff88', fontWeight:700, padding:'0.7rem'}}>Status</th>
                      <th style={{color:'#00ff88', fontWeight:700, padding:'0.7rem'}}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order, idx) => (
                      <tr key={idx} style={{borderBottom:'1px solid #222'}}>
                        <td style={{color:'#fff', padding:'0.7rem', textAlign:'left'}}>{order.order_id}</td>
                        <td style={{color:'#fff', padding:'0.7rem', textAlign:'left'}}>{order.tradingsymbol}</td>
                        <td style={{color:'#fff', padding:'0.7rem', textAlign:'right'}}>{order.quantity}</td>
                        <td style={{color:'#fff', padding:'0.7rem', textAlign:'center'}}>{order.status}</td>
                        <td style={{color:'#fff', padding:'0.7rem', textAlign:'right'}}>
                          {order.average_price && order.average_price > 0
                            ? order.average_price.toFixed(2)
                            : (order.price != null ? order.price : '-')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;

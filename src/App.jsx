// src/App.jsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import AuthCallback from './components/AuthCallback';
import FyersCallback from './components/FyersCallback';
import FyersTest from './components/FyersTest';
import FyersDebug from './components/FyersDebug';
import Dashboard from './components/layout/Dashboard';
import WebSocketDebugger from './components/WebSocketDebugger';
import AuthService from './services/AuthService';
import TradingService from './services/TradingService';

// Import global styles
import './styles/variables.css';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userInfo, setUserInfo] = useState(null);
  const [showDebugger, setShowDebugger] = useState(true); // Enable debugger by default
  const navigate = useNavigate();
  const location = useLocation();

  // Check authentication status on app load
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // Skip auth check for Fyers-specific routes
        if (location.pathname === '/fyers-test' || location.pathname === '/fyers-callback' || location.pathname === '/fyers-debug') {
          setIsLoading(false);
          return;
        }

        if (AuthService.isAuthenticated()) {
          const userInfo = AuthService.getUserInfo();
          
          // Initialize WebSocket connection after authentication
          await TradingService.setupWebSocket();
          
          try {
            const profile = await TradingService.getProfile();
            setUserInfo({ ...userInfo, ...profile });
          } catch (profileError) {
            console.error('Failed to load profile:', profileError);
            setUserInfo(userInfo);
          }
          
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
      // Initialize WebSocket connection after successful login
      await TradingService.setupWebSocket();
      
      try {
        const profile = await TradingService.getProfile();
        setUserInfo({ ...authResponse, ...profile });
      } catch (profileError) {
        console.error('Failed to load user profile:', profileError);
        setUserInfo(authResponse);
      }
      
      setIsAuthenticated(true);
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to setup after login:', error);
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

  // Toggle debugger with keyboard shortcut (Ctrl+Shift+D)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowDebugger(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading GoodBuck...</p>
      </div>
    );
  }

  return (
    <>
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
          path="/fyers-callback" 
          element={<FyersCallback />} 
        />
        <Route 
          path="/fyers-test" 
          element={<FyersTest />} 
        />
        <Route 
          path="/fyers-debug" 
          element={<FyersDebug />} 
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
      
      {/* WebSocket Debugger - only shown when authenticated */}
      {isAuthenticated && showDebugger && <WebSocketDebugger />}
    </>
  );
}

export default App;
// src/App.jsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Login from './components/Login';
import AuthCallback from './components/AuthCallback';
import Dashboard from './components/layout/Dashboard';
import AuthService from './services/AuthService';
import TradingService from './services/TradingService';

// Import global styles
import './styles/variables.css';
import './App.css';

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

export default App;

// src/components/Login.jsx
import React, { useState } from 'react';
import { CurrencyRupeeIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import AuthService from '../services/AuthService';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = () => {
    setIsLoading(true);
    
    // Redirect to Zerodha login
    const loginUrl = AuthService.getLoginUrl();
    window.location.href = loginUrl;
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="brand-logo">
            <CurrencyRupeeIcon className="brand-icon" />
            <h1>GoodBuck</h1>
          </div>
          <p className="login-subtitle">
            Professional Algorithmic Trading Platform
          </p>
        </div>

        <div className="login-content">
          <div className="login-features">
            <div className="feature-item">
              <ShieldCheckIcon className="feature-icon" />
              <span>Secure Zerodha Integration</span>
            </div>
            <div className="feature-item">
              <CurrencyRupeeIcon className="feature-icon" />
              <span>Real-time Market Data</span>
            </div>
            <div className="feature-item">
              <ShieldCheckIcon className="feature-icon" />
              <span>Automated Strategy Execution</span>
            </div>
          </div>

          <button 
            className="login-button" 
            onClick={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="loading-spinner"></div>
            ) : (
              <>
                <img 
                  src="https://zerodha.com/static/images/logo.svg" 
                  alt="Zerodha" 
                  className="zerodha-logo"
                />
                Login with Zerodha
              </>
            )}
          </button>

          <div className="login-info">
            <p>
              Secure OAuth 2.0 authentication with Zerodha Kite Connect API
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

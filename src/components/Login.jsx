// src/components/Login.jsx
import React, { useState } from 'react';
import { CurrencyRupeeIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import AuthService from '../services/AuthService';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [broker, setBroker] = useState('zerodha');
  const [error, setError] = useState(null);

  const handleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (broker === 'zerodha') {
        const loginUrl = AuthService.getLoginUrl();
        window.location.href = loginUrl;
        return;
      }
      // Breeze redirect style: obtain backend-generated login URL
      const breezeUrl = await AuthService.getBreezeLoginUrl();
      window.location.href = breezeUrl;
    } catch (e) {
      console.error('Login error:', e);
      setError(e.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
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
              <span>Secure Broker Integration</span>
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

          <div className="broker-select-group">
            <label htmlFor="broker-select">Select Broker</label>
            <select
              id="broker-select"
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              className="broker-select"
              disabled={isLoading}
            >
              <option value="zerodha">Zerodha</option>
              <option value="breeze">ICICI Breeze</option>
            </select>
          </div>

          {/* Breeze redirect flow hides secrets; no Breeze env vars used on frontend */}

          <button
            className="login-button"
            onClick={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="loading-spinner"></div>
            ) : broker === 'zerodha' ? (
              <>
                <img
                  src="https://zerodha.com/static/images/logo.svg"
                  alt="Zerodha"
                  className="zerodha-logo"
                />
                Login with Zerodha
              </>
            ) : (
              <>
                <span style={{ fontWeight: 600 }}>Login with Breeze</span>
              </>
            )}
          </button>

          <div className="login-info">
            {broker === 'zerodha' ? (
              <p>OAuth 2.0 authentication with Zerodha Kite Connect</p>
            ) : (
              <p>Redirect-based authentication with ICICI Breeze (keys stay on server)</p>
            )}
            {error && <p style={{ color: 'tomato', marginTop: '8px' }}>{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

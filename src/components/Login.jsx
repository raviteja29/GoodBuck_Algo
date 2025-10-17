// src/components/Login.jsx
import React, { useState } from 'react';
import { CurrencyRupeeIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import AuthService from '../services/AuthService';
import { useFyersAuth } from '../hooks/useFyersAuth';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [broker, setBroker] = useState('zerodha');
  const [error, setError] = useState(null);
  // Fyers auth hook for parity with new login page
  const { login: fyersLogin, loading: fyersLoading, error: fyersError, isAuthenticated: fyersAuthed } = useFyersAuth();

  const handleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      if (broker === 'zerodha') {
        const loginUrl = AuthService.getLoginUrl();
        window.location.href = loginUrl;
        return;
      }
      if (broker === 'fyers') {
        // Use secure proxy flow via Fyers hook
        await fyersLogin();
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
              <option value="fyers">Fyers</option>
            </select>
          </div>

          {/* Breeze redirect flow hides secrets; no Breeze env vars used on frontend */}

          <button
            className="login-button"
            onClick={handleLogin}
            disabled={isLoading || fyersLoading}
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
            ) : broker === 'breeze' ? (
              <>
                <span style={{ fontWeight: 600 }}>Login with Breeze</span>
              </>
            ) : (
              <>
                <span style={{ fontWeight: 600 }}>Login with Fyers</span>
              </>
            )}
          </button>

          <div className="login-info">
            {broker === 'zerodha' ? (
              <p>OAuth 2.0 authentication with Zerodha Kite Connect</p>
            ) : broker === 'breeze' ? (
              <p>Redirect-based authentication with ICICI Breeze (keys stay on server)</p>
            ) : (
              <p>Secure OAuth with Fyers via server proxy. Your client secret is never exposed.</p>
            )}
            {error && <p style={{ color: 'tomato', marginTop: '8px' }}>{error}</p>}
            {fyersError && broker === 'fyers' && (
              <p style={{ color: 'tomato', marginTop: '8px' }}>{fyersError}</p>
            )}
            {fyersAuthed && broker === 'fyers' && (
              <p style={{ color: '#22c55e', marginTop: '8px' }}>Connected to Fyers. You can proceed to the dashboard or open Fyers tools.</p>
            )}
          </div>

          {/* Fyers Test Link */}
          <div className="fyers-test-link">
            <a href="/fyers-test" className="test-link">
              🚀 Test Fyers API Integration
            </a>
            <p className="test-link-description">
              Test Fyers authentication and historical options data
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

import React, { useState } from 'react';
import { ShieldCheckIcon, ChartBarIcon, BoltIcon } from '@heroicons/react/24/outline'; // Updated icons
import AuthService from '../services/AuthService';
import { useFyersAuth } from '../hooks/useFyersAuth';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      const loginUrl = AuthService.getLoginUrl();
      window.location.href = loginUrl;
    } catch (e) {
      console.error('Login error:', e);
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Dynamic Background Elements */}
      <div className="bg-orb orb-1"></div>
      <div className="bg-orb orb-2"></div>
      <div className="bg-orb orb-3"></div>

      <div className="login-card-glass">
        <div className="login-header">
          <div className="brand-logo-glow">
            <h1 className="brand-title">GoodBuck<span className="brand-dot">.</span></h1>
          </div>
          <p className="login-subtitle">
            Next-Generation Algorithmic Trading Intelligence
          </p>
        </div>

        <div className="login-content">
          <div className="feature-grid">
            <div className="feature-card">
              <BoltIcon className="feature-icon" />
              <div className="feature-text">
                <h3>Lightning Execution</h3>
                <p>Zero-latency order routing directly to the exchange.</p>
              </div>
            </div>
            <div className="feature-card">
              <ChartBarIcon className="feature-icon" />
              <div className="feature-text">
                <h3>Institutional Analytics</h3>
                <p>Advanced charting, order flow, and market profiling.</p>
              </div>
            </div>
            <div className="feature-card">
              <ShieldCheckIcon className="feature-icon" />
              <div className="feature-text">
                <h3>Bank-Grade Security</h3>
                <p>Enterprise encryption with direct broker integration.</p>
              </div>
            </div>
          </div>

          <div className="login-action-section">
            <button
              className={`premium-login-button ${isLoading ? 'loading' : ''}`}
              onClick={handleLogin}
              disabled={isLoading}
            >
              <div className="button-content">
                {isLoading ? (
                  <div className="spinner-ring"></div>
                ) : (
                  <>
                    <img
                      src="https://zerodha.com/static/images/logo.svg"
                      alt="Zerodha Kite"
                      className="broker-logo-svg"
                    />
                    <span>Authenticate with Kite</span>
                  </>
                )}
              </div>
              <div className="button-glow"></div>
            </button>
            <p className="login-disclaimer">
              Secure OAuth 2.0 integration via Zerodha Kite Connect API. <br /> Your credentials never touch our servers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

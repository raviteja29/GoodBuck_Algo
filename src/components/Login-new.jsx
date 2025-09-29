import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthService from '../services/AuthService-new';
import BrokerSelector from './BrokerSelector';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentBroker, setCurrentBroker] = useState(null);
  
  // Zerodha-specific state
  const [requestToken, setRequestToken] = useState('');
  
  // Breeze-specific state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiSecret, setApiSecret] = useState('');

  useEffect(() => {
    initializeAuth();
  }, [searchParams]);

  const initializeAuth = async () => {
    try {
      // Initialize brokers first
      await AuthService.initializeBrokers();
      setCurrentBroker(AuthService.getCurrentBroker());

      // Check for existing authentication
      if (AuthService.isAuthenticated()) {
        navigate('/dashboard');
        return;
      }

      // Handle Zerodha callback
      const requestToken = searchParams.get('request_token');
      if (requestToken && AuthService.getCurrentBroker() === 'zerodha') {
        setRequestToken(requestToken);
        handleZerodhaLogin(requestToken);
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      setError('Failed to initialize authentication');
    }
  };

  const handleBrokerChange = (newBrokerId) => {
    setCurrentBroker(newBrokerId);
    setError('');
    setRequestToken('');
    setUsername('');
    setPassword('');
    setApiSecret('');
  };

  const handleZerodhaLogin = async (token = requestToken) => {
    if (!token) {
      setError('Request token is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await AuthService.generateSession({ requestToken: token });
      navigate('/dashboard');
    } catch (error) {
      console.error('Zerodha login error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBreezeLogin = async (e) => {
    e.preventDefault();

    if (!username || !password || !apiSecret) {
      setError('Username, password, and API secret are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await AuthService.generateSession({ 
        username, 
        password, 
        apiSecret 
      });
      navigate('/dashboard');
    } catch (error) {
      console.error('Breeze login error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const initiateZerodhaLogin = () => {
    const loginUrl = AuthService.getLoginUrl();
    if (loginUrl) {
      window.location.href = loginUrl;
    } else {
      setError('Login URL not available');
    }
  };

  const renderZerodhaLogin = () => (
    <div className="login-form">
      <h2>Login to Zerodha Kite</h2>
      
      {requestToken ? (
        <div className="token-login">
          <p>Authorization successful! Complete your login:</p>
          <div className="form-group">
            <label>Request Token:</label>
            <input
              type="text"
              value={requestToken}
              onChange={(e) => setRequestToken(e.target.value)}
              placeholder="Request token from Zerodha"
              disabled={loading}
            />
          </div>
          <button 
            onClick={() => handleZerodhaLogin()}
            disabled={loading || !requestToken}
            className="login-button"
          >
            {loading ? 'Logging in...' : 'Complete Login'}
          </button>
        </div>
      ) : (
        <div className="redirect-login">
          <p>Click the button below to login via Zerodha:</p>
          <button 
            onClick={initiateZerodhaLogin}
            className="login-button kite-login"
            disabled={loading}
          >
            Login with Kite
          </button>
          
          <div className="manual-token">
            <p>Or enter request token manually:</p>
            <div className="form-group">
              <input
                type="text"
                value={requestToken}
                onChange={(e) => setRequestToken(e.target.value)}
                placeholder="Paste request token here"
                disabled={loading}
              />
            </div>
            <button 
              onClick={() => handleZerodhaLogin()}
              disabled={loading || !requestToken}
              className="login-button secondary"
            >
              {loading ? 'Logging in...' : 'Login with Token'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderBreezeLogin = () => (
    <div className="login-form">
      <h2>Login to ICICI Breeze</h2>
      <form onSubmit={handleBreezeLogin}>
        <div className="form-group">
          <label>Username:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Your ICICI Direct username"
            disabled={loading}
            required
          />
        </div>
        
        <div className="form-group">
          <label>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your ICICI Direct password"
            disabled={loading}
            required
          />
        </div>
        
        <div className="form-group">
          <label>API Secret (2PIN):</label>
          <input
            type="text"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            placeholder="Your API secret/2PIN"
            disabled={loading}
            required
          />
        </div>
        
        <button 
          type="submit"
          disabled={loading || !username || !password || !apiSecret}
          className="login-button"
        >
          {loading ? 'Logging in...' : 'Login to Breeze'}
        </button>
      </form>
    </div>
  );

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Trading System Login</h1>
          <p>Select your broker and login to continue</p>
        </div>

        <BrokerSelector onBrokerChange={handleBrokerChange} />

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {currentBroker === 'zerodha' && renderZerodhaLogin()}
        {currentBroker === 'breeze' && renderBreezeLogin()}
        
        {!currentBroker && (
          <div className="no-broker">
            <p>Please select a broker to continue.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
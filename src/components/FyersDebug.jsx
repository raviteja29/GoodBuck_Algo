import React, { useState, useEffect } from 'react';
import { useFyersAuth } from '../hooks/useFyersAuth';

const FyersDebug = () => {
  const [debugInfo, setDebugInfo] = useState({});
  const [manualAuthCode, setManualAuthCode] = useState('');
  const { isAuthenticated, login, error, userProfile, fyersService } = useFyersAuth();

  useEffect(() => {
    // Collect debug information
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const state = urlParams.get('state');
    const storedState = localStorage.getItem('fyers_state');
    const accessToken = localStorage.getItem('fyers_access_token');

    setDebugInfo({
      currentUrl: window.location.href,
      pathname: window.location.pathname,
      authCode: authCode,
      state: state,
      storedState: storedState,
      accessToken: accessToken ? 'Present' : 'Not found',
      isAuthenticated: isAuthenticated,
      envVars: {
        clientId: import.meta.env.VITE_FYERS_CLIENT_ID,
        redirectUrl: import.meta.env.VITE_FYERS_REDIRECT_URL,
        baseUrl: import.meta.env.VITE_FYERS_BASE_URL
      }
    });

    // If auth code is in URL, set it for manual processing
    if (authCode) {
      setManualAuthCode(authCode);
    }
  }, [isAuthenticated]);

  const generateAuthUrl = () => {
    try {
      const authUrl = fyersService.getAuthUrl();
      return authUrl;
    } catch (error) {
      return `Error: ${error.message}`;
    }
  };

  const processManualAuthCode = async () => {
    if (!manualAuthCode) {
      alert('Please enter an auth code');
      return;
    }

    try {
      await fyersService.getAccessToken(manualAuthCode);
      alert('Authentication successful! Check status above.');
      window.location.reload();
    } catch (error) {
      alert(`Authentication failed: ${error.message}`);
    }
  };

  return (
    <div style={{ 
      padding: '2rem', 
      backgroundColor: '#1e293b', 
      color: 'white', 
      minHeight: '100vh',
      fontFamily: 'monospace'
    }}>
      <h1>🔍 Fyers Authentication Debug</h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <h2>Current Status</h2>
        <pre style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px' }}>
          {JSON.stringify({
            isAuthenticated: isAuthenticated,
            hasError: !!error,
            error: error,
            hasUserProfile: !!userProfile,
            userProfile: userProfile
          }, null, 2)}
        </pre>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2>URL & Parameters</h2>
        <pre style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px' }}>
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2>Manual Auth Code Processing</h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
          <input
            type="text"
            value={manualAuthCode}
            onChange={(e) => setManualAuthCode(e.target.value)}
            placeholder="Paste auth code here"
            style={{
              flex: 1,
              padding: '0.5rem',
              backgroundColor: '#0f172a',
              color: 'white',
              border: '1px solid #374151',
              borderRadius: '4px'
            }}
          />
          <button 
            onClick={processManualAuthCode}
            style={{ 
              padding: '0.5rem 1rem', 
              backgroundColor: '#22c55e', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Process Auth Code
          </button>
        </div>
        <p style={{ fontSize: '0.9rem', color: '#9ca3af' }}>
          If redirected from production, paste the auth code here to complete authentication.
        </p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2>Generated Auth URL</h2>
        <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '8px', wordBreak: 'break-all' }}>
          {generateAuthUrl()}
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <h2>Actions</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button 
            onClick={login}
            style={{ 
              padding: '0.5rem 1rem', 
              backgroundColor: '#3b82f6', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Start Fyers Login
          </button>
          
          <button 
            onClick={() => localStorage.clear()}
            style={{ 
              padding: '0.5rem 1rem', 
              backgroundColor: '#ef4444', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear LocalStorage
          </button>
          
          <button 
            onClick={() => window.location.reload()}
            style={{ 
              padding: '0.5rem 1rem', 
              backgroundColor: '#10b981', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Reload Page
          </button>
        </div>
      </div>

      <div>
        <h2>Expected Flow</h2>
        <ol>
          <li>Click "Start Fyers Login" → Redirects to Fyers OAuth</li>
          <li>Complete Fyers authentication → Redirects to /fyers-callback</li>
          <li>FyersCallback processes the auth code → Stores token</li>
          <li>Redirects back to /fyers-test → Shows authenticated state</li>
        </ol>
      </div>
    </div>
  );
};

export default FyersDebug;
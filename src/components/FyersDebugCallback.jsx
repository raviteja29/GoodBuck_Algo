import React, { useEffect, useState } from 'react';

const FyersDebugCallback = () => {
  const [debugInfo, setDebugInfo] = useState({});
  const [status, setStatus] = useState('Initializing...');

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    const storedState = localStorage.getItem('fyers_state');
    
    const envInfo = {
      clientId: import.meta.env.VITE_FYERS_CLIENT_ID,
      clientSecret: import.meta.env.VITE_FYERS_CLIENT_SECRET ? 'Present' : 'Missing',
      redirectUrl: import.meta.env.VITE_FYERS_REDIRECT_URL,
      baseUrl: import.meta.env.VITE_FYERS_BASE_URL
    };

    setDebugInfo({
      currentUrl: window.location.href,
      authCode: authCode ? `${authCode.substring(0, 20)}...` : 'Missing',
      authCodeLength: authCode ? authCode.length : 0,
      state: state,
      storedState: storedState,
      error: error,
      env: envInfo,
      timestamp: new Date().toISOString()
    });

    if (error) {
      setStatus(`Error from Fyers: ${error}`);
    } else if (!authCode) {
      setStatus('No authorization code found in URL');
    } else if (state !== storedState) {
      setStatus('State parameter mismatch - security check failed');
    } else {
      setStatus('Authorization code received - ready to exchange for token');
    }
  }, []);

  const testTokenExchange = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    
    if (!authCode) {
      setStatus('No auth code to test');
      return;
    }

    setStatus('Testing token exchange...');
    
    try {
      // Import the service dynamically to avoid module issues
      const { default: FyersService } = await import('../services/FyersService');
      
      // Try to exchange the token
      const token = await FyersService.getAccessToken(authCode);
      setStatus(`✅ Success! Token received: ${token.substring(0, 20)}...`);
    } catch (error) {
      setStatus(`❌ Error: ${error.message}`);
    }
  };

  return (
    <div style={{ 
      padding: '2rem', 
      fontFamily: 'monospace', 
      background: '#1a1a1a', 
      color: '#fff', 
      minHeight: '100vh' 
    }}>
      <h1>🔍 Fyers Debug Callback</h1>
      
      <div style={{ background: '#333', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
        <h2>Current Status</h2>
        <p style={{ fontSize: '1.2rem', color: status.includes('✅') ? '#4ade80' : status.includes('❌') ? '#f87171' : '#fbbf24' }}>
          {status}
        </p>
      </div>

      <div style={{ background: '#333', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
        <h2>Debug Information</h2>
        <pre style={{ overflow: 'auto', fontSize: '0.9rem' }}>
          {JSON.stringify(debugInfo, null, 2)}
        </pre>
      </div>

      <div style={{ background: '#333', padding: '1rem', borderRadius: '8px' }}>
        <h2>Actions</h2>
        <button 
          onClick={testTokenExchange}
          style={{
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '1rem'
          }}
        >
          Test Token Exchange
        </button>
        
        <button 
          onClick={() => window.location.href = '/fyers-test'}
          style={{
            background: '#6b7280',
            color: 'white',
            border: 'none',
            padding: '0.5rem 1rem',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Back to Test Page
        </button>
      </div>
    </div>
  );
};

export default FyersDebugCallback;
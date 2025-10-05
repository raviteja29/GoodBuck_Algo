import React, { useState } from 'react';
import FyersService from '../services/FyersService';

const SimpleLoginTest = () => {
  const [status, setStatus] = useState('Ready');
  const [authUrl, setAuthUrl] = useState('');

  const testLogin = () => {
    try {
      setStatus('Generating auth URL...');
      
      // Create a new instance of FyersService
      const fyersService = new FyersService();
      console.log('FyersService instance created:', fyersService);
      
      // Check if all required properties are available
      console.log('Client ID:', fyersService.clientId);
      console.log('Redirect URL:', fyersService.redirectUrl);
      console.log('Base URL:', fyersService.baseUrl);
      
      if (!fyersService.clientId) {
        setStatus('Error: Client ID not found');
        return;
      }
      
      if (!fyersService.redirectUrl) {
        setStatus('Error: Redirect URL not found');
        return;
      }
      
      // Generate auth URL
      const url = fyersService.getAuthUrl();
      console.log('Generated URL:', url);
      
      setAuthUrl(url);
      setStatus('Auth URL generated successfully');
      
      // Try to redirect
      setTimeout(() => {
        setStatus('Redirecting...');
        window.location.href = url;
      }, 2000);
      
    } catch (error) {
      console.error('Login test error:', error);
      setStatus(`Error: ${error.message}`);
    }
  };

  const manualRedirect = () => {
    if (authUrl) {
      window.open(authUrl, '_blank');
    }
  };

  return (
    <div style={{ 
      padding: '2rem', 
      backgroundColor: '#1e293b', 
      color: 'white', 
      minHeight: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1>🧪 Simple Fyers Login Test</h1>
      
      <div style={{ marginBottom: '2rem' }}>
        <h2>Status: {status}</h2>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <button 
          onClick={testLogin}
          style={{
            padding: '1rem 2rem',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '1rem',
            marginRight: '1rem'
          }}
        >
          🚀 Test Fyers Login
        </button>
        
        {authUrl && (
          <button 
            onClick={manualRedirect}
            style={{
              padding: '1rem 2rem',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            🔗 Open Auth URL Manually
          </button>
        )}
      </div>

      {authUrl && (
        <div style={{ marginBottom: '2rem' }}>
          <h3>Generated Auth URL:</h3>
          <div style={{
            backgroundColor: '#0f172a',
            padding: '1rem',
            borderRadius: '8px',
            wordBreak: 'break-all',
            fontFamily: 'monospace',
            fontSize: '0.9rem'
          }}>
            {authUrl}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '2rem' }}>
        <h3>Environment Variables:</h3>
        <pre style={{
          backgroundColor: '#0f172a',
          padding: '1rem',
          borderRadius: '8px',
          fontSize: '0.9rem'
        }}>
          {JSON.stringify({
            VITE_FYERS_CLIENT_ID: import.meta.env.VITE_FYERS_CLIENT_ID,
            VITE_FYERS_REDIRECT_URL: import.meta.env.VITE_FYERS_REDIRECT_URL,
            VITE_FYERS_BASE_URL: import.meta.env.VITE_FYERS_BASE_URL
          }, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default SimpleLoginTest;
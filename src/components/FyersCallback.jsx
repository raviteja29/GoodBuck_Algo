import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFyersAuth } from '../hooks/useFyersAuth';

const FyersCallback = () => {
  const navigate = useNavigate();
  const { isAuthenticated, loading, error } = useFyersAuth();
  const [message, setMessage] = useState('Processing Fyers Authentication...');

  useEffect(() => {
    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const errorParam = urlParams.get('error');

    console.log('FyersCallback - Auth Code:', authCode);
    console.log('FyersCallback - Error:', errorParam);
    console.log('FyersCallback - Full URL:', window.location.href);

    if (errorParam) {
      setMessage(`Authentication failed: ${errorParam}`);
      setTimeout(() => navigate('/fyers-test'), 3000);
      return;
    }

    if (!authCode) {
      setMessage('No authorization code found. Redirecting...');
      setTimeout(() => navigate('/fyers-test'), 2000);
      return;
    }

    setMessage('Processing authorization code...');
  }, [navigate]);

  useEffect(() => {
    // Handle authentication completion
    if (isAuthenticated) {
      setMessage('✅ Authentication successful! Redirecting...');
      setTimeout(() => navigate('/fyers-test'), 1500);
    } else if (error) {
      setMessage(`❌ Authentication failed: ${error}`);
      setTimeout(() => navigate('/fyers-test'), 3000);
    }
  }, [isAuthenticated, error, navigate]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
      color: 'white'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        maxWidth: '500px'
      }}>
        <h2>Fyers Authentication</h2>
        <p>{message}</p>
        
        {loading && (
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(255, 255, 255, 0.3)',
            borderTop: '3px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '1rem auto'
          }}></div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem',
            color: '#fca5a5'
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {isAuthenticated && (
          <div style={{
            background: 'rgba(34, 197, 94, 0.2)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            marginTop: '1rem',
            color: '#86efac'
          }}>
            <strong>Success!</strong> You are now authenticated with Fyers.
          </div>
        )}

        <div style={{ marginTop: '1rem', fontSize: '0.9rem', opacity: 0.7 }}>
          <p>Debug Info:</p>
          <p>Auth Code: {new URLSearchParams(window.location.search).get('code') ? 'Present' : 'Missing'}</p>
          <p>Loading: {loading ? 'Yes' : 'No'}</p>
          <p>Authenticated: {isAuthenticated ? 'Yes' : 'No'}</p>
        </div>
      </div>
      
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default FyersCallback;
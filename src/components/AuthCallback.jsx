// src/components/AuthCallback.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AuthService from '../services/AuthService';
import TradingService from '../services/TradingService';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [message, setMessage] = useState('Processing authentication...');
  const hasCalled = useRef(false);

  useEffect(() => {
  console.log('AuthCallback mounted and effect running');
  const requestToken = searchParams.get('request_token');
  const loginStatus = searchParams.get('status');
  const breezeApiSession = searchParams.get('API_Session') || searchParams.get('api_session') || searchParams.get('API_SESSION');
  console.log('Callback params:', { requestToken, loginStatus, breezeApiSession });
  if (hasCalled?.current) return;
  if (typeof hasCalled !== 'undefined') hasCalled.current = true;

    // Zerodha flow
    if (loginStatus === 'success' && requestToken) {
      setMessage('Generating session…');
      console.log('Calling generateSession with token:', requestToken);
      AuthService.generateSession(requestToken)
        .then(() => {
          setStatus('success');
          setMessage('Login successful! Redirecting…');
          
          // Force WebSocket connection to be established with the new token
          console.log('Re-initializing WebSocket connection after login...');
          
          // Call setupWebSocket from TradingService
          // This will ensure the WebSocket connection uses the new token
          setTimeout(() => {
            try {
              if (typeof TradingService.setupWebSocket === 'function') {
                TradingService.setupWebSocket();
                console.log('WebSocket connection re-initialized successfully');
              } else {
                console.warn('setupWebSocket method not found on TradingService');
              }
            } catch (error) {
              console.error('Error setting up WebSocket after login:', error);
            }
            // Navigate away so this effect cannot run again
            navigate('/dashboard');
          }, 1000);
        })
        .catch(err => {
          console.error('Auth error:', err);
          setStatus('error');
          setMessage('Authentication failed. Please try again.');
          setTimeout(() => navigate('/login'), 1500);
        });
    } else if (breezeApiSession) {
      // Breeze flow
      setMessage('Establishing Breeze session…');
      AuthService.generateBreezeSession(breezeApiSession)
        .then(() => {
          setStatus('success');
          setMessage('Breeze login successful! Redirecting…');
          setTimeout(() => navigate('/dashboard'), 800);
        })
        .catch(err => {
          console.error('Breeze auth error:', err);
          setStatus('error');
          setMessage('Breeze authentication failed');
          setTimeout(() => navigate('/login'), 1500);
        });
    } else {
      navigate('/login');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps ensure this runs only once

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="callback-content">
          <div className={`status-icon ${status}`}></div>
          <h2>{message}</h2>
        </div>
      </div>
    </div>
  );
};

export default AuthCallback;

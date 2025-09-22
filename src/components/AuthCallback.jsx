// src/components/AuthCallback.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AuthService from '../services/AuthService';

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
  console.log('Calling generateSession with token:', requestToken);
  if (hasCalled?.current) return;
  if (typeof hasCalled !== 'undefined') hasCalled.current = true;

    // Only proceed if status=success AND we have a token
    if (loginStatus === 'success' && requestToken) {
      setMessage('Generating session…');
      console.log('Calling generateSession with token:', requestToken);
      AuthService.generateSession(requestToken)
        .then(() => {
          setStatus('success');
          setMessage('Login successful! Redirecting…');
          // Navigate away so this effect cannot run again
          setTimeout(() => navigate('/dashboard'), 1000);
        })
        .catch(err => {
          console.error('Auth error:', err);
          setStatus('error');
          setMessage('Authentication failed. Please try again.');
          setTimeout(() => navigate('/login'), 1500);
        });
    } else {
      // If no token or status not success, send back to login
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

import { useState, useEffect, useRef } from 'react';
import FyersService from '../services/FyersService';

export const useFyersAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const authCodeProcessed = useRef(false); // Prevent duplicate processing

  useEffect(() => {
    console.log('=== useFyersAuth useEffect triggered ===');

    const token = localStorage.getItem('fyers_access_token');
    if (token && !isAuthenticated) {
      console.log('Found existing token, setting authenticated state');
      FyersService.accessToken = token;
      setIsAuthenticated(true);
      fetchUserProfile();
    }

    const urlParams = new URLSearchParams(window.location.search);
    // Accept both code and auth_code just in case
    let authCode = urlParams.get('code') || urlParams.get('auth_code');
    const state = urlParams.get('state');
    const storedState = localStorage.getItem('fyers_state');

    if (authCode) {
      authCode = authCode.trim();
    }

    console.log('URL Params check:');
    console.log('- Auth Code present:', !!authCode, authCode ? 'length=' + authCode.length : '');
    console.log('- State:', state);
    console.log('- Stored State:', storedState);
    console.log('- Already Processed:', authCodeProcessed.current);

    if (authCode && !authCodeProcessed.current) {
      if (state && state === storedState) {
        authCodeProcessed.current = true; // lock immediately
        console.log('✅ State validation passed, processing auth code');
        handleAuthCallback(authCode);
      } else {
        console.error('❌ State validation failed');
        setError('Invalid state parameter. Please try logging in again.');
      }
    } else if (authCode && authCodeProcessed.current) {
      console.log('⚠️ Auth code already processed, skipping');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Schedule silent refresh if expiry known
  useEffect(()=>{
    if (!isAuthenticated) return;
    const expiry = FyersService.expiryEpoch;
    if (!expiry) return;
    const nowSec = Math.floor(Date.now()/1000);
    const refreshAt = (expiry - FyersService.earlyRefreshSeconds - nowSec) * 1000;
    if (refreshAt <= 0) {
      FyersService.refreshAccessToken().catch(()=>{});
      return;
    }
    const id = setTimeout(()=>{ FyersService.refreshAccessToken().catch(()=>{}); }, refreshAt);
    return ()=> clearTimeout(id);
  }, [isAuthenticated, FyersService.expiryEpoch]);

  const fetchUserProfile = async () => {
    try {
      const profile = await FyersService.getProfile();
      setUserProfile(profile);
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  const handleAuthCallback = async (authCode) => {
    console.log('=== HANDLE AUTH CALLBACK START ===');
    console.log('Received auth code length:', authCode.length);
    setLoading(true);
    setError(null);
    try {
      console.log('Calling FyersService.getAccessToken...');
      await FyersService.getAccessToken(authCode);
      setIsAuthenticated(true);
      await fetchUserProfile();
      window.history.replaceState({}, document.title, window.location.pathname);
      localStorage.removeItem('fyers_state');
      console.log('✅ Authentication flow completed successfully');
    } catch (err) {
      console.error('❌ Authentication callback error:', err);
      setError(err.message === 'invalid auth code' ? 'Auth code invalid or already used. Please login again.' : err.message);
      authCodeProcessed.current = false; // allow retry if failure due to code reuse might not be correct but keeps UX flexible
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    setError(null);
    try {
      const authUrl = FyersService.getAuthUrl();
      if (!authUrl) {
        setError('Failed to generate auth URL');
        return;
      }
      setTimeout(() => { window.location.href = authUrl; }, 50);
    } catch (err) {
      setError(`Login failed: ${err.message}`);
      console.error('Login error:', err);
    }
  };

  const logout = () => {
    FyersService.logout();
    setIsAuthenticated(false);
    setUserProfile(null);
    setError(null);
  };

  const clearError = () => setError(null);

  return { isAuthenticated, loading, error, userProfile, login, logout, clearError, fyersService: FyersService };
};
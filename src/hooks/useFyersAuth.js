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
    
    // Check if already authenticated
    const token = localStorage.getItem('fyers_access_token');
    if (token) {
      console.log('Found existing token, setting authenticated state');
      FyersService.accessToken = token;
      setIsAuthenticated(true);
      fetchUserProfile();
    }

    // Handle callback from Fyers - check for auth code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const state = urlParams.get('state');
    const storedState = localStorage.getItem('fyers_state');

    console.log('URL Params check:');
    console.log('- Auth Code:', authCode ? 'Present' : 'Missing');
    console.log('- State:', state);
    console.log('- Stored State:', storedState);
    console.log('- Already Processed:', authCodeProcessed.current);

    // Handle callback on any page if auth code is present and not already processed
    if (authCode && !authCodeProcessed.current) {
      authCodeProcessed.current = true; // Mark as being processed
      
      if (state && state === storedState) {
        console.log('✅ State validation passed, processing auth code');
        handleAuthCallback(authCode);
      } else {
        console.error('❌ State validation failed');
        setError('Invalid state parameter. Please try logging in again.');
      }
    } else if (authCode && authCodeProcessed.current) {
      console.log('⚠️ Auth code already processed, skipping');
    }
  }, []);

  const fetchUserProfile = async () => {
    try {
      const profile = await FyersService.getProfile();
      setUserProfile(profile);
    } catch (err) {
      console.error('Error fetching user profile:', err);
      // Don't set error for profile fetch failure
    }
  };

  const handleAuthCallback = async (authCode) => {
    console.log('=== HANDLE AUTH CALLBACK START ===');
    console.log('Received auth code:', authCode);
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Calling FyersService.getAccessToken...');
      await FyersService.getAccessToken(authCode);
      
      console.log('✅ Token exchange successful');
      setIsAuthenticated(true);
      
      // Fetch user profile
      console.log('Fetching user profile...');
      await fetchUserProfile();
      
      // Clean up URL
      console.log('Cleaning up URL and state...');
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Clean up state
      localStorage.removeItem('fyers_state');
      
      console.log('✅ Authentication flow completed successfully');
      
    } catch (err) {
      console.error('❌ Authentication callback error:', err);
      setError(err.message);
      console.error('Authentication error:', err);
    } finally {
      setLoading(false);
    }
  };

  const login = () => {
    setError(null);
    try {
      const authUrl = FyersService.getAuthUrl();
      console.log('Fyers Auth URL:', authUrl);
      
      if (!authUrl) {
        setError('Failed to generate auth URL');
        return;
      }
      
      // Add a small delay to ensure state is updated
      setTimeout(() => {
        window.location.href = authUrl;
      }, 100);
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

  const clearError = () => {
    setError(null);
  };

  return {
    isAuthenticated,
    loading,
    error,
    userProfile,
    login,
    logout,
    clearError,
    fyersService: FyersService
  };
};
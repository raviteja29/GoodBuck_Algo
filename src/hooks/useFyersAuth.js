import { useState, useEffect } from 'react';
import FyersService from '../services/FyersService';

export const useFyersAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    // Check if already authenticated
    const token = localStorage.getItem('fyers_access_token');
    if (token) {
      FyersService.accessToken = token;
      setIsAuthenticated(true);
      fetchUserProfile();
    }

    // Handle callback from Fyers - check for auth code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get('code');
    const state = urlParams.get('state');
    const storedState = localStorage.getItem('fyers_state');

    // Handle callback on any page if auth code is present
    if (authCode) {
      if (state && state === storedState) {
        handleAuthCallback(authCode);
      } else {
        setError('Invalid state parameter. Please try logging in again.');
      }
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
    setLoading(true);
    setError(null);
    
    try {
      await FyersService.getAccessToken(authCode);
      setIsAuthenticated(true);
      
      // Fetch user profile
      await fetchUserProfile();
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Clean up state
      localStorage.removeItem('fyers_state');
      
    } catch (err) {
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
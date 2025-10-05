import React from 'react';
import { useFyersAuth } from '../hooks/useFyersAuth';
import './FyersTest.css';

const FyersTest = () => {
  const { 
    isAuthenticated, 
    login, 
    logout, 
    error, 
    userProfile, 
    fyersService,
    loading 
  } = useFyersAuth();

  const testHistoricalData = async () => {
    if (!isAuthenticated) {
      alert('Please login to Fyers first');
      return;
    }

    try {
      console.log('Testing Fyers historical data...');
      
      // Test with NIFTY option data
      const fromDate = '2024-09-01';
      const toDate = '2024-09-30';
      const symbol = 'NSE:NIFTY2410124400CE'; // Example NIFTY option symbol
      
      const data = await fyersService.getHistoricalData(symbol, fromDate, toDate, '15');
      console.log('Historical data received:', data);
      alert(`Successfully fetched ${data.length} data points for ${symbol}`);
      
    } catch (error) {
      console.error('Error fetching historical data:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const testOptionChain = async () => {
    if (!isAuthenticated) {
      alert('Please login to Fyers first');
      return;
    }

    try {
      console.log('Testing Fyers option chain...');
      const optionChain = await fyersService.getOptionChain('NSE:NIFTY50-INDEX', 5);
      console.log('Option chain received:', optionChain);
      alert('Option chain fetched successfully! Check console for details.');
    } catch (error) {
      console.error('Error fetching option chain:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const testMarketStatus = async () => {
    if (!isAuthenticated) {
      alert('Please login to Fyers first');
      return;
    }

    try {
      console.log('Testing market status...');
      const status = await fyersService.getMarketStatus();
      console.log('Market status:', status);
      alert('Market status fetched successfully! Check console for details.');
    } catch (error) {
      console.error('Error fetching market status:', error);
      alert(`Error: ${error.message}`);
    }
  };

  return (
    <div className="fyers-test-container">
      <div className="fyers-test-card">
        <h1>🚀 Fyers API Test Page</h1>
        
        {/* Authentication Status */}
        <div className="auth-section">
          <h2>Authentication Status</h2>
          <div className={`status-indicator ${isAuthenticated ? 'connected' : 'disconnected'}`}>
            {isAuthenticated ? '🟢 Connected to Fyers' : '🔴 Not Connected'}
          </div>
          
          {isAuthenticated && userProfile && (
            <div className="user-info">
              <p><strong>User:</strong> {userProfile.name || userProfile.fy_id}</p>
              <p><strong>Email:</strong> {userProfile.email_id || 'N/A'}</p>
            </div>
          )}
          
          {error && (
            <div className="error-message">
              <p><strong>Error:</strong> {error}</p>
            </div>
          )}
        </div>

        {/* Authentication Controls */}
        <div className="auth-controls">
          {!isAuthenticated ? (
            <button 
              onClick={login} 
              disabled={loading}
              className="login-btn"
            >
              {loading ? 'Connecting...' : '🔐 Login to Fyers'}
            </button>
          ) : (
            <button onClick={logout} className="logout-btn">
              🚪 Logout from Fyers
            </button>
          )}
        </div>

        {/* API Test Section */}
        {isAuthenticated && (
          <div className="test-section">
            <h2>API Testing</h2>
            <div className="test-buttons">
              <button onClick={testHistoricalData} className="test-btn">
                📈 Test Historical Data
              </button>
              <button onClick={testOptionChain} className="test-btn">
                🔗 Test Option Chain
              </button>
              <button onClick={testMarketStatus} className="test-btn">
                📊 Test Market Status
              </button>
            </div>
            
            <div className="test-info">
              <h3>Test Details:</h3>
              <ul>
                <li><strong>Historical Data:</strong> Fetches NIFTY option data for Sep 2024</li>
                <li><strong>Option Chain:</strong> Gets NIFTY50 option chain with 5 strikes</li>
                <li><strong>Market Status:</strong> Checks current market hours and status</li>
              </ul>
              <p><em>Check browser console for detailed API responses</em></p>
            </div>
          </div>
        )}

        {/* Configuration Info */}
        <div className="config-section">
          <h2>Configuration</h2>
          <div className="config-info">
            <p><strong>Client ID:</strong> {import.meta.env.VITE_FYERS_CLIENT_ID}</p>
            <p><strong>Redirect URL:</strong> {import.meta.env.VITE_FYERS_REDIRECT_URL}</p>
            <p><strong>Base URL:</strong> {import.meta.env.VITE_FYERS_BASE_URL}</p>
          </div>
        </div>

        {/* Instructions */}
        <div className="instructions-section">
          <h2>📋 Testing Instructions</h2>
          <ol>
            <li><strong>Login:</strong> Click "Login to Fyers" button</li>
            <li><strong>Authorize:</strong> Complete OAuth flow on Fyers website</li>
            <li><strong>Test APIs:</strong> Use the test buttons to verify functionality</li>
            <li><strong>Check Console:</strong> View detailed API responses in browser console</li>
          </ol>
          
          <div className="note">
            <p><strong>Note:</strong> Make sure your Fyers app registration includes the redirect URL: 
            <code>{import.meta.env.VITE_FYERS_REDIRECT_URL}</code></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FyersTest;
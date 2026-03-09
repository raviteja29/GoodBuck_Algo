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

  const directLogin = () => {
    try {
      console.log('=== DIRECT LOGIN DEBUG START ===');
      
      // Check environment variables
      const clientId = import.meta.env.VITE_FYERS_CLIENT_ID;
      const redirectUrl = import.meta.env.VITE_FYERS_REDIRECT_URL;
      
      console.log('Environment check:');
      console.log('Client ID:', clientId);
      console.log('Redirect URL:', redirectUrl);
      console.log('All env vars:', import.meta.env);
      
      if (!clientId || !redirectUrl) {
        const error = `Missing environment variables - ClientID: ${clientId}, RedirectURL: ${redirectUrl}`;
        console.error(error);
        alert(error);
        return;
      }
      
      const state = Math.random().toString(36).substring(2, 15);
      console.log('Generated state:', state);
      
      // Store state in localStorage for validation
      localStorage.setItem('fyers_state', state);
      
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUrl,
        response_type: 'code',
        state: state,
        scope: 'openid profile api-v3'
      });

      const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?${params.toString()}`;
      console.log('Final Auth URL:', authUrl);
      
      // Add visual feedback
      alert(`About to redirect to: ${authUrl}`);
      
      // Try multiple redirect approaches
      console.log('Attempting redirect...');
      
      // Method 1: Direct assignment
      window.location.href = authUrl;
      
      // Fallback method in case above doesn't work
      setTimeout(() => {
        console.log('Fallback redirect method...');
        window.location.replace(authUrl);
      }, 1000);
      
    } catch (error) {
      console.error('Direct login error:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Simple URL test - just open the URL in new tab to verify it works
  const testFyersUrl = () => {
    console.log('=== TEST FYERS URL FUNCTION CALLED ===');
    alert('Test URL button clicked!'); // Basic test to see if function runs
    
    try {
      console.log('=== TEST URL FUNCTION START ===');
      
      const clientId = import.meta.env.VITE_FYERS_CLIENT_ID;
      const redirectUrl = import.meta.env.VITE_FYERS_REDIRECT_URL;
      
      console.log('Environment variables:');
      console.log('Client ID:', clientId);
      console.log('Redirect URL:', redirectUrl);
      
      if (!clientId || !redirectUrl) {
        const error = 'Missing environment variables';
        console.error(error);
        alert(error);
        return;
      }
      
      const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&state=test&scope=openid%20profile%20api-v3`;
      
      console.log('Constructed URL:', authUrl);
      console.log('Attempting to open URL in new tab...');
      
      // Try window.open first
      const newWindow = window.open(authUrl, '_blank', 'noopener,noreferrer');
      
      if (newWindow) {
        console.log('✅ New window opened successfully');
        alert('New tab opened! Check for the Fyers login page.');
      } else {
        console.log('❌ window.open failed - likely blocked by popup blocker');
        alert('Popup blocked! Click OK to copy URL to clipboard and open manually.');
        
        // Fallback: copy to clipboard
        if (navigator.clipboard) {
          navigator.clipboard.writeText(authUrl).then(() => {
            console.log('URL copied to clipboard');
            alert(`URL copied to clipboard! Paste it in a new tab:\n\n${authUrl}`);
          }).catch(() => {
            console.log('Clipboard access failed');
            alert(`Please manually copy this URL:\n\n${authUrl}`);
          });
        } else {
          alert(`Please manually copy this URL:\n\n${authUrl}`);
        }
      }
      
    } catch (error) {
      console.error('testFyersUrl error:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Copy URL to clipboard
  const copyUrlToClipboard = () => {
    console.log('=== COPY URL FUNCTION CALLED ===');
    alert('Copy URL button clicked!'); // Basic test to see if function runs
    
    try {
      const clientId = import.meta.env.VITE_FYERS_CLIENT_ID;
      const redirectUrl = import.meta.env.VITE_FYERS_REDIRECT_URL;
      
      console.log('Copy URL - Client ID:', clientId);
      console.log('Copy URL - Redirect URL:', redirectUrl);
      
      if (!clientId || !redirectUrl) {
        alert('Missing environment variables!');
        return;
      }
      
      const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&state=test&scope=openid%20profile%20api-v3`;
      
      console.log('Copy URL - Auth URL:', authUrl);
      
      if (navigator.clipboard) {
        navigator.clipboard.writeText(authUrl).then(() => {
          console.log('URL copied successfully');
          alert('URL copied to clipboard! Paste it in a new browser tab.');
        }).catch((err) => {
          console.error('Clipboard write failed:', err);
          alert(`Clipboard failed. Manual copy:\n\n${authUrl}`);
        });
      } else {
        console.log('Clipboard API not available');
        alert(`Clipboard not available. Manual copy:\n\n${authUrl}`);
      }
    } catch (error) {
      console.error('copyUrlToClipboard error:', error);
      alert(`Error in copy function: ${error.message}`);
    }
  };

  // Show URL on page
  const showUrlOnPage = () => {
    console.log('=== SHOW URL FUNCTION CALLED ===');
    alert('Show URL button clicked!'); // Basic test to see if function runs
    
    try {
      const clientId = import.meta.env.VITE_FYERS_CLIENT_ID;
      const redirectUrl = import.meta.env.VITE_FYERS_REDIRECT_URL;
      
      console.log('Show URL - Client ID:', clientId);
      console.log('Show URL - Redirect URL:', redirectUrl);
      
      if (!clientId || !redirectUrl) {
        alert('Missing environment variables!');
        return;
      }
      
      const authUrl = `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUrl)}&response_type=code&state=test&scope=openid%20profile%20api-v3`;
      
      console.log('Show URL - Auth URL:', authUrl);
      
      // Create a text area to display the URL
      const urlDisplay = document.getElementById('url-display');
      console.log('URL Display element:', urlDisplay);
      
      if (urlDisplay) {
        urlDisplay.value = authUrl;
        urlDisplay.style.display = 'block';
        urlDisplay.select();
        console.log('URL displayed successfully');
        alert('URL is now visible in the text area below!');
      } else {
        console.error('url-display element not found');
        alert('Text area not found! URL: ' + authUrl);
      }
    } catch (error) {
      console.error('showUrlOnPage error:', error);
      alert(`Error in show URL function: ${error.message}`);
    }
  };

  // Very simple test function to verify buttons work
  const simpleTest = () => {
    console.log('Simple test function called');
    alert('Simple test button works!');
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
            <div>
              <button 
                onClick={login} 
                disabled={loading}
                className="login-btn"
              >
                {loading ? 'Connecting...' : '🔐 Login to Fyers'}
              </button>
              
              <button 
                onClick={directLogin}
                className="login-btn"
                style={{ marginLeft: '1rem', background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                🚀 Direct Login
              </button>
              
              <button 
                onClick={testFyersUrl}
                className="login-btn"
                style={{ marginLeft: '1rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
              >
                🧪 Test URL (New Tab)
              </button>
              
              <br /><br />
              
              {/* Simple test button */}
              <button 
                onClick={simpleTest}
                className="login-btn"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
              >
                🔥 Simple Test
              </button>
              
              {/* Additional debugging buttons */}
              <button 
                onClick={copyUrlToClipboard}
                className="login-btn"
                style={{ marginLeft: '1rem', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}
              >
                📋 Copy URL
              </button>
              
              <button 
                onClick={showUrlOnPage}
                className="login-btn"
                style={{ marginLeft: '1rem', background: 'linear-gradient(135deg, #06b6d4, #0891b2)' }}
              >
                👁️ Show URL
              </button>
              
              {/* URL Display Area */}
              <textarea 
                id="url-display"
                style={{ 
                  width: '100%', 
                  height: '100px', 
                  marginTop: '1rem', 
                  display: 'none', 
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px'
                }}
                readOnly
                placeholder="Fyers auth URL will appear here..."
              />
            </div>
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
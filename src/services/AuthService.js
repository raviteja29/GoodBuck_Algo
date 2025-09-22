// src/services/AuthService.js
import { KiteConnect } from 'kiteconnect';

class AuthService {
  getAccessToken() {
    return localStorage.getItem('access_token');
  }
  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_name');
    localStorage.removeItem('login_time');
  }
  isAuthenticated() {
    return !!localStorage.getItem('access_token');
  }

  getUserInfo() {
    return {
      user_id: localStorage.getItem('user_id'),
      user_name: localStorage.getItem('user_name'),
      login_time: localStorage.getItem('login_time'),
      access_token: localStorage.getItem('access_token'),
    };
  }
  constructor() {
    this.apiKey = import.meta.env.VITE_KITE_API_KEY;
  }

  getLoginUrl() {
    return `https://kite.zerodha.com/connect/login?v=3&api_key=${this.apiKey}`;
  }


  async generateSession(requestToken) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`Attempt ${retryCount + 1} to generate session...`);
        
        const response = await fetch('http://localhost:5000/api/generate_session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request_token: requestToken }),
          // Add timeout of 30 seconds
          signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Session generation failed:', errorData);
          throw new Error(errorData.error || 'Session generation failed');
        }

        const data = await response.json();
        
        // Validate required fields
        if (!data.access_token) {
          throw new Error('Invalid response: missing access token');
        }

        // Store session data
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('user_id', data.user_id || '');
        localStorage.setItem('user_name', data.user_name || '');
        localStorage.setItem('login_time', new Date().toISOString());
        
        console.log('Session generated successfully');
        return data;
        
      } catch (error) {
        retryCount++;
        console.error(`Session generation attempt ${retryCount} failed:`, error);
        
        if (retryCount === maxRetries) {
          throw new Error(`Failed to generate session after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retrying (1 second * retry number)
        await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
      }
    }
  }
}

export default new AuthService();

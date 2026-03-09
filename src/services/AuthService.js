// src/services/AuthService.js

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
    console.log('[AuthService] Starting session generation with requestToken:', requestToken);
    const response = await fetch('https://goodbuck-algo.onrender.com/api/generate_session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_token: requestToken })
    });
    if (!response.ok) {
      const err = await response.json();
      console.error('[AuthService] Session generation failed:', err);
      throw new Error(err.error || 'Session generation failed');
    }
    const data = await response.json();
    console.log('[AuthService] Session data received from backend:', data);
    if (!data.access_token) {
      console.error('[AuthService] No access_token in backend response:', data);
      throw new Error('No access_token received from backend');
    }
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('user_id', data.user_id);
    localStorage.setItem('user_name', data.user_name);
    localStorage.setItem('login_time', new Date().toISOString());
    console.log('[AuthService] access_token stored in localStorage:', localStorage.getItem('access_token'));
    return data;
  }

}

export default new AuthService();

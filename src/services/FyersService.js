// Browser-compatible Fyers API implementation
// Based on official fyers-api-v3 documentation but adapted for browser use

class FyersService {
  constructor() {
    // Configuration from environment variables
    this.clientId = import.meta.env.VITE_FYERS_CLIENT_ID;
    this.clientSecret = import.meta.env.VITE_FYERS_CLIENT_SECRET;
    this.redirectUrl = import.meta.env.VITE_FYERS_REDIRECT_URL;
    // Separate bases as per docs
    this.apiBase = 'https://api-t1.fyers.in/api/v3';
    this.dataBase = 'https://api-t1.fyers.in/data';

    console.log('=== FYERS SERVICE INITIALIZATION ===');
    console.log('Client ID:', this.clientId);
    console.log('Client Secret:', this.clientSecret ? 'Present' : 'Missing');
    console.log('Redirect URL:', this.redirectUrl);

    // Check for existing combined token (should be clientId:access_token)
    const savedToken = localStorage.getItem('fyers_access_token');
    this.accessToken = savedToken;
    this.refreshToken = localStorage.getItem('fyers_refresh_token') || null;
    this.expiryEpoch = parseInt(localStorage.getItem('fyers_access_expiry')||'0',10) || 0; // seconds epoch
    this.refreshInFlight = null; // promise singleton
    this.earlyRefreshSeconds = 120; // refresh 2 min early
    if (savedToken) {
      console.log('Found saved access token (length):', savedToken.length);
    }
  }

  // Step 1: Generate authorization URL (based on SDK pattern)
  getAuthUrl() {
    console.log('=== GENERATING AUTH URL ===');
    try {
      const state = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('fyers_state', state);
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: this.redirectUrl,
        response_type: 'code',
        state: state
      });
      const authUrl = `${this.apiBase}/generate-authcode?${params.toString()}`;
      console.log('Generated Auth URL:', authUrl);
      return authUrl;
    } catch (error) {
      console.error('Error generating auth URL:', error);
      throw error;
    }
  }

  // Step 2: Exchange auth code for access token (official flow)
  async getAccessToken(authCode) {
    console.log('=== GETTING ACCESS TOKEN ===');
    if (authCode) {
      console.log('Auth code length:', authCode.length, 'Starts with:', authCode.slice(0, 15), 'Ends with:', authCode.slice(-10));
    }
    try {
      if (!this.clientId || !this.clientSecret) throw new Error('Missing Client ID or Client Secret');

      const appIdHash = await this.createAppIdHash();
      console.log('AppIdHash generated (first 12):', appIdHash.slice(0, 12));

      const body = { grant_type: 'authorization_code', appIdHash, code: authCode };
      console.log('POST /validate-authcode body keys:', Object.keys(body));

      const response = await fetch(`${this.apiBase}/validate-authcode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      console.log('Token exchange HTTP status:', response.status);
      const data = await response.json().catch(() => ({ s: 'error', message: 'Invalid JSON in response' }));
      console.log('Raw token exchange response keys:', Object.keys(data));

      if (data.s === 'ok' && data.access_token) {
        this._storeTokens(data);
        return this.accessToken;
      }

      // Provide enriched diagnostics for common -437
      if (data.code === -437) {
        const hints = [
          'Auth code may have been already used (single-use). Retry full login.',
            'State mismatch or page reloaded causing duplicate usage.',
            'Ensure you are using the query param name "code" (not auth_code).',
            'Check that appIdHash is SHA-256 of "client_id:client_secret" (with colon).',
            'Auth code expires quickly. Complete exchange immediately after redirect.'
        ];
        console.error('❌ Error -437 (invalid auth code). Hints:', hints);
      }
      throw new Error(data.message || 'Token exchange failed');
    } catch (err) {
      console.error('❌ Error getting access token:', err);
      throw err;
    }
  }
  _storeTokens(data){
    // data.access_token is raw token part; combine with clientId for auth header usage
    this.accessToken = `${this.clientId}:${data.access_token}`;
    localStorage.setItem('fyers_access_token', this.accessToken);
    if (data.refresh_token){
      this.refreshToken = data.refresh_token;
      localStorage.setItem('fyers_refresh_token', data.refresh_token);
    }
    // Attempt to decode JWT part (after colon) to extract exp
    try {
      const raw = data.access_token; // second part after clientId:
      const parts = raw.split('.');
      if (parts.length===3){
        const payload = JSON.parse(atob(parts[1]));
        if (payload.exp){
          this.expiryEpoch = payload.exp; // already in seconds
          localStorage.setItem('fyers_access_expiry', String(this.expiryEpoch));
        }
      }
    } catch(e){ console.warn('Could not parse token exp:', e.message); }
  }
  _isExpiringSoon(){
    if (!this.expiryEpoch) return false;
    const nowSec = Math.floor(Date.now()/1000);
    return (this.expiryEpoch - nowSec) < this.earlyRefreshSeconds;
  }
  async refreshAccessToken(force=false){
    if (!this.refreshToken){ throw new Error('No refresh token available'); }
    if (this.refreshInFlight) return this.refreshInFlight; // dedupe
    if (!force && !this._isExpiringSoon()) return this.accessToken;
    console.log('[FYERS] Refreshing access token...');
    const appIdHash = await this.createAppIdHash();
    const body = { grant_type: 'refresh_token', appIdHash, refresh_token: this.refreshToken };
    const p = fetch(`${this.apiBase}/validate-refresh-token`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
      .then(r=>r.json())
      .then(data=>{
        if (data.s==='ok' && data.access_token){
          this._storeTokens(data);
          console.log('[FYERS] Refresh successful');
          return this.accessToken;
        }
        throw new Error(data.message || 'Refresh failed');
      })
      .catch(e=>{ console.error('[FYERS] Refresh error', e); throw e; })
      .finally(()=>{ this.refreshInFlight = null; });
    this.refreshInFlight = p;
    return p;
  }

  isAuthenticated() { return !!this.accessToken; }

  logout() {
    this.accessToken = null;
    localStorage.removeItem('fyers_access_token');
    localStorage.removeItem('fyers_refresh_token');
    localStorage.removeItem('fyers_state');
    localStorage.removeItem('fyers_access_expiry');
    console.log('Logged out and cleared tokens');
  }

  // Unified GET helper for API (trading/user) vs Data endpoints
  async _authedGet(url, isData = false, retry=true) {
    if (!this.isAuthenticated()) throw new Error('Not authenticated');
    if (this._isExpiringSoon()) {
      try { await this.refreshAccessToken(); } catch(e){ console.warn('Pre-request refresh failed:', e.message); }
    }
    const full = `${isData ? this.dataBase : this.apiBase}${url}`;
    let r = await fetch(full, { headers: { 'Authorization': this.accessToken, 'Content-Type': 'application/json' } });
    if (r.status===401 && retry && this.refreshToken){
      // attempt refresh then retry once
      try { await this.refreshAccessToken(true); } catch(_){}
      r = await fetch(full, { headers: { 'Authorization': this.accessToken, 'Content-Type': 'application/json' } });
    }
    const json = await r.json();
    if (json.code && [-8,-15,-16,-17].includes(json.code) && retry && this.refreshToken){
      try { await this.refreshAccessToken(true); } catch(_){}
      return this._authedGet(url, isData, false);
    }
    if (json.s !== 'ok') throw new Error(json.message || 'Request failed');
    return json;
  }

  async getProfile() {
    console.log('=== GETTING PROFILE ===');
    const json = await this._authedGet('/profile');
    return json.data;
  }

  async getHistoricalData(symbol, fromDate, toDate, resolution = '15') {
    console.log('=== GETTING HISTORICAL DATA ===');
    if (!symbol) throw new Error('Symbol required');
    const params = new URLSearchParams({
      symbol,
      resolution: String(resolution),
      date_format: '1', // using epoch seconds
      range_from: Math.floor(new Date(fromDate).getTime() / 1000),
      range_to: Math.floor(new Date(toDate).getTime() / 1000),
      cont_flag: ''
    });
    const json = await this._authedGet(`/history?${params}`, true);
    return this.formatHistoricalData(json.candles);
  }

  formatHistoricalData(candles) {
    if (!Array.isArray(candles)) return [];
    return candles.map(c => ({
      timestamp: new Date(c[0] * 1000).toISOString(),
      date: new Date(c[0] * 1000).toLocaleDateString(),
      open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
    }));
  }

  async getQuotes(symbols) {
    console.log('=== GETTING QUOTES ===');
    const symbolsParam = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const json = await this._authedGet(`/quotes?symbols=${encodeURIComponent(symbolsParam)}`, true);
    return json.d;
  }

  async getOptionChain(symbol, strikeCount = 10) {
    console.log('=== GETTING OPTION CHAIN ===');
    const params = new URLSearchParams({ symbol, strikecount: strikeCount });
    const json = await this._authedGet(`/options-chain-v3?${params}`, true);
    return json.data || json;
  }

  async getMarketStatus() {
    console.log('=== GETTING MARKET STATUS ===');
    const json = await this._authedGet('/marketStatus', true);
    return json.marketStatus || json.data;
  }

  // Correct weekly expiry month encoding (Fyers weekly uses month char: 1..9,O,N,D)
  _weeklyMonthChar(date){
    const m = date.getMonth();
    return ['1','2','3','4','5','6','7','8','9','O','N','D'][m];
  }
  buildOptionSymbol(underlying, expiry, strike, optionType) {
    const year = expiry.getFullYear().toString().slice(-2);
    const monthChar = this._weeklyMonthChar(expiry); // weekly code
    const day = expiry.getDate().toString().padStart(2,'0');
    const type = optionType === 'CE' ? 'C' : 'P';
    // Underlying example: NIFTY; result: NSE:NIFTY25O02C20000
    return `NSE:${underlying}${year}${monthChar}${day}${type}${strike}`;
  }

  async getOptionData(underlying, expiry, strike, optionType, fromDate, toDate, resolution = '15') {
    const symbol = this.buildOptionSymbol(underlying, expiry, strike, optionType);
    return this.getHistoricalData(symbol, fromDate, toDate, resolution);
  }

  getWeeklyExpiryDates() {
    const today = new Date();
    const thursday = new Date(today);
    const daysUntilThursday = (4 - today.getDay() + 7) % 7;
    if (daysUntilThursday === 0 && today.getHours() >= 15) thursday.setDate(today.getDate() + 7); else thursday.setDate(today.getDate() + daysUntilThursday);
    const nextThursday = new Date(thursday); nextThursday.setDate(thursday.getDate() + 7);
    return { currentWeek: thursday, nextWeek: nextThursday };
  }
}

export default new FyersService();
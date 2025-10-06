// Browser-compatible Fyers API implementation
// Based on official fyers-api-v3 documentation but adapted for browser use

class FyersService {
  constructor() {
    // Configuration from environment variables
    this.clientId = import.meta.env.VITE_FYERS_CLIENT_ID;
    this.clientSecret = import.meta.env.VITE_FYERS_CLIENT_SECRET; // Will be deprecated client-side
    this.redirectUrl = import.meta.env.VITE_FYERS_REDIRECT_URL;
    this.allowDirectFallback = import.meta.env.VITE_FYERS_DIRECT_FALLBACK === '1';
    // Separate bases as per docs
    this.apiBase = 'https://api-t1.fyers.in/api/v3';
    this.dataBase = 'https://api-t1.fyers.in/data';

    console.log('=== FYERS SERVICE INITIALIZATION ===');
    console.log('Client ID:', this.clientId);
    if (this.clientSecret) {
      console.warn('[FYERS][SECURITY] clientSecret is present in frontend bundle. Remove VITE_FYERS_CLIENT_SECRET from env for production.');
    }
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
  async createAppIdHash() {
    if (!this.allowDirectFallback) {
      throw new Error('Direct fallback disabled');
    }
    if (!this.clientSecret) throw new Error('No client secret (fallback disabled)');
    // Browser hashing for fallback (will be removed once fully proxy-based)
    const text = `${this.clientId}:${this.clientSecret}`;
    const enc = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }

  // Step 1: Generate authorization URL (based on SDK pattern)
  async getAuthUrl() {
    // Prefer backend proxy auth URL; fallback only if it fails
    try {
      const resp = await fetch('/api/fyers/login-url', { cache: 'no-store' });
      if (resp.ok) {
        const j = await resp.json();
        if (j && j.url && j.state) {
          localStorage.setItem('fyers_state', j.state);
          console.log('[FYERS] Using proxy auth URL');
          return j.url;
        }
        console.warn('[FYERS] Proxy login-url malformed response, falling back');
      } else {
        console.warn('[FYERS] Proxy login-url failed status', resp.status);
      }
    } catch (e) {
      console.warn('[FYERS] Proxy login-url network error:', e.message);
    }
    console.log('[FYERS] Falling back to direct auth URL construction');
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('fyers_state', state);
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUrl,
      response_type: 'code',
      state
    });
    return `${this.apiBase}/generate-authcode?${params.toString()}`;
  }

  // Step 2: Exchange auth code for access token (official flow)
  async getAccessToken(authCode) {
    if (!authCode) throw new Error('Missing auth code');
    // Single-use guard via sessionStorage
    const guardKey = `fyers_code_${authCode}`;
    if (sessionStorage.getItem(guardKey)) {
      throw new Error('Auth code already processed (guard)');
    }
    sessionStorage.setItem(guardKey, '1');
    // Proxy attempt first
    let lastError = null;
    try {
      const proxyResp = await fetch('/api/fyers/validate-authcode', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ code: authCode }) });
      if (proxyResp.ok) {
        const data = await proxyResp.json();
        if (data.s==='ok' && data.access_token){ this._storeTokens(data); return this.accessToken; }
        lastError = new Error(data.message || 'Proxy exchange failed');
        if (data.code === -437) { lastError.code = -437; throw lastError; }
      } else {
        let errPayload = null;
        try { errPayload = await proxyResp.json(); } catch(_) {}
        const msg = errPayload?.message || errPayload?.error || `Proxy status ${proxyResp.status}`;
        lastError = new Error(msg);
        if (errPayload && errPayload.code === -437) { lastError.code = -437; }
      }
    } catch (e) {
      lastError = e;
      if (/already processed/.test(e.message)) throw e;
    }
    // Decide on fallback: only if we have clientSecret and error wasn't invalid auth code
    if (lastError && (lastError.code === -437 || /-437|invalid auth code/i.test(lastError.message))) {
      console.warn('[FYERS] Not attempting direct fallback because code appears invalid/used');
      throw new Error('invalid auth code');
    }
    if (!this.clientSecret || !this.allowDirectFallback) {
      console.warn('[FYERS] Direct fallback disabled (no secret or flag off)');
      throw lastError || new Error('Proxy exchange failed');
    }
    console.log('[FYERS] Attempting direct exchange fallback');
    const appIdHash = await this.createAppIdHash();
    const body = { grant_type: 'authorization_code', appIdHash, code: authCode };
    const response = await fetch(`${this.apiBase}/validate-authcode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(()=>({ s:'error', message:'Invalid JSON' }));
    if (data.s==='ok' && data.access_token){ this._storeTokens(data); return this.accessToken; }
    if (data.code === -437) {
      console.error('❌ Error -437 (invalid auth code) on direct fallback.');
      throw new Error('invalid auth code');
    }
    throw new Error(data.message || 'Token exchange failed');
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
    if (this.refreshInFlight) return this.refreshInFlight;
    if (!force && !this._isExpiringSoon()) return this.accessToken;
    // Prefer proxy
    const attempt = async () => {
      try {
        const r = await fetch('/api/fyers/refresh-token', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ refresh_token: this.refreshToken }) });
        if (r.ok){ const data = await r.json(); if (data.s==='ok' && data.access_token){ this._storeTokens(data); return this.accessToken; } }
        throw new Error('Proxy refresh failed');
      } catch(e){
        // Fallback direct
        const appIdHash = await this.createAppIdHash();
        const body = { grant_type: 'refresh_token', appIdHash, refresh_token: this.refreshToken };
        const direct = await fetch(`${this.apiBase}/validate-refresh-token`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const data = await direct.json();
        if (data.s==='ok' && data.access_token){ this._storeTokens(data); return this.accessToken; }
        throw new Error(data.message || 'Refresh failed');
      }
    };
    this.refreshInFlight = attempt().finally(()=>{ this.refreshInFlight = null; });
    return this.refreshInFlight;
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
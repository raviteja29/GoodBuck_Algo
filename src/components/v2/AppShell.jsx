import React, { useEffect, useState } from 'react';
import StrategyService from '../../services/StrategyService';

const Icon = {
  strategies: (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></svg>
  ),
  backtests: (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></svg>
  ),
  live: (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>
  ),
  performance: (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0A84FF" strokeWidth="2" strokeLinecap="round"><path d="M6 20V10" /><path d="M12 20V4" /><path d="M18 20v-7" /></svg>
  ),
  alerts: (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21h4" /></svg>
  ),
};

// Live and Alerts arrive in later phases; they stay visible so the shape of the app is clear.
const NAV = [
  { id: 'strategies', label: 'Strategies' },
  { id: 'backtests', label: 'Backtests' },
  { id: 'live', label: 'Live', soon: 'Phase 3' },
  { id: 'performance', label: 'Performance' },
  { id: 'alerts', label: 'Alerts', soon: 'Phase 5' },
];

// NSE cash/F&O session in IST, weekdays. Holidays aren't known here.
function marketStatus(now = new Date()) {
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60000);
  const day = ist.getDay();
  const mins = ist.getHours() * 60 + ist.getMinutes();
  const open = day >= 1 && day <= 5 && mins >= 555 && mins < 930;
  return { open, label: open ? 'Market open' : 'Market closed' };
}

const timeIST = (ms) =>
  new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));

const AppShell = ({ section, onNavigate, onLogout, children }) => {
  const [market, setMarket] = useState(marketStatus());
  const [session, setSession] = useState(null);

  useEffect(() => {
    const tick = () => setMarket(marketStatus());
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => StrategyService.session().then((s) => alive && setSession(s)).catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div className="gb">
      <nav aria-label="Main" className="gb-nav">
        <div className="gb-brand">GoodBuck</div>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className="gb-nav-item"
            aria-current={section === item.id ? 'page' : undefined}
            disabled={!!item.soon}
            onClick={() => onNavigate(item.id)}
          >
            {Icon[item.id]}
            {item.label}
            {item.soon && <span className="gb-nav-soon">{item.soon}</span>}
          </button>
        ))}
        <div className="gb-nav-status" aria-label="Status">
          <span><span className="gb-dot" style={{ background: market.open ? '#30D158' : '#8E8E93' }} />{market.label}</span>
          <span>
            <span className="gb-dot" style={{ background: session?.loggedIn ? '#30D158' : '#FF9F0A' }} />
            {session?.loggedIn ? `Kite · until ${timeIST(session.expires_at)}` : 'Kite · not saved on server'}
          </span>
          <button type="button" className="gb-link-btn gb-nav-logout" onClick={onLogout}>Log out</button>
        </div>
      </nav>
      <main className="gb-main">{children}</main>
    </div>
  );
};

export default AppShell;

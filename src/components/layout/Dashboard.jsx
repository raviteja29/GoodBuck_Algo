import React, { useEffect, useState } from 'react';
import AppShell from '../v2/AppShell';
import StrategiesPage from '../v2/StrategiesPage';
import StrategyBuilder from '../v2/StrategyBuilder';
import StrategyHub from '../StrategyHub';
import TradingService from '../../services/TradingService';
import '../../styles/v2.css';

// The section lives in the URL hash so refresh and the browser back button work:
// #strategies, #strategies/new, #strategies/<id>, #backtests, #performance
const parseHash = () => {
  const [section = 'strategies', id = null] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { section: section || 'strategies', id };
};

const Dashboard = ({ onLogout }) => {
  const [route, setRoute] = useState(parseHash);
  const [backtestFor, setBacktestFor] = useState(null);

  // Order polling dispatches 'orderUpdate' events that StrategyHub listens to.
  useEffect(() => TradingService.startOrderPolling(10000), []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (section, id) => {
    window.location.hash = id ? `${section}/${id}` : section;
  };

  const openBacktest = (strategyId) => {
    setBacktestFor(strategyId);
    go('backtests');
  };

  let page;
  if (route.section === 'strategies' && route.id) {
    page = (
      <StrategyBuilder
        key={route.id}
        strategyId={route.id === 'new' ? null : route.id}
        onBack={(openId) => go('strategies', openId)}
        onSaved={(s) => { if (route.id === 'new') window.location.replace(`#strategies/${s.id}`); }}
        onBacktest={openBacktest}
      />
    );
  } else if (route.section === 'backtests') {
    page = (
      <div className="gb-legacy">
        <h1 className="gb-title" style={{ marginBottom: 12 }}>Backtests</h1>
        {backtestFor && (
          <div className="gb-note gb-note-info" style={{ marginBottom: 16 }}>
            <b>Saved strategies get server backtests in Phase 2</b>
            <span>Until then this lab runs the original Weekly Levels rules (the default config) in the browser.</span>
          </div>
        )}
        <StrategyHub key="backtests" initialTab="backtest" />
      </div>
    );
  } else if (route.section === 'performance') {
    page = (
      <div className="gb-legacy">
        <h1 className="gb-title" style={{ marginBottom: 12 }}>Performance</h1>
        <StrategyHub key="performance" initialTab="positions" />
      </div>
    );
  } else {
    page = (
      <StrategiesPage
        onOpen={(id) => go('strategies', id)}
        onNew={() => go('strategies', 'new')}
        onBacktest={openBacktest}
      />
    );
  }

  const section = ['backtests', 'performance'].includes(route.section) ? route.section : 'strategies';

  return (
    <AppShell section={section} onNavigate={(s) => go(s)} onLogout={onLogout}>
      {page}
    </AppShell>
  );
};

export default Dashboard;

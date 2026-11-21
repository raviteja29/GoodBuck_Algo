import React, { useEffect, useState } from 'react';
import AppShell from '../v2/AppShell';
import StrategiesPage from '../v2/StrategiesPage';
import StrategyBuilder from '../v2/StrategyBuilder';
import BacktestPage from '../v2/BacktestPage';
import StrategyHub from '../StrategyHub';
import TradingService from '../../services/TradingService';
import '../../styles/v2.css';

// The section lives in the URL hash so refresh and the browser back button work:
// #strategies, #strategies/new, #strategies/<id>, #backtests, #backtests/<strategyId>, #performance
const parseHash = () => {
  const [section = 'strategies', id = null, action = null] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { section: section || 'strategies', id, action };
};

const Dashboard = ({ onLogout }) => {
  const [route, setRoute] = useState(parseHash);

  // Order polling dispatches 'orderUpdate' events that StrategyHub listens to.
  useEffect(() => TradingService.startOrderPolling(10000), []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (section, id, action) => {
    window.location.hash = [section, id, action].filter(Boolean).join('/');
  };

  const openBacktest = (strategyId) => go('backtests', strategyId);

  let page;
  if (route.section === 'strategies' && route.id) {
    page = (
      <StrategyBuilder
        key={route.id}
        strategyId={route.id === 'new' ? null : route.id}
        onBack={(openId) => go('strategies', openId)}
        onSaved={(s) => { if (route.id === 'new') window.location.replace(`#strategies/${s.id}`); }}
        onBacktest={(id) => go('backtests', id, 'run')}
      />
    );
  } else if (route.section === 'backtests') {
    page = (
      <BacktestPage
        key={route.id || 'all'}
        initialStrategyId={route.id}
        autoRun={route.action === 'run'}
        onAutoRunStarted={() => window.location.replace(`#backtests/${route.id}`)}
        onEditStrategy={(id) => go('strategies', id)}
      />
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

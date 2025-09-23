import React, { useState, useEffect } from 'react';
import TradingService from '../services/TradingService';

const WebSocketDebugger = () => {
  const [logs, setLogs] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('unknown');
  const [tickCount, setTickCount] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Add log entry function
    const addLog = (type, message) => {
      const timestamp = new Date().toISOString();
      setLogs(prevLogs => {
        const newLogs = [...prevLogs, { timestamp, type, message }];
        // Keep only the latest 100 logs
        return newLogs.slice(-100);
      });
    };

    // Listen for connection status changes
    const unsubscribeStatus = TradingService.onConnectionStatusChange(status => {
      setConnectionStatus(status);
      addLog('status', `Connection status changed to: ${status}`);
    });

    // Subscribe to ticks to count them
    const unsubscribeTicks = TradingService.subscribeToTicks(ticks => {
      setTickCount(prev => prev + 1);
      if (Array.isArray(ticks) && ticks.length > 0) {
        try {
          // Handle tick data more safely
          const tickData = JSON.stringify(ticks[0], (key, value) => {
            // Limit the size of arrays to prevent log overflow
            if (Array.isArray(value) && value.length > 3) {
              return `[Array(${value.length})]`;
            }
            // Limit string length to prevent log overflow
            if (typeof value === 'string' && value.length > 100) {
              return value.substring(0, 100) + '...';
            }
            return value;
          });
          addLog('ticks', `Received ${ticks.length} ticks, first: ${tickData}`);
        } catch (jsonError) {
          addLog('error', `Error stringifying tick data: ${jsonError.message}`);
        }
      } else if (ticks && typeof ticks === 'object') {
        // Handle non-array tick data (quotes)
        addLog('ticks', `Received quote data for ${Object.keys(ticks).length} instruments`);
      }
    });

    // Add welcome log
    addLog('info', 'WebSocket debugger initialized');

    // Cleanup
    return () => {
      unsubscribeStatus();
      unsubscribeTicks();
    };
  }, []);

  // Manual reconnect handler
  const handleReconnect = () => {
    setLogs(prevLogs => [
      ...prevLogs, 
      { 
        timestamp: new Date().toISOString(), 
        type: 'action', 
        message: 'Manual reconnection initiated' 
      }
    ]);
    
    TradingService.setupWebSocket()
      .then(success => {
        setLogs(prevLogs => [
          ...prevLogs, 
          { 
            timestamp: new Date().toISOString(), 
            type: success ? 'success' : 'error', 
            message: success ? 'Reconnection successful' : 'Reconnection failed' 
          }
        ]);
      });
  };

  // Log type to color mapping
  const getLogColor = (type) => {
    switch (type) {
      case 'error': return '#ff4444';
      case 'status': return '#4499ff';
      case 'ticks': return '#44ff99';
      case 'action': return '#ffaa44';
      case 'success': return '#44ff99';
      default: return '#ffffff';
    }
  };

  if (!expanded) {
    return (
      <div 
        className="debugger-toggle"
        onClick={() => setExpanded(true)}
        style={{
          position: 'fixed',
          bottom: '10px',
          right: '10px',
          padding: '8px 12px',
          background: '#333',
          color: '#fff',
          borderRadius: '4px',
          fontSize: '12px',
          cursor: 'pointer',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <div
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: connectionStatus === 'connected' ? '#44ff99' : 
                       connectionStatus === 'connecting' ? '#ffaa44' : '#ff4444',
            boxShadow: `0 0 5px ${
              connectionStatus === 'connected' ? '#44ff99' : 
              connectionStatus === 'connecting' ? '#ffaa44' : '#ff4444'
            }`
          }}
        ></div>
        <span>WebSocket: {connectionStatus}</span>
        <span>Ticks: {tickCount}</span>
      </div>
    );
  }

  return (
    <div
      className="websocket-debugger"
      style={{
        position: 'fixed',
        bottom: '10px',
        right: '10px',
        width: '400px',
        height: '300px',
        background: '#222',
        color: '#eee',
        borderRadius: '6px',
        boxShadow: '0 0 10px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
        fontFamily: 'monospace',
        fontSize: '12px'
      }}
    >
      <div
        className="debugger-header"
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #444',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: connectionStatus === 'connected' ? '#44ff99' : 
                         connectionStatus === 'connecting' ? '#ffaa44' : '#ff4444',
              boxShadow: `0 0 5px ${
                connectionStatus === 'connected' ? '#44ff99' : 
                connectionStatus === 'connecting' ? '#ffaa44' : '#ff4444'
              }`
            }}
          ></div>
          <span>WebSocket: {connectionStatus}</span>
        </div>
        <div>
          <button
            onClick={handleReconnect}
            style={{
              background: '#444',
              border: 'none',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              marginRight: '8px',
              cursor: 'pointer'
            }}
          >
            Reconnect
          </button>
          <button
            onClick={() => setExpanded(false)}
            style={{
              background: '#444',
              border: 'none',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Minimize
          </button>
        </div>
      </div>
      <div
        className="debugger-body"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column-reverse'
        }}
      >
        {logs.slice().reverse().map((log, index) => (
          <div
            key={index}
            style={{
              padding: '4px 0',
              borderBottom: '1px solid #333',
              color: getLogColor(log.type)
            }}
          >
            <span style={{ color: '#999', marginRight: '8px' }}>
              {new Date(log.timestamp).toLocaleTimeString()}
            </span>
            <span style={{ textTransform: 'uppercase', marginRight: '8px' }}>
              [{log.type}]
            </span>
            <span>{log.message}</span>
          </div>
        ))}
      </div>
      <div
        className="debugger-footer"
        style={{
          padding: '8px',
          borderTop: '1px solid #444',
          display: 'flex',
          justifyContent: 'space-between'
        }}
      >
        <span>Ticks received: {tickCount}</span>
        <span>Logs: {logs.length}</span>
      </div>
    </div>
  );
};

export default WebSocketDebugger;
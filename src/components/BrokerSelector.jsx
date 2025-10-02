import React, { useState, useEffect } from 'react';
import './BrokerSelector.css';
import AuthService from '../services/AuthService-new';

const BrokerSelector = ({ onBrokerChange }) => {
  const [brokers, setBrokers] = useState([]);
  const [currentBroker, setCurrentBroker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    loadBrokers();
  }, []);

  const loadBrokers = async () => {
    try {
      setLoading(true);
      const data = await AuthService.initializeBrokers();
      setBrokers(data.brokers);
      setCurrentBroker(data.activeBroker);
    } catch (error) {
      console.error('Failed to load brokers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBrokerChange = async (brokerId) => {
    if (brokerId === currentBroker || switching) return;

    try {
      setSwitching(true);
      await AuthService.setBroker(brokerId);
      setCurrentBroker(brokerId);
      
      if (onBrokerChange) {
        onBrokerChange(brokerId);
      }
    } catch (error) {
      console.error('Failed to switch broker:', error);
      alert(`Failed to switch broker: ${error.message}`);
    } finally {
      setSwitching(false);
    }
  };

  if (loading) {
    return <div className="broker-selector loading">Loading brokers...</div>;
  }

  return (
    <div className="broker-selector">
      <label className="broker-selector-label">Select Broker:</label>
      <div className="broker-options">
        {brokers.map(broker => (
          <button
            key={broker.id}
            className={`broker-option ${currentBroker === broker.id ? 'active' : ''} ${!broker.isAvailable ? 'disabled' : ''}`}
            onClick={() => handleBrokerChange(broker.id)}
            disabled={!broker.isAvailable || switching}
            title={!broker.isAvailable ? 'Broker not configured' : ''}
          >
            <div className="broker-info">
              <span className="broker-name">{broker.name}</span>
              <span className="broker-status">
                {currentBroker === broker.id ? 'Active' : broker.isAvailable ? 'Available' : 'Not Configured'}
              </span>
            </div>
          </button>
        ))}
      </div>
      
      {switching && (
        <div className="switching-indicator">
          Switching broker...
        </div>
      )}
    </div>
  );
};

export default BrokerSelector;
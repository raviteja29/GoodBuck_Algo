import React, { useState, useEffect } from 'react';
import './OrderUpdates.css';

const OrderUpdates = ({ socketStatus }) => {
  const [orderUpdates, setOrderUpdates] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);

  // Listen for order updates from the WebSocket service
  useEffect(() => {
    // This will handle the custom event when an order update is received
    const handleOrderUpdate = (event) => {
      const update = event.detail;
      
      // Add the new update to the beginning of the list
      setOrderUpdates(prevUpdates => {
        // Keep only the last 10 updates to avoid cluttering the UI
        const newUpdates = [update, ...prevUpdates];
        if (newUpdates.length > 10) {
          return newUpdates.slice(0, 10);
        }
        return newUpdates;
      });
      
      // Set the last update time
      setLastUpdate(new Date());
    };

    // Add event listener for order updates
    window.addEventListener('orderUpdate', handleOrderUpdate);

    // Clean up the event listener when component unmounts
    return () => {
      window.removeEventListener('orderUpdate', handleOrderUpdate);
    };
  }, []);

  // Format the order status for display
  const getStatusClass = (status) => {
    if (!status) return '';
    
    switch (status.toLowerCase()) {
      case 'complete':
      case 'completed':
      case 'filled':
        return 'status-complete';
      case 'rejected':
      case 'cancelled':
        return 'status-rejected';
      case 'pending':
      case 'open':
      case 'trigger pending':
        return 'status-pending';
      default:
        return '';
    }
  };

  // Format the timestamp
  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    // Check if it's already a Date object
    const date = timestamp instanceof Date ? 
      timestamp : 
      new Date(timestamp);
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    
    return date.toLocaleTimeString();
  };

  // If there are no updates and WebSocket is disconnected, show a message
  if (orderUpdates.length === 0) {
    return (
      <div className="order-updates">
        <div className="order-updates-header">
          <h3>Order Updates</h3>
          <div className={`order-updates-status ${socketStatus === 'connected' ? 'status-connected' : 'status-disconnected'}`}>
            {socketStatus === 'connected' ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div className="no-updates">
          <p>No recent order updates</p>
          {socketStatus !== 'connected' && (
            <p className="connection-note">Connect to WebSocket to receive real-time updates</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="order-updates">
      <div className="order-updates-header">
        <h3>Order Updates</h3>
        <div className={`order-updates-status ${socketStatus === 'connected' ? 'status-connected' : 'status-disconnected'}`}>
          {socketStatus === 'connected' ? 'Connected' : 'Disconnected'}
        </div>
      </div>
      {lastUpdate && (
        <div className="last-update-time">
          Last update: {formatTime(lastUpdate)}
        </div>
      )}
      <div className="order-updates-list">
        {orderUpdates.map((update, index) => (
          <div key={index} className="order-update-item">
            <div className="order-update-header">
              <span className="order-id">{update.order_id}</span>
              <span className={`order-status ${getStatusClass(update.status)}`}>{update.status}</span>
            </div>
            <div className="order-details">
              <div>
                <span className="detail-label">Symbol:</span> {update.tradingsymbol}
              </div>
              <div>
                <span className="detail-label">Type:</span> {update.transaction_type} {update.order_type}
              </div>
              <div className="order-quantity">
                <span className="detail-label">Qty:</span> {update.quantity}
                {update.filled_quantity > 0 && (
                  <span className="filled-qty"> (Filled: {update.filled_quantity})</span>
                )}
              </div>
              <div>
                <span className="detail-label">Price:</span> ₹{update.price || update.average_price || 'Market'}
              </div>
              {update.trigger_price > 0 && (
                <div>
                  <span className="detail-label">Trigger:</span> ₹{update.trigger_price}
                </div>
              )}
              <div>
                <span className="detail-label">Time:</span> {formatTime(update.order_timestamp)}
              </div>
              {update.status_message && (
                <div className="order-message">
                  {update.status_message}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderUpdates;
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const FyersCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // The useFyersAuth hook will handle the callback automatically
    // Redirect back to the Fyers test page or dashboard
    const timer = setTimeout(() => {
      navigate('/fyers-test');
    }, 2000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%)',
      color: 'white'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        background: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <h2>Processing Fyers Authentication...</h2>
        <p>Please wait while we complete your login.</p>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid rgba(255, 255, 255, 0.3)',
          borderTop: '3px solid #3b82f6',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '1rem auto'
        }}></div>
      </div>
      
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default FyersCallback;
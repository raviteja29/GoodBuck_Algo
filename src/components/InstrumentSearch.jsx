import React, { useState } from 'react';
import TradingService from '../services/TradingService';

const InstrumentSearch = ({ onSelectInstrument, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleSearch = async () => {
    if (searchQuery.length < 2) {
      alert('Please enter at least 2 characters to search');
      return;
    }
    
    setSearchLoading(true);
    try {
      const results = await TradingService.searchInstruments(searchQuery);
      setSearchResults(results);
      console.log('Search results:', results);
    } catch (error) {
      console.error('Error searching instruments:', error);
      alert(`Error searching: ${error.message || 'Unknown error'}`);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <div className="search-modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div className="search-modal" style={{
        backgroundColor: '#181818',
        borderRadius: '24px',
        padding: '2rem',
        width: '90%',
        maxWidth: '800px',
        maxHeight: '80vh',
        overflowY: 'auto',
        boxShadow: '0 8px 32px rgba(0,255,136,0.15)'
      }}>
        <h2 style={{color: '#00ff88', marginBottom: '1.5rem'}}>Search Instruments</h2>
        
        <div style={{display: 'flex', marginBottom: '1.5rem'}}>
          <input 
            type="text" 
            value={searchQuery} 
            onChange={handleSearchChange}
            placeholder="Enter instrument name (e.g. NIFTY, BANKNIFTY)"
            style={{
              flex: 1,
              padding: '0.75rem 1rem',
              borderRadius: '12px',
              border: '1px solid #333',
              backgroundColor: '#222',
              color: '#fff',
              fontSize: '1rem'
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button 
            onClick={handleSearch}
            style={{
              marginLeft: '1rem',
              padding: '0.75rem 1.5rem',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: '#00ff88',
              color: '#111',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            Search
          </button>
        </div>
        
        {searchLoading && (
          <div style={{textAlign: 'center', padding: '2rem', color: '#fff'}}>
            Searching...
          </div>
        )}
        
        {!searchLoading && searchResults.length > 0 && (
          <table style={{width: '100%', borderCollapse: 'collapse'}}>
            <thead>
              <tr>
                <th style={{textAlign: 'left', padding: '0.75rem', color: '#00ff88', borderBottom: '1px solid #333'}}>Symbol</th>
                <th style={{textAlign: 'left', padding: '0.75rem', color: '#00ff88', borderBottom: '1px solid #333'}}>Name</th>
                <th style={{textAlign: 'left', padding: '0.75rem', color: '#00ff88', borderBottom: '1px solid #333'}}>Exchange</th>
                <th style={{textAlign: 'center', padding: '0.75rem', color: '#00ff88', borderBottom: '1px solid #333'}}>Action</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((instrument) => (
                <tr key={instrument.instrument_token} style={{borderBottom: '1px solid #222'}}>
                  <td style={{padding: '0.75rem', color: '#fff'}}>{instrument.tradingsymbol}</td>
                  <td style={{padding: '0.75rem', color: '#fff'}}>{instrument.name}</td>
                  <td style={{padding: '0.75rem', color: '#fff'}}>{instrument.exchange}</td>
                  <td style={{padding: '0.75rem', textAlign: 'center'}}>
                    <button 
                      onClick={() => onSelectInstrument(instrument)}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#00ff88',
                        color: '#111',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      Add
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        
        {!searchLoading && searchResults.length === 0 && searchQuery && (
          <div style={{textAlign: 'center', padding: '2rem', color: '#fff'}}>
            No instruments found matching "{searchQuery}"
          </div>
        )}
        
        <div style={{textAlign: 'right', marginTop: '1.5rem'}}>
          <button 
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '12px',
              border: 'none',
              backgroundColor: '#333',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstrumentSearch;
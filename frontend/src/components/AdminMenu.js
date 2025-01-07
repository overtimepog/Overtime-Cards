import React, { useState } from 'react';

function AdminMenu({ onClose }) {
  const [pin, setPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const BASE_URL = process.env.REACT_APP_API_URL || "https://overtime-cards-api.onrender.com/api/v1";
  const ADMIN_PIN = '6278'; // In a real app, this should be stored securely

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pin === ADMIN_PIN) {
      setIsAuthenticated(true);
      setError('');
    } else {
      setError('Invalid PIN');
    }
  };

  const handleResetDatabase = async () => {
    try {
      const response = await fetch(`${BASE_URL}/reset-database`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to reset database');
      }

      setSuccess('Database reset successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to reset database');
      setTimeout(() => setError(''), 3000);
    }
  };

  return (
    <div className="admin-menu-overlay">
      <div className="admin-menu">
        <button className="close-button" onClick={onClose}>×</button>
        <h2>Admin Menu</h2>
        
        {!isAuthenticated ? (
          <form onSubmit={handlePinSubmit}>
            <div className="form-group">
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                className="input-field"
                maxLength={4}
              />
            </div>
            <button type="submit" className="button">Submit</button>
          </form>
        ) : (
          <div className="admin-controls">
            <button 
              onClick={handleResetDatabase}
              className="button danger"
            >
              Reset Database
            </button>
          </div>
        )}
        
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </div>
    </div>
  );
}

export default AdminMenu; 
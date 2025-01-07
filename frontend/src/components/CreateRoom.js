import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function CreateRoom() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const BASE_URL = process.env.REACT_APP_API_URL || "https://overtime-cards-api.onrender.com/api/v1";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    try {
      // Debug API first
      const debugResponse = await fetch(`${BASE_URL}/health`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        }
      });
      if (!debugResponse.ok) {
        const errorData = await debugResponse.json();
        throw new Error(errorData.detail || 'API health check failed');
      }
      console.log('API Health:', await debugResponse.json());

      // Create player first
      const playerResponse = await fetch(`${BASE_URL}/players/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify({ username: username.trim() })
      });

      if (!playerResponse.ok) {
        const errorData = await playerResponse.json();
        throw new Error(errorData.detail || 'Failed to create player');
      }

      const playerData = await playerResponse.json();
      console.log('Player created:', playerData);

      // Create room with player ID
      const roomResponse = await fetch(`${BASE_URL}/rooms/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: parseInt(playerData.id) })
      });

      if (!roomResponse.ok) {
        const errorData = await roomResponse.json();
        throw new Error(errorData.detail || 'Failed to create room');
      }

      const roomData = await roomResponse.json();
      console.log('Room created:', roomData);

      // Add a small delay to ensure database transaction is complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Navigate to lobby with player info
      navigate(`/lobby/${roomData.room_code}`, {
        state: { 
          playerId: playerData.id,
          username: username.trim(),
          isHost: true,
          fromCreate: true
        },
        replace: true
      });

    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'An unexpected error occurred');
      // If we get a rate limit error, show a specific message
      if (err.message?.includes('rate limit')) {
        setError('Too many requests. Please wait a moment and try again.');
      }
    }
  };

  return (
    <div className="create-room">
      <h2>Create a New Room</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            className="input-field"
            maxLength={50}
          />
        </div>
        <button type="submit" className="button">Create Room</button>
      </form>
    </div>
  );
}

export default CreateRoom; 
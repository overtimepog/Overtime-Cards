import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function JoinRoom() {
  const [roomCode, setRoomCode] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const BASE_URL = process.env.REACT_APP_API_URL || "https://overtime-cards-api.onrender.com/api/v1";

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!roomCode.trim() || !username.trim()) {
      setError('Both room code and username are required');
      return;
    }

    try {
      // Create player first
      const playerResponse = await fetch(`${BASE_URL}/players/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      });

      if (!playerResponse.ok) {
        const errorData = await playerResponse.json();
        throw new Error(errorData.detail || 'Failed to create player');
      }

      const playerData = await playerResponse.json();
      console.log('Player created:', playerData);

      // Join the room
      const joinResponse = await fetch(`${BASE_URL}/rooms/${roomCode.trim()}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      });

      if (!joinResponse.ok) {
        const errorData = await joinResponse.json();
        throw new Error(errorData.detail || 'Failed to join room');
      }

      const joinData = await joinResponse.json();
      console.log('Joined room:', joinData);

      // Navigate to lobby with player info
      navigate(`/lobby/${roomCode.trim()}`, {
        state: { 
          playerId: joinData.player_id,
          username: username.trim(),
          isHost: false
        }
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
    <div className="join-room">
      <h2>Join a Room</h2>
      {error && <p className="error">{error}</p>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="text"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            placeholder="Enter room code"
            className="input-field"
            maxLength={6}
          />
        </div>
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
        <button type="submit" className="button">Join Room</button>
      </form>
    </div>
  );
}

export default JoinRoom; 
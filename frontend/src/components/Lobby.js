import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

function Lobby() {
  const { roomCode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState('');
  const [selectedGame, setSelectedGame] = useState('snap');
  const [ws, setWs] = useState(null);
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const chatEndRef = useRef(null);
  const { playerId, username, isHost } = location.state || {};

  // Auto scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatEndRef.current && chatMessages.length > 0) {
      const chatContainer = chatEndRef.current.parentElement;
      // Only scroll if the container is full (content exceeds visible area)
      if (chatContainer.scrollHeight > chatContainer.clientHeight) {
        // Scroll just enough to show the latest message
        const lastMessage = chatContainer.lastElementChild.previousElementSibling; // Get last message before the ref
        if (lastMessage) {
          lastMessage.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
    }
  }, [chatMessages]);

  const GAME_TYPES = {
    "snap": {
      name: "Snap",
      description: "Match consecutive cards and be the first to call Snap!",
      minPlayers: 2,
      maxPlayers: 4
    },
    "go_fish": {
      name: "Go Fish",
      description: "Collect sets of four cards by asking other players",
      minPlayers: 2,
      maxPlayers: 6
    },
    "bluff": {
      name: "Bluff",
      description: "Get rid of all your cards by playing them face down",
      minPlayers: 2,
      maxPlayers: 6
    },
    "scat": {
      name: "Scat",
      description: "Get closest to 31 in a single suit",
      minPlayers: 2,
      maxPlayers: 6
    },
    "rummy": {
      name: "Rummy",
      description: "Form sets and runs to get rid of all your cards",
      minPlayers: 2,
      maxPlayers: 6
    },
    "kings_corner": {
      name: "Kings Corner",
      description: "Play cards in descending order and alternating colors",
      minPlayers: 2,
      maxPlayers: 4
    },
    "spades": {
      name: "Spades",
      description: "Bid and take tricks, with Spades always being trump",
      minPlayers: 4,
      maxPlayers: 4
    },
    "spoons": {
      name: "Spoons",
      description: "Collect four of a kind and grab a spoon before others!",
      minPlayers: 3,
      maxPlayers: 8
    }
  };

  useEffect(() => {
    if (!playerId || !username) {
      navigate('/');
      return;
    }

    let retryCount = 0;
    const maxRetries = 0;
    let websocket = null;

    const sendGetState = (socket) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('Requesting initial state...');
        socket.send(JSON.stringify({
          type: 'get_state'
        }));
      }
    };

    const connectWebSocket = () => {
      // Clean up any existing connection first
      if (websocket) {
        websocket.close();
      }

      // Connect to WebSocket
      const wsUrl = `wss://overtime-cards-api.onrender.com/api/v1/ws/${roomCode}/${playerId}`;
      websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('Connected to WebSocket');
        setError(''); // Clear any previous connection errors
        retryCount = 0; // Reset retry count on successful connection
        // Wait a short moment before requesting initial state
        setTimeout(() => sendGetState(websocket), 1000);
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message:', data);
          
          if (data.type === 'error') {
            console.error('Server error:', data.message);
            setError(data.message || 'An error occurred');
            return;
          }

          // Clear error on successful message
          setError('');
          
          if (data.type === 'game_state') {
            if (data.players) {
              // Set players directly from API response
              setPlayers(data.players.map(player => ({
                ...player,
                isHost: player.isHost
              })));
            }
            // Handle initial chat history if provided
            if (data.chat_history) {
              // Ensure we don't have duplicate messages
              const uniqueMessages = data.chat_history.filter(msg => 
                !msg.message_id || 
                !chatMessages.some(existing => existing.message_id === msg.message_id)
              );
              setChatMessages(prev => [...prev, ...uniqueMessages]);
            }
          } else if (data.type === 'game_started') {
            navigate(`/game/${roomCode}/${playerId}`, {
              state: { 
                username,
                gameType: data.game_type,
                isHost
              }
            });
          } else if (data.type === 'player_joined') {
            const playerId = data.data.player_id;
            // Add system message about player joining
            const joinMessage = {
              username: 'System',
              message: data.message || `${data.data.username} joined the room`,
              isSystem: true,
              timestamp: data.timestamp || new Date().toISOString()
            };
            setChatMessages(prev => [...prev, joinMessage]);
            // Update players list with new player
            setPlayers(prev => {
              const filtered = prev.filter(p => p.id !== playerId);
              return [...filtered, {
                id: playerId,
                name: data.data.username,
                isHost: data.data.is_host || false
              }];
            });
          } else if (data.type === 'player_disconnect') {
            // Remove disconnected player from the list
            setPlayers(prev => prev.filter(p => String(p.id) !== String(data.player_id)));
            // Add system message about player leaving
            const leaveMessage = {
              username: 'System',
              message: data.message || `${data.player_name} left the room`,
              isSystem: true,
              timestamp: data.timestamp || new Date().toISOString()
            };
            setChatMessages(prev => [...prev, leaveMessage]);
            
            // Request latest state to ensure player list is in sync
            sendGetState(websocket);
          } else if (data.type === 'host_update') {
            // Update host status for all players
            setPlayers(prev => prev.map(player => ({
                ...player,
                isHost: String(player.id) === String(data.new_host_id)
            })));
            
            // If I'm the new host, update local state
            if (String(data.new_host_id) === String(playerId)) {
                // Update location state
                const newState = {
                    ...location.state,
                    isHost: true
                };
                // Update navigation state
                navigate(`/lobby/${roomCode}`, { state: newState, replace: true });
            }
            
            // Add system message about new host
            const hostUpdateMessage = {
                username: 'System',
                message: data.message || `${data.new_host_name} is now the host`,
                isSystem: true,
                timestamp: data.timestamp || new Date().toISOString()
            };
            setChatMessages(prev => [...prev, hostUpdateMessage]);
          } else if (data.type === 'chat') {
            // Check if we've already seen this message
            if (!data.message_id || !chatMessages.some(msg => msg.message_id === data.message_id)) {
              const chatMessage = {
                message_id: data.message_id,
                username: data.username,
                message: data.message,
                isSystem: false,
                timestamp: data.timestamp || new Date().toISOString()
              };
              setChatMessages(prev => [...prev, chatMessage]);
            }
          }
        } catch (err) {
          console.error('Error processing WebSocket message:', err);
          setError('Error processing server message');
        }
      };

      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Close the connection to trigger a retry
        websocket.close();
      };

      websocket.onclose = (event) => {
        console.log('WebSocket closed:', event);
        if (retryCount < maxRetries) {
          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff with max 5s
          console.log(`Retrying connection in ${delay}ms (${retryCount}/${maxRetries})...`);
          setTimeout(connectWebSocket, delay);
        } else {
          setError('Connection to game server lost. Please refresh the page to reconnect.');
        }
      };

      setWs(websocket);
      return websocket;
    };

    const socket = connectWebSocket();

    // Clean up function to properly close WebSocket connection
    return () => {
      console.log('Cleaning up WebSocket connection');
      if (socket) {
        socket.close();
      }
    };
  }, [chatMessages, roomCode, playerId, username, navigate, isHost, location.state]);

  const handleStartGame = async () => {
    try {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        throw new Error('No connection to game server');
      }

      ws.send(JSON.stringify({
        type: 'start_game',
        game_type: selectedGame
      }));

      console.log('Start game request sent');
    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'Failed to start game');
    }
  };

  const sendChatMessage = () => {
    if (!chatMessage.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      ws.send(JSON.stringify({
        type: 'chat',
        message: chatMessage.trim()
      }));
      setChatMessage('');
    } catch (err) {
      console.error('Error sending chat message:', err);
      setError('Failed to send message');
    }
  };

  const canStartGame = () => {
    const gameConfig = GAME_TYPES[selectedGame];
    const playerCount = players.length;
    return playerCount >= gameConfig.minPlayers && playerCount <= gameConfig.maxPlayers;
  };

  const handleLeaveRoom = async () => {
    try {
      // Send leave_room message through WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'leave_room'
        }));
        
        // Give the WebSocket message time to propagate
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (err) {
      console.error('Error leaving room:', err);
    } finally {
      // Close WebSocket connection
      if (ws) {
        ws.close();
      }
      // Navigate away
      navigate('/');
    }
  };

  return (
    <div className="lobby">
      <div className="lobby-header">
        <h2>Game Lobby</h2>
        <div className="room-info">
          <p>Room Code: <span className="highlight">{roomCode}</span></p>
          <p>Your Name: <span className="highlight">{username}</span></p>
        </div>
        <button 
          onClick={handleLeaveRoom} 
          className="button leave-room-button"
        >
          Leave Room
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="lobby-content">
        <div className="players-section">
          <h3>Players</h3>
          <div className="players-list">
            {players.map((player) => (
              <div key={player.id} className={`player ${player.isHost ? 'host' : ''}`}>
                <span className="player-name">{player.name}</span>
                <div className="player-badges">
                  {player.isHost && <span className="host-badge">Host</span>}
                </div>
              </div>
            ))}
          </div>

          {isHost && (
            <div className="game-selection">
              <h3>Select Game</h3>
              <select 
                value={selectedGame} 
                onChange={(e) => setSelectedGame(e.target.value)}
                className="game-select"
              >
                {Object.entries(GAME_TYPES).map(([type, config]) => (
                  <option key={type} value={type}>
                    {config.name} ({config.minPlayers}-{config.maxPlayers} players)
                  </option>
                ))}
              </select>
              <button 
                onClick={handleStartGame}
                className="button start-game"
                disabled={!canStartGame()}
              >
                Start Game
              </button>
              {!canStartGame() && (
                <p className="warning">
                  Need {GAME_TYPES[selectedGame].minPlayers}-{GAME_TYPES[selectedGame].maxPlayers} players
                </p>
              )}
            </div>
          )}
        </div>

        <div className="chat-section">
          <h3>Chat</h3>
          <div className="chat-messages">
            {chatMessages.map((msg, index) => (
              <div 
                key={index} 
                className={`chat-message ${msg.isSystem ? 'system-message' : ''}`}
              >
                <span className="chat-username">{msg.username}:</span>
                <span className="chat-text">{msg.message}</span>
                {msg.timestamp && (
                  <span className="chat-timestamp">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder="Type a message..."
              className="input-field"
              maxLength={200}
            />
            <button 
              onClick={sendChatMessage} 
              className="button send-button"
              disabled={!chatMessage.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Lobby;

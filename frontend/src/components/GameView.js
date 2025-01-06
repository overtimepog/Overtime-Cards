import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

function GameView() {
  const { roomCode, playerId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState('');
  const [ws, setWs] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);
  const { username, gameType, isHost } = location.state || {};

  const BASE_URL = "https://overtime-cards-api.onrender.com/api/v1";

  useEffect(() => {
    if (!playerId || !username || !gameType) {
      navigate('/');
      return;
    }

    // Connect to WebSocket
    const wsUrl = `wss://overtime-cards-api.onrender.com/api/v1/ws/${roomCode}/${playerId}`;
    const websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      console.log('Connected to game WebSocket');
      setError(''); // Clear any previous connection errors
      // Request initial game state
      websocket.send(JSON.stringify({
        type: 'get_state'
      }));
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Raw WebSocket message:', data);
        
        if (data.type === 'game_state' || data.type === 'game_update') {
          console.log('Processing game state update:', data);
          const newState = data.type === 'game_state' ? data.state : data.game_state || {};
          
          // Ensure we have a valid players object
          if (!newState.players) {
            newState.players = {};
          }
          
          // Process player data, preserving hands for the current player
          Object.keys(newState.players).forEach(id => {
            const strId = String(id);
            if (newState.players[strId]) {
              const playerData = newState.players[strId];
              
              // Preserve the full hand data for the current player
              const hand = strId === String(playerId) ? 
                (playerData.hand || []).map(card => ({
                  rank: card.rank,
                  suit: card.suit
                })) : [];

              newState.players[strId] = {
                ...playerData,
                id: strId,
                hand: hand,
                hand_size: playerData.hand_size || hand.length
              };
            }
          });
          
          console.log('Processed game state:', newState);
          setGameState(newState);
          setError('');
          
          if (data.type === 'game_update' && data.result && !data.result.success) {
            setError(data.result.message || 'Action failed');
          }
        } else if (data.type === 'game_start') {
          console.log('Game start received:', data);
          // Handle initial game state from game start
          const newState = {
            ...data.initial_state,
            players: data.players || {},
            game_type: data.game_type
          };
          
          // Convert player IDs to strings and ensure hands are properly set
          Object.keys(newState.players).forEach(id => {
            const strId = String(id);
            newState.players[strId] = {
              ...newState.players[strId],
              id: strId,
              hand: strId === String(playerId) ? (newState.players[strId].hand || []) : []
            };
          });
          
          setGameState(newState);
          setError('');
        } else if (data.type === 'error') {
          setError(data.message || 'An error occurred');
          console.error('Server error:', data.message);
        } else if (data.type === 'game_over') {
          setGameState(prev => ({
            ...prev,
            status: 'game_over',
            scores: data.scores,
            winner: data.winner
          }));
          setError(`Game Over! ${data.winner.username} wins!`);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
        setError('Failed to process game update');
      }
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('Failed to connect to game server. Please check your connection and try again.');
    };

    websocket.onclose = (event) => {
      console.log('WebSocket closed:', event);
      setError('Connection to game server lost. Please refresh the page to reconnect.');
    };

    setWs(websocket);

    return () => {
      if (websocket) {
        websocket.close();
      }
    };
  }, [playerId, username, gameType, roomCode, navigate]);

  const handleGameAction = async (actionType, actionData = {}) => {
    try {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setError('Connection to game server lost. Please refresh the page.');
        return;
      }

      // Send game action via WebSocket
      ws.send(JSON.stringify({
        type: 'game_action',
        action_type: actionType,
        action_data: actionData,
        room_code: roomCode,
        player_id: parseInt(playerId)
      }));

    } catch (err) {
      console.error('Error performing game action:', err);
      setError(err.message || 'Failed to perform action');
    }
  };

  const handleCardClick = (cardIndex) => {
    if (!gameState?.players?.[playerId]?.hand) return;
    
    setSelectedCards(prev => {
      const isSelected = prev.includes(cardIndex);
      if (isSelected) {
        return prev.filter(i => i !== cardIndex);
      } else {
        return [...prev, cardIndex];
      }
    });
  };

  const renderCard = (card) => {
    if (!card) return null;
    const { rank, suit } = card;
    
    const rankMap = {
      'A': 'A', 'K': 'K', 'Q': 'Q', 'J': 'J', '10': '10',
      '9': '9', '8': '8', '7': '7', '6': '6', '5': '5',
      '4': '4', '3': '3', '2': '2'
    };
    
    const suitMap = {
      'hearts': 'hearts',
      'diamonds': 'diamonds',
      'clubs': 'clubs',
      'spades': 'spades'
    };
    
    const mappedRank = rankMap[rank] || rank;
    const mappedSuit = suitMap[suit] || suit;
    
    const cardImagePath = `/cards/${mappedSuit}_${mappedRank}.png`;
    
    return (
      <img 
        src={cardImagePath} 
        alt={`${rank} of ${suit}`}
        className="card-image"
        style={{
          width: '80px',
          height: 'auto',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          border: '2px solid transparent',
          transition: 'all 0.2s ease'
        }}
        onError={(e) => {
          console.error('Failed to load card image:', cardImagePath);
          e.target.src = '/cards/back_dark.png';
        }}
      />
    );
  };

  const calculatePlayerPosition = (index, totalPlayers, radius = 250) => {
    // Calculate angle for this player, starting from bottom (270 degrees)
    // Find my index in the players array
    const playerIds = Object.keys(gameState.players);
    const myIndex = playerIds.indexOf(playerId);
    
    // Rotate the circle so current player is always at bottom
    let adjustedIndex = (index - myIndex + totalPlayers) % totalPlayers;
    const angle = (adjustedIndex * (360 / totalPlayers) + 270) % 360;
    
    // Convert to radians and calculate position
    const rad = (angle * Math.PI) / 180;
    return {
      left: `calc(50% + ${Math.cos(rad) * radius}px)`,
      top: `calc(50% + ${Math.sin(rad) * radius}px)`,
      transform: 'translate(-50%, -50%)',
      position: 'absolute'
    };
  };

  const renderGameCenter = () => {
    switch (gameType) {
      case 'spoons':
        return (
          <div className="spoons-container" style={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '200px',
            height: '200px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px'
          }}>
            {[...Array(gameState.total_spoons || (gameState.players ? Object.keys(gameState.players).length - 1 : 0))].map((_, index) => {
              const isAvailable = index < gameState.spoons;
              const lastAction = gameState.last_action;
              const wasJustGrabbed = lastAction?.action === 'grab_spoon' && index === lastAction.spoon_index;
              const grabberPosition = wasJustGrabbed && lastAction.player && gameState.players[lastAction.player] ? 
                calculatePlayerPosition(
                  Object.keys(gameState.players).indexOf(lastAction.player),
                  Object.keys(gameState.players).length
                ) : null;
              
              return (
                <div
                  key={index}
                  onClick={() => isAvailable && handleGameAction('grab_spoon')}
                  style={{
                    cursor: isAvailable ? 'pointer' : 'default',
                    position: 'relative',
                    transition: 'all 0.5s ease',
                    transform: wasJustGrabbed ? 
                      `translate(
                        ${grabberPosition ? `calc(${grabberPosition.left} - 50%)` : '0'}, 
                        ${grabberPosition ? `calc(${grabberPosition.top} - 50%)` : '0'}
                      ) scale(0.8)` : 'none',
                    opacity: wasJustGrabbed ? 0 : 1
                  }}
                >
                  <img 
                    src="/spoon-at-45-degree-angle.png"
                    alt="Spoon"
                    style={{
                      width: '40px',
                      height: 'auto',
                      transform: 'rotate(45deg)',
                      filter: isAvailable ? 
                        'drop-shadow(0 0 10px rgba(255,255,0,0.5)) brightness(1.2)' : 
                        'drop-shadow(2px 2px 2px rgba(0,0,0,0.2)) brightness(0.7)',
                      transition: 'all 0.3s ease'
                    }}
                  />
                </div>
              );
            })}
          </div>
        );

      case 'snap':
      case 'bluff':
      case 'go_fish':
      default:
        return gameState.center_pile && (
          <div className="center-pile" style={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '200px',
            height: '200px'
          }}>
            <div className="cards" style={{ 
              position: 'relative',
              width: '100%',
              height: '100%'
            }}>
              {gameState.center_pile.map((card, index) => (
                <div key={index} style={{ 
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) rotate(${index * (360 / gameState.center_pile.length)}deg) translateY(-20px)`
                }}>
                  {renderCard(card)}
                </div>
              ))}
            </div>
          </div>
        );
    }
  };

  const renderGameControls = () => {
    if (!gameState) return null;

    const isCurrentPlayer = gameState.current_player === playerId;
    const myHand = gameState.players?.[playerId]?.hand || [];

    switch (gameType) {
      case 'spoons':
        return (
          <div className="game-controls" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}>
            {isCurrentPlayer && (
              <button 
                onClick={() => {
                  if (selectedCards.length === 1) {
                    handleGameAction('play_card', { card_index: selectedCards[0] });
                    setSelectedCards([]);
                  }
                }}
                className="button"
                disabled={selectedCards.length !== 1}
                style={{
                  backgroundColor: selectedCards.length === 1 ? '#4CAF50' : '#ccc',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px',
                  cursor: selectedCards.length === 1 ? 'pointer' : 'not-allowed'
                }}
              >
                Pass Card
              </button>
            )}
          </div>
        );

      case 'snap':
        return (
          <div className="game-controls" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}>
            {isCurrentPlayer && (
              <button 
                onClick={() => handleGameAction('play_card')}
                className="button"
                style={{
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px'
                }}
              >
                Play Card
              </button>
            )}
            <button 
              onClick={() => handleGameAction('snap')}
              className="button snap-button"
              style={{
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                fontWeight: 'bold'
              }}
            >
              SNAP!
            </button>
          </div>
        );

      case 'go_fish':
        return (
          <div className="game-controls" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}>
            {isCurrentPlayer && selectedCards.length === 1 && (
              <select 
                onChange={(e) => {
                  if (e.target.value) {
                    handleGameAction('ask_for_cards', {
                      target_player_id: e.target.value,
                      rank: myHand[selectedCards[0]]?.rank
                    });
                    setSelectedCards([]);
                  }
                }}
                className="player-select"
                style={{
                  padding: '10px',
                  borderRadius: '5px',
                  border: '1px solid #ccc',
                  backgroundColor: 'white',
                  minWidth: '200px'
                }}
              >
                <option value="">Select a player to ask</option>
                {Object.entries(gameState.players || {})
                  .filter(([id]) => id !== playerId)
                  .map(([id, player]) => (
                    <option key={id} value={id}>
                      {player.name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        );

      case 'bluff':
        return (
          <div className="game-controls" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}>
            {isCurrentPlayer ? (
              selectedCards.length > 0 && (
                <select 
                  onChange={(e) => {
                    if (e.target.value) {
                      handleGameAction('play_cards', {
                        card_indices: selectedCards,
                        claimed_rank: e.target.value
                      });
                      setSelectedCards([]);
                    }
                  }}
                  className="rank-select"
                  style={{
                    padding: '10px',
                    borderRadius: '5px',
                    border: '1px solid #ccc',
                    backgroundColor: 'white',
                    minWidth: '200px'
                  }}
                >
                  <option value="">Claim a rank</option>
                  {['ACE', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'JACK', 'QUEEN', 'KING'].map(rank => (
                    <option key={rank} value={rank}>{rank}</option>
                  ))}
                </select>
              )
            ) : (
              <button 
                onClick={() => handleGameAction('challenge')}
                className="button"
                disabled={!gameState.can_challenge}
                style={{
                  backgroundColor: gameState.can_challenge ? '#f44336' : '#ccc',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px',
                  cursor: gameState.can_challenge ? 'pointer' : 'not-allowed'
                }}
              >
                Challenge!
              </button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="game-view" style={{ 
      width: '100vw',
      height: '100vh',
      backgroundColor: '#2e7d32',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div className="game-header" style={{ 
        position: 'absolute',
        top: '10px',
        left: '10px',
        zIndex: 10,
        display: 'flex',
        gap: '20px',
        alignItems: 'center'
      }}>
        <h2 style={{ color: 'white', margin: 0 }}>{gameType.toUpperCase()}</h2>
        <button 
          onClick={() => navigate('/')} 
          className="button back-button"
          style={{
            backgroundColor: 'rgba(255,255,255,0.2)',
            color: 'white',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '5px'
          }}
        >
          Leave Game
        </button>
      </div>

      {error && (
        <div style={{ 
          position: 'absolute',
          top: '50px',
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'white',
          backgroundColor: 'rgba(255,0,0,0.7)',
          padding: '10px 20px',
          borderRadius: '5px',
          zIndex: 100
        }}>
          {error}
        </div>
      )}

      {gameState && (
        <div className="game-state" style={{ width: '100%', height: '100%', position: 'relative' }}>
          {/* Center game elements */}
          {renderGameCenter()}

          {/* Players in a circle */}
          {Object.entries(gameState.players || {}).map(([id, player], index) => (
            <div 
              key={id}
              style={{
                ...calculatePlayerPosition(index, Object.keys(gameState.players).length),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <div style={{ 
                backgroundColor: id === gameState.current_player ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.5)',
                padding: '10px 20px',
                borderRadius: '10px',
                color: 'white',
                textAlign: 'center',
                minWidth: '120px'
              }}>
                <div style={{ fontWeight: 'bold' }}>{player.name}</div>
                <div style={{ fontSize: '0.8em' }}>{player.hand_size || 0} cards</div>
                {gameType === 'spoons' && gameState.grabbed_spoons?.[id] && (
                  <div style={{ color: '#FFD700', marginTop: '5px' }}>🥄 Has Spoon</div>
                )}
              </div>

              {/* Show cards only for current player */}
              {id === playerId && (
                <div className="my-hand" style={{ 
                  display: 'flex', 
                  gap: '5px',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  maxWidth: '300px'
                }}>
                  {player.hand?.map((card, cardIndex) => (
                    <div 
                      key={cardIndex}
                      onClick={() => handleCardClick(cardIndex)}
                      style={{
                        transform: selectedCards.includes(cardIndex) ? 'translateY(-10px)' : 'none',
                        transition: 'transform 0.2s ease',
                        cursor: 'pointer'
                      }}
                    >
                      {renderCard(card)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Game controls for current player */}
          {gameState.current_player === playerId && (
            <div style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '10px',
              justifyContent: 'center'
            }}>
              {renderGameControls()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default GameView; 
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
  const [isCurrentPlayer, setIsCurrentPlayer] = useState(false);

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
          
          // Process player data
          Object.keys(newState.players).forEach(id => {
            const strId = String(id);
            if (newState.players[strId]) {
              const playerData = newState.players[strId];
              
              // Keep the hand data as is from the server
              // The server will only send the hand for the current player
              newState.players[strId] = {
                ...playerData,
                id: strId,
                hand: playerData.hand || [],
                hand_size: playerData.hand_size || 0
              };
            }
          });
          
          console.log('Processed game state:', newState);
          setGameState(newState);
          setError('');
          
          if (data.type === 'game_update' && data.result && !data.result.success) {
            setError(data.result.message || 'Action failed');
          }
        } else if (data.type === 'game_started') {
          console.log('Game started received:', data);
          // Handle initial game state from game start
          const newState = {
            ...data.state,
            players: data.state.players || {},
            game_type: data.game_type
          };
          
          // Process player data
          Object.keys(newState.players).forEach(id => {
            const strId = String(id);
            if (newState.players[strId]) {
              const playerData = newState.players[strId];
              newState.players[strId] = {
                ...playerData,
                id: strId,
                hand: playerData.hand || [],
                hand_size: playerData.hand_size || 0
              };
            }
          });
          
          console.log('Processed game state:', newState);
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
    
    return (
      <img 
        src={card.show_back ? card.image_back : card.image_front}
        alt={card.show_back ? "Card back" : `${card.rank} of ${card.suit}`}
        className="card-image"
        style={{
          width: card.show_back ? '60px' : '80px', // Smaller for backs
          height: 'auto',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          border: '2px solid transparent',
          transition: 'all 0.2s ease'
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
    if (!gameState) return null;

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

      case 'kings_corner':
        return (
          <div className="kings-corner-container" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '400px',
            height: '400px'
          }}>
            {/* Foundation piles (center) */}
            {[...Array(4)].map((_, index) => {
              const pile = gameState.piles?.[`foundation_${index}`] || [];
              const angle = index * 90; // 4 piles at 90-degree intervals
              return (
                <div key={`foundation_${index}`} style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${Math.cos(angle * Math.PI / 180) * 60}px, ${Math.sin(angle * Math.PI / 180) * 60}px)`
                }}>
                  {pile.map((card, cardIndex) => renderCard(card))}
                </div>
              );
            })}
            
            {/* Corner piles */}
            {[...Array(4)].map((_, index) => {
              const pile = gameState.piles?.[`corner_${index}`] || [];
              const angle = index * 90 + 45; // 4 piles at corners (45° offset)
              return (
                <div key={`corner_${index}`} style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${Math.cos(angle * Math.PI / 180) * 120}px, ${Math.sin(angle * Math.PI / 180) * 120}px)`
                }}>
                  {pile.map((card, cardIndex) => renderCard(card))}
                </div>
              );
            })}
          </div>
        );

      case 'scat':
        return (
          <div className="scat-center" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '400px',
            height: '300px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            {/* Game info (current round, knocked status) */}
            <div className="game-info" style={{
              color: 'white',
              textAlign: 'center',
              fontSize: '1.2em'
            }}>
              {gameState.knocked_player && (
                <div style={{ color: '#FFD700' }}>
                  {gameState.players[gameState.knocked_player]?.name} has knocked!
                </div>
              )}
              {gameState.round_number && (
                <div>Round {gameState.round_number}</div>
              )}
            </div>

            {/* Draw and Discard piles */}
            <div className="card-piles" style={{
              display: 'flex',
              gap: '40px',
              alignItems: 'center'
            }}>
              {/* Draw pile */}
              <div 
                className="draw-pile"
                onClick={() => isCurrentPlayer && handleGameAction('draw_card', { source: 'deck' })}
                style={{
                  position: 'relative',
                  cursor: isCurrentPlayer ? 'pointer' : 'default',
                  transition: 'transform 0.2s',
                  transform: isCurrentPlayer ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {gameState.deck?.cards_remaining > 0 && renderCard({
                  show_back: true,
                  image_back: '/card-back.png'
                })}
                <div style={{
                  position: 'absolute',
                  bottom: '-25px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: 'white',
                  fontSize: '0.8em',
                  whiteSpace: 'nowrap'
                }}>
                  Draw ({gameState.deck?.cards_remaining})
                </div>
              </div>

              {/* Discard pile */}
              <div 
                className="discard-pile"
                onClick={() => isCurrentPlayer && handleGameAction('draw_card', { source: 'discard' })}
                style={{
                  position: 'relative',
                  cursor: isCurrentPlayer ? 'pointer' : 'default',
                  transition: 'transform 0.2s',
                  transform: isCurrentPlayer ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {gameState.discard_pile?.slice(-1).map((card, index) => (
                  <div key={index}>
                    {renderCard(card)}
                  </div>
                ))}
                <div style={{
                  position: 'absolute',
                  bottom: '-25px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: 'white',
                  fontSize: '0.8em'
                }}>
                  Discard
                </div>
              </div>
            </div>

            {/* Current player's score (if available) */}
            {gameState.players[playerId]?.current_score && (
              <div style={{
                color: 'white',
                marginTop: '20px',
                padding: '5px 15px',
                backgroundColor: 'rgba(0,0,0,0.3)',
                borderRadius: '10px'
              }}>
                Current Score: {gameState.players[playerId].current_score}
              </div>
            )}
          </div>
        );

      case 'rummy':
        return (
          <div className="table-center" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            gap: '20px'
          }}>
            {/* Draw pile */}
            <div className="draw-pile" style={{
              position: 'relative',
              width: '80px',
              height: '120px'
            }}>
              {gameState.deck?.cards_remaining > 0 && renderCard({
                show_back: true,
                image_back: '/card-back.png'
              })}
            </div>
            
            {/* Discard pile */}
            <div className="discard-pile" style={{
              position: 'relative',
              width: '80px',
              height: '120px'
            }}>
              {gameState.discard_pile?.slice(-1).map(card => renderCard(card))}
            </div>
          </div>
        );

      case 'spades':
        return (
          <div className="spades-center" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '300px',
            height: '200px'
          }}>
            {/* Current trick */}
            <div className="current-trick" style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '10px'
            }}>
              {gameState.current_trick?.map((card, index) => (
                <div key={index} style={{
                  transform: `rotate(${index * 90}deg)`
                }}>
                  {renderCard(card)}
                </div>
              ))}
            </div>
            
            {/* Display current scores and bids */}
            <div className="game-info" style={{
              position: 'absolute',
              top: '-30px',
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'white',
              textAlign: 'center'
            }}>
              <div>Tricks needed: {gameState.tricks_needed}</div>
              <div>Trump: ♠</div>
            </div>
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
              <>
                {/* Play cards face down */}
                {selectedCards.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                    <div style={{ color: 'white', textAlign: 'center', fontSize: '0.8em' }}>
                      Selected {selectedCards.length} card{selectedCards.length !== 1 ? 's' : ''}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Challenge button for other players */
              <button 
                onClick={() => handleGameAction('challenge')}
                className="button"
                disabled={!gameState.last_play}
                style={{
                  backgroundColor: gameState.last_play ? '#f44336' : '#ccc',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '5px',
                  cursor: gameState.last_play ? 'pointer' : 'not-allowed'
                }}
              >
                Challenge!
              </button>
            )}
            {/* Display last claimed cards */}
            {gameState.last_play && (
              <div style={{ 
                color: 'white', 
                textAlign: 'center', 
                marginTop: '10px',
                padding: '5px 10px',
                backgroundColor: 'rgba(0,0,0,0.3)',
                borderRadius: '5px'
              }}>
                Last play: {gameState.players[gameState.last_play.player]?.name} claimed {gameState.last_play.count} {gameState.last_play.rank}{gameState.last_play.count !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        );

      case 'scat':
        return (
          <div className="game-controls" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}>
            {isCurrentPlayer && (
              <>
                {/* Draw controls */}
                {myHand.length < 3 && (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleGameAction('draw_card', { source: 'deck' })}
                      className="button"
                      style={{
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '5px'
                      }}
                    >
                      Draw from Deck
                    </button>
                    <button
                      onClick={() => handleGameAction('draw_card', { source: 'discard' })}
                      className="button"
                      style={{
                        backgroundColor: '#2196F3',
                        color: 'white',
                        border: 'none',
                        padding: '10px 20px',
                        borderRadius: '5px'
                      }}
                    >
                      Take from Discard
                    </button>
                  </div>
                )}

                {/* Discard control */}
                {myHand.length > 3 && selectedCards.length === 1 && (
                  <button
                    onClick={() => {
                      handleGameAction('discard_card', { card_index: selectedCards[0] });
                      setSelectedCards([]);
                    }}
                    className="button"
                    style={{
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '5px'
                    }}
                  >
                    Discard Selected Card
                  </button>
                )}

                {/* Knock control */}
                {myHand.length === 3 && !gameState.final_round && (
                  <button
                    onClick={() => handleGameAction('knock')}
                    className="button"
                    style={{
                      backgroundColor: '#FFC107',
                      color: 'black',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '5px',
                      fontWeight: 'bold'
                    }}
                  >
                    Knock!
                  </button>
                )}
              </>
            )}

            {/* Display lives */}
            <div style={{
              display: 'flex',
              gap: '20px',
              marginTop: '10px'
            }}>
              {Object.entries(gameState.lives || {}).map(([pid, lives]) => (
                <div key={pid} style={{
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}>
                  <span>{gameState.players[pid]?.name}: </span>
                  {[...Array(lives)].map((_, i) => (
                    <span key={i} style={{ color: '#FFD700' }}>♥</span>
                  ))}
                </div>
              ))}
            </div>
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

              {/* Show cards for all players */}
              <div className="player-hand" style={{ 
                display: 'flex', 
                gap: '5px',
                flexWrap: 'wrap',
                justifyContent: 'center',
                maxWidth: '300px'
              }}>
                {player.hand?.map((card, cardIndex) => (
                  <div 
                    key={cardIndex}
                    onClick={() => id === playerId ? handleCardClick(cardIndex) : null}
                    style={{
                      transform: id === playerId && selectedCards.includes(cardIndex) ? 'translateY(-10px)' : 'none',
                      transition: 'transform 0.2s ease',
                      cursor: id === playerId ? 'pointer' : 'default'
                    }}
                  >
                    {renderCard(card)}
                  </div>
                ))}
              </div>
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
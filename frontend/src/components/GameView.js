import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  DndContext,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  DragOverlay,
  defaultDropAnimationSideEffects,
  pointerWithin,
  rectIntersection,
  MeasuringStrategy,
} from '@dnd-kit/core';
import { Draggable } from './Draggable';
import { Droppable } from './Droppable';
import backDark from '../components/cards/back_dark.png';

// Custom hook for managing all drop zones
const useGameDropZones = (gameState, playerId) => {
  // Create an array of all possible drop zone IDs
  const dropZoneIds = useMemo(() => {
    const standardZones = ['foundation', 'corner', 'meld', 'discard', 'center'];
    const playerZones = gameState?.players 
      ? Object.keys(gameState.players)
          .filter(id => id !== playerId)
          .map(id => `player-${id}`)
      : [];
    return [...standardZones, ...playerZones];
  }, [gameState?.players, playerId]);

  // Create a map of all drop zone data
  const dropZoneData = useMemo(() => {
    const data = {};
    dropZoneIds.forEach(id => {
      if (id.startsWith('player-')) {
        const playerId = id.replace('player-', '');
        data[id] = { type: 'player', playerId };
      } else {
        data[id] = { type: id };
      }
    });
    return data;
  }, [dropZoneIds]);

  return {
    dropZoneIds,
    dropZoneData,
  };
};

// Card component with drag and drop functionality
const Card = React.memo(({ card, index, isInHand, canDrag = true }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  if (!card) return null;
  
  const imagePath = card.show_back ? 
    backDark : 
    require(`../components/cards/${card.suit.toLowerCase()}_${card.rank}.png`);

  const cardStyle = {
    position: 'relative',
    display: 'inline-block',
    marginLeft: isInHand ? '-50px' : '0',
    zIndex: isHovered ? 100 : index,
    transition: 'all 0.2s ease, z-index 0s',
    transform: isHovered ? 'translateY(-20px) translateX(25px) scale(1.1)' : 'none',
  };

  const cardContent = (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <img 
        src={imagePath}
        alt={card.show_back ? "Card back" : `${card.rank} of ${card.suit}`}
        className="card-image"
        style={{
          width: '80px',
          height: 'auto',
          borderRadius: '8px',
          boxShadow: isHovered ? '0 8px 16px rgba(0,0,0,0.3)' : '0 2px 4px rgba(0,0,0,0.1)',
          transition: 'all 0.2s ease',
          pointerEvents: 'none'
        }}
      />
    </div>
  );

  return (
    <Draggable
      id={`card-${index}`}
      data={{ card, index }}
      disabled={!canDrag || card.show_back}
      style={cardStyle}
      ariaLabel={card.show_back ? "Face down card" : `${card.rank} of ${card.suit}`}
      className="card-container"
    >
      {cardContent}
    </Draggable>
  );
});

function GameView() {
  const { roomCode, playerId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState('');
  const [ws, setWs] = useState(null);
  const [selectedCards, setSelectedCards] = useState([]);
  const { username, gameType } = location.state || {};
  const [activeId, setActiveId] = useState(null);
  const [activeDragData, setActiveDragData] = useState(null);
  const [isCurrentPlayer, setIsCurrentPlayer] = useState(false);

  // Initialize drop zones using the custom hook
  const { dropZoneData } = useGameDropZones(gameState, playerId);

  const BASE_URL = process.env.REACT_APP_API_URL || "https://overtime-cards-api.onrender.com/api/v1";

  // Setup DnD sensors with proper configuration
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10,
        tolerance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Collision detection strategy
  const collisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    
    // Fall back to rect intersection if no pointer collisions
    const rectCollisions = rectIntersection(args);
    return rectCollisions;
  }, []);

  // Handle DnD events
  const handleDragStart = (event) => {
    const { active } = event;
    setActiveId(active.id);
    setActiveDragData(active.data.current);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    
    if (!active || !over) {
      setActiveId(null);
      setActiveDragData(null);
      return;
    }

    const sourceItem = active.data.current;
    const targetZone = dropZoneData[over.id];

    if (targetZone) {
      handleCardDrop(sourceItem, targetZone);
    }

    setActiveId(null);
    setActiveDragData(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
    setActiveDragData(null);
  };

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.5',
        },
      },
    }),
  };

  const renderDropZone = (id, children, style = {}) => {
    return (
      <Droppable
        id={id}
        data={dropZoneData[id]}
        style={style}
        ariaLabel={`${dropZoneData[id].type} drop zone`}
      >
        {children}
      </Droppable>
    );
  };

  const handleLeaveGame = async () => {
    try {
      // Always navigate away first to ensure responsive UI
      navigate('/');
      
      // Then attempt cleanup
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'leave_room',
          player_id: playerId,
          room_code: roomCode
        }));
        ws.close();
      }
      
      // Call leave room API endpoint
      await fetch(`${BASE_URL}/rooms/${roomCode}/leave`, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Origin': window.location.origin
        },
        body: JSON.stringify({ username })
      }).catch(err => console.error('Error calling leave API:', err));
      
    } catch (err) {
      console.error('Error during leave cleanup:', err);
    }
  };

  useEffect(() => {
    if (!playerId || !username || !gameType) {
      navigate('/');
      return;
    }

    // Connect to WebSocket
    const wsUrl = `${process.env.REACT_APP_WS_URL || "wss://overtime-cards-api.onrender.com/api/v1/ws"}/${roomCode}/${playerId}`;
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
          
          // Handle player departure
          if (data.type === 'game_update' && data.event === 'player_left') {
            const departedPlayer = data.player;
            setError(`${departedPlayer.name} has left the game.`);
            
            // If game can't continue, end it
            if (data.game_ended) {
              setTimeout(() => {
                setError('Game ended due to player departure.');
                navigate('/');
              }, 3000);
            }
          }
          
          // Ensure we have a valid players object
          if (!newState.players) {
            newState.players = {};
          }
          
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
          
          setGameState(newState);
          
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
        player_id: parseInt(playerId),
        origin: window.location.origin
      }));

    } catch (err) {
      console.error('Error performing game action:', err);
      setError(err.message || 'Failed to perform action');
    }
  };

  const handleCardClick = (cardIndex) => {
    if (!gameState?.players?.[playerId]?.hand) return;
    
    if (gameType === 'go_fish') {
      setSelectedCards([cardIndex]); // Only allow one card selected at a time for Go Fish
    } else {
      setSelectedCards(prev => {
        const isSelected = prev.includes(cardIndex);
        if (isSelected) {
          return prev.filter(i => i !== cardIndex);
        } else {
          return [...prev, cardIndex];
        }
      });
    }
  };

  const handleCardDrop = (source, target) => {
    if (!gameState?.players?.[playerId]?.hand) return;
    
    const sourceCard = source.card;
    const sourceIndex = source.index;
    const targetCard = target.card;
    const targetIndex = target.index;

    // Handle different game-specific drop actions
    switch (gameType) {
      case 'kings_corner':
        // If dropping on a foundation or corner pile
        if (target.pileType) {
          handleGameAction('move_cards', {
            card_indices: [sourceIndex],
            target_pile: target.pileType,
            target_index: target.pileIndex
          });
        }
        break;

      case 'rummy':
        // If dropping on a meld
        if (target.meldIndex !== undefined) {
          handleGameAction('add_to_meld', {
            card_index: sourceIndex,
            meld_index: target.meldIndex
          });
        }
        // If dropping on another card to create a new meld
        else if (targetCard && !targetCard.show_back) {
          handleGameAction('create_meld', {
            card_indices: [sourceIndex, targetIndex]
          });
        }
        break;

      case 'scat':
        // If dropping on discard pile
        if (target.pileType === 'discard') {
          handleGameAction('discard_card', {
            card_index: sourceIndex
          });
        }
        break;

      case 'snap':
        // If dropping on center pile
        if (target.pileType === 'center') {
          handleGameAction('play_card', {
            card_index: sourceIndex
          });
        }
        break;

      case 'go_fish':
        // If dropping on a player
        if (target.playerId) {
          handleGameAction('ask_for_cards', {
            target_player_id: target.playerId,
            rank: sourceCard.rank
          });
        }
        break;

      default:
        // For games that use card selection
        handleCardClick(sourceIndex);
        break;
    }
  };

  const renderCard = (card, index, isInHand = false, dropConfig = {}) => {
    return (
      <Card 
        card={card} 
        index={index} 
        isInHand={isInHand}
        onDrop={handleCardDrop}
        canDrag={isCurrentPlayer && isInHand}
        {...dropConfig}
      />
    );
  };

  const calculatePlayerPosition = (index, totalPlayers, radius = 300) => {
    const playerIds = Object.keys(gameState.players);
    const myIndex = playerIds.indexOf(playerId);
    const isCurrentPlayer = playerIds[index] === playerId;
    
    // If this is the current player, position at bottom edge
    if (isCurrentPlayer) {
      return {
        left: '50%',
        bottom: '0px',
        transform: 'translateX(-50%)',
        position: 'absolute',
        paddingBottom: '10px'
      };
    }
    
    // For other players, distribute them in a semicircle at the top
    const remainingPlayers = totalPlayers - 1;
    const currentIndex = index > myIndex ? index - 1 : index;
    
    // Calculate angle for this player, using a 180-degree arc
    const startAngle = -180; // Start from right side
    const angleStep = 180 / (remainingPlayers + 1);
    const angle = startAngle + (angleStep * (currentIndex + 1));
    
    // Convert to radians and calculate position
    const rad = (angle * Math.PI) / 180;
    const x = Math.cos(rad) * radius;
    const y = Math.sin(rad) * (radius * 0.6); // Reduce vertical spacing
    
    return {
      left: `calc(50% + ${x}px)`,
      top: `calc(30% + ${y}px)`, // Position higher up
      transform: 'translate(-50%, -50%)',
      position: 'absolute'
    };
  };

  const renderPlayerHand = (player, position) => {
    const isCurrentPlayer = player.id === playerId;
    const hand = player.hand || [];
    let handToRender = isCurrentPlayer ? hand : hand.map(() => ({ show_back: true }));
    
    // Limit non-current player hands to 10 visible cards
    if (!isCurrentPlayer && handToRender.length > 10) {
      handToRender = handToRender.slice(0, 10);
    }
    
    const handStyle = {
      ...position,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '10px',
      minWidth: '200px',
      maxWidth: '400px',
      overflow: 'visible',
      zIndex: 1,
      borderRadius: '10px',
      transition: 'border-color 0.2s ease'
    };

    const content = (
      <div style={{
        backgroundColor: isCurrentPlayer ? 'rgba(255,255,255,0.15)' : 'transparent',
        borderRadius: isCurrentPlayer ? '10px 10px 0 0' : '10px',
        padding: isCurrentPlayer ? '10px 10px 15px 10px' : '10px',
        position: 'relative'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          paddingLeft: handToRender.length > 1 ? '50px' : '0',
        }}>
          {handToRender.map((card, index) => (
            <Card 
              key={index}
              card={card}
              index={index}
              isInHand={isCurrentPlayer}
              canDrag={isCurrentPlayer && !card.show_back}
            />
          ))}
        </div>
        <div style={{
          textAlign: 'center',
          color: 'white',
          marginTop: '10px',
          fontSize: '0.9em',
          textShadow: '1px 1px 2px rgba(0,0,0,0.5)'
        }}>
          {player.name} {isCurrentPlayer ? '(You)' : `(${hand.length} cards)`}
          {player.is_host && ' (Host)'}
        </div>
      </div>
    );

    return isCurrentPlayer ? content : renderDropZone(`player-${player.id}`, content, handStyle);
  };

  const renderGameCenter = () => {
    if (!gameState) return null;

    const renderDroppablePile = (type, children, style = {}) => {
      return renderDropZone(type, children, {
        width: '80px',
        height: '120px',
        border: '2px dashed rgba(255,255,255,0.3)',
        borderRadius: '8px',
        backgroundColor: 'transparent',
        ...style
      });
    };

    switch (gameType) {
      case 'kings_corner':
        return (
          <div className="kings-corner-container" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '400px',
            maxHeight: '40vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            justifyContent: 'center'
          }}>
            {/* Foundation piles (center) */}
            {[...Array(4)].map((_, index) => {
              const pile = gameState.piles?.[`foundation_${index}`] || [];
              const angle = index * 90;
              return (
                <div key={`foundation_${index}`} style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${Math.cos(angle * Math.PI / 180) * 60}px, ${Math.sin(angle * Math.PI / 180) * 60}px)`,
                  cursor: isCurrentPlayer ? 'pointer' : 'default'
                }}>
                  {pile.length > 0 ? (
                    renderDroppablePile('foundation', pile.map((card, cardIndex) => (
                      <div key={cardIndex} style={{
                        position: 'absolute',
                        transform: `translateY(${cardIndex * 2}px)`
                      }}>
                        <Card card={card} index={cardIndex} canDrag={isCurrentPlayer} />
                      </div>
                    )))
                  ) : (
                    renderDroppablePile('foundation')
                  )}
                </div>
              );
            })}
            
            {/* Corner piles */}
            {[...Array(4)].map((_, index) => {
              const pile = gameState.piles?.[`corner_${index}`] || [];
              const angle = index * 90 + 45;
              return (
                <div key={`corner_${index}`} style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${Math.cos(angle * Math.PI / 180) * 120}px, ${Math.sin(angle * Math.PI / 180) * 120}px)`,
                  cursor: isCurrentPlayer ? 'pointer' : 'default'
                }}>
                  {pile.length > 0 ? (
                    renderDroppablePile('corner', pile.map((card, cardIndex) => (
                      <div key={cardIndex} style={{
                        position: 'absolute',
                        transform: `translateY(${cardIndex * 2}px)`
                      }}>
                        <Card card={card} index={cardIndex} canDrag={isCurrentPlayer} />
                      </div>
                    )))
                  ) : (
                    renderDroppablePile('corner')
                  )}
                </div>
              );
            })}
          </div>
        );

      case 'snap':
        return (
          <div className="snap-center" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '200px',
            maxHeight: '40vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            justifyContent: 'center'
          }}>
            {renderDropZone('center', 
              gameState.center_pile?.slice(-1).map((card, index) => (
                <div key={index} style={{
                  position: 'absolute',
                  transform: `rotate(${Math.random() * 10 - 5}deg)`
                }}>
                  <Card card={card} index={index} canDrag={false} />
                </div>
              )),
              {
                position: 'relative',
                width: '100px',
                height: '140px',
                backgroundColor: 'transparent',
                borderRadius: '8px',
                border: '2px dashed rgba(255,255,255,0.3)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }
            )}
          </div>
        );

      case 'bluff':
        return (
          <div className="bluff-center" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '300px',
            maxHeight: '40vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            justifyContent: 'center'
          }}>
            {/* Center pile */}
            <div className="center-pile" style={{
              position: 'relative',
              minHeight: '120px',
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              {gameState.center_pile?.map((card, index) => (
                <div key={index} style={{
                  position: 'absolute',
                  transform: `rotate(${Math.random() * 10 - 5}deg) translate(${index * 0.5}px, ${index * 0.5}px)`,
                  zIndex: index
                }}>
                  {renderCard(card)}
                </div>
              ))}
            </div>

            {/* Last play information */}
            {gameState.last_play && (
              <div style={{
                color: 'white',
                textAlign: 'center',
                padding: '10px',
                backgroundColor: 'rgba(0,0,0,0.3)',
                borderRadius: '5px'
              }}>
                {gameState.players[gameState.last_play.player]?.name} played {gameState.last_play.count} {gameState.last_play.rank}{gameState.last_play.count !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        );

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
            gap: '10px',
            marginBottom: '160px' // Add space above the player's cards
          }}>
            {[...Array(gameState.total_spoons || (Object.keys(gameState.players).length - 1))].map((_, index) => {
              const isAvailable = index < (gameState.spoons || 0);
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
                    src="/public/spoon-at-45-degree-angle.png"
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

      case 'scat':
        return (
          <div className="scat-center" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '400px',
            maxHeight: '40vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            justifyContent: 'center'
          }}>
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
                {gameState.deck?.cards_remaining > 0 && (
                  <Card 
                    card={{
                      show_back: true,
                      image_back: '/public/cards/back_dark.png'
                    }}
                    index={0}
                    canDrag={false}
                  />
                )}
                <div style={{
                  position: 'absolute',
                  bottom: '-25px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: 'white',
                  fontSize: '0.8em'
                }}>
                  Draw ({gameState.deck?.cards_remaining})
                </div>
              </div>

              {/* Discard pile */}
              {renderDropZone('discard',
                gameState.discard_pile?.slice(-1).map((card, index) => (
                  <Card key={index} card={card} index={index} canDrag={false} />
                )),
                {
                  position: 'relative',
                  cursor: isCurrentPlayer ? 'pointer' : 'default',
                  transition: 'transform 0.2s',
                  transform: isCurrentPlayer ? 'scale(1.05)' : 'scale(1)',
                  borderRadius: '8px',
                  padding: '4px'
                }
              )}
            </div>
          </div>
        );

      case 'rummy':
        return (
          <div className="rummy-center" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '600px',
            maxHeight: '40vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            justifyContent: 'center'
          }}>
            {/* Melds area */}
            <div className="melds-area" style={{
              width: '100%',
              minHeight: '150px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              padding: '10px',
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderRadius: '10px'
            }}>
              {gameState.melds?.map((meld, meldIndex) => (
                renderDropZone(`meld-${meldIndex}`,
                  meld.map((card, cardIndex) => (
                    <div key={cardIndex} style={{
                      transform: 'translateX(-30px)',
                      marginLeft: cardIndex === 0 ? '0' : '-30px'
                    }}>
                      <Card card={card} index={cardIndex} canDrag={isCurrentPlayer} />
                    </div>
                  )),
                  {
                    display: 'flex',
                    gap: '5px'
                  }
                )
              ))}
              {/* Empty meld drop zone */}
              {isCurrentPlayer && renderDropZone('meld', null, {
                width: '120px',
                height: '150px',
                border: '2px dashed rgba(255,255,255,0.3)',
                borderRadius: '10px'
              })}
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
            width: '600px',
            maxHeight: '40vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            justifyContent: 'center'
          }}>
            {/* Game info */}
            <div className="game-info" style={{
              color: 'white',
              textAlign: 'center',
              fontSize: '1.2em'
            }}>
              <div>Trump: ♠</div>
              {gameState.current_trick_winner && (
                <div style={{ color: '#FFD700' }}>
                  {gameState.players[gameState.current_trick_winner]?.name} won the trick!
                </div>
              )}
            </div>

            {/* Current trick */}
            <div className="current-trick" style={{
              position: 'relative',
              width: '200px',
              height: '200px'
            }}>
              {gameState.current_trick?.map((play, index) => {
                const angle = index * (360 / 4); // 4 positions for 4 players
                const radius = 80; // Distance from center
                return (
                  <div key={index} style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) rotate(${angle}deg) translate(${radius}px) rotate(-${angle}deg)`
                  }}>
                    {renderCard(play.card)}
                    <div style={{
                      position: 'absolute',
                      bottom: '-20px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      color: 'white',
                      fontSize: '0.8em',
                      whiteSpace: 'nowrap'
                    }}>
                      {gameState.players[play.player]?.name}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Score display */}
            <div className="scores" style={{
              display: 'flex',
              gap: '20px',
              color: 'white'
            }}>
              <div>NS: {gameState.scores?.ns || 0}</div>
              <div>EW: {gameState.scores?.ew || 0}</div>
            </div>
          </div>
        );

      default:
        return (
          <div className="unsupported-game" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'white',
            textAlign: 'center'
          }}>
            Unsupported game type: {gameType}
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
            gap: '10px',
            marginBottom: '160px' // Add space above the player's cards
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
            gap: '10px',
            marginBottom: '160px' // Add space above the player's cards
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
            gap: '10px',
            marginBottom: '160px' // Add space above the player's cards
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
            gap: '10px',
            marginBottom: '160px' // Add space above the player's cards
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
            gap: '10px',
            marginBottom: '160px' // Add space above the player's cards
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

  useEffect(() => {
    if (gameState?.current_player === playerId) {
      setIsCurrentPlayer(true);
    } else {
      setIsCurrentPlayer(false);
    }
  }, [gameState?.current_player, playerId]);

  return (
    <div className="theme-independent">
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        measuring={{
          droppable: {
            strategy: MeasuringStrategy.Always
          }
        }}
      >
        <div className="game-view">
          {error && (
            <div className="error-message" style={{
              position: 'absolute',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(255,0,0,0.8)',
              color: 'white',
              padding: '10px 20px',
              borderRadius: '5px',
              zIndex: 100
            }}>
              {error}
            </div>
          )}

          {/* Game center area */}
          {renderGameCenter()}

          {/* Players around the table */}
          {gameState && Object.entries(gameState.players).map(([id, player], index) => {
            const position = calculatePlayerPosition(
              index,
              Object.keys(gameState.players).length
            );
            return renderPlayerHand(
              { ...player, id },
              position
            );
          })}

          {/* Leave Game button */}
          <button
            onClick={handleLeaveGame}
            className="leave-game"
            style={{
              position: 'fixed',
              top: '20px',
              left: '20px',
              padding: '10px 20px',
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              zIndex: 1000,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            Leave Game
          </button>

          {renderGameControls()}
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeId ? (
            <Card
              card={activeDragData?.card}
              index={activeDragData?.index}
              isInHand={false}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default GameView;

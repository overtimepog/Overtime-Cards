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
import backDark from '../components/cards/back_dark.png';

// CSS for card interactions
const cardStyles = `
  .card-container {
    user-select: none;
    -webkit-user-select: none;
  }

  .card-container.clickable {
    cursor: pointer;
  }

  .card-container.clickable .card-content {
    transition: all 0.3s ease;
  }

  .card-container.clickable:hover .card-content {
    transform: translateY(-10px);
  }

  .card-container.clickable:active .card-content {
    transform: translateY(-5px);
  }
`;

// Add styles to document
if (!document.getElementById('card-styles')) {
  const styleSheet = document.createElement('style');
  styleSheet.id = 'card-styles';
  styleSheet.textContent = cardStyles;
  document.head.appendChild(styleSheet);
}

// --- Draggable / Droppable placeholder components ---
function Draggable({ id, data, style, ariaLabel, className, children }) {
  // This is a simple pass-through; DnD-kit handles the actual logic via DndContext
  return (
    <div
      id={id}
      data-dndkit-draggable
      data-drag-data={JSON.stringify(data)}
      style={style}
      role="button"
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </div>
  );
}

function Droppable({ id, data, style, ariaLabel, children }) {
  return (
    <div
      id={id}
      data-dndkit-droppable
      data-drop-data={JSON.stringify(data)}
      style={style}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

// Custom hook for managing all drop zones
const useGameDropZones = (gameState, playerId) => {
  // Create an array of all possible drop zone IDs
  const dropZoneIds = useMemo(() => {
    // We only define standardZones for the "center" or game piles
    const standardZones = ['foundation', 'corner', 'meld', 'discard', 'center'];
    // No player zones - we don't want any hands to be droppable
    return standardZones;
  }, []);

  // Create a map of all drop zone data
  const dropZoneData = useMemo(() => {
    const data = {};
    dropZoneIds.forEach(id => {
      data[id] = { type: id };
    });
    return data;
  }, [dropZoneIds]);

  return {
    dropZoneIds,
    dropZoneData,
  };
};

// Card component with drag and drop functionality
const Card = React.memo(({ 
  card, 
  index, 
  isInHand,
  canDrag = true, 
  onCardClick,
  style = {},
  gameType,
  isSelected = false
}) => {
  const [isHovered, setIsHovered] = useState(false);
  
  if (!card) return null;
  
  const imagePath = card.show_back ? 
    backDark : 
    require(`../components/cards/${card.suit.toLowerCase()}_${card.rank}.png`);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation(); 
    if (onCardClick && !card.show_back) {
      onCardClick(index);
    }
  };

  // Only apply selection and hover effects if the card is in the player's hand
  const consolidatedStyle = {
    container: {
      position: 'relative',
      zIndex: isInHand ? (isSelected ? 1000 + index : (isHovered ? 900 + index : 100 + index)) : 100,
      isolation: 'isolate',
      cursor: onCardClick && !card.show_back ? 'pointer' : 'default',
      pointerEvents: 'auto',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      transform: isInHand ? (isSelected ? 'translateY(-20px)' : (isHovered ? 'translateY(-10px)' : 'none')) : 'none',
      ...style // Allow custom style overrides
    },
    image: {
      width: '80px',
      height: 'auto',
      borderRadius: '8px',
      boxShadow: isInHand ? (
        isSelected 
          ? '0 0 0 3px #4CAF50, 0 0 15px rgba(76,175,80,0.5), 0 8px 16px rgba(0,0,0,0.3)'
          : isHovered 
            ? '0 8px 16px rgba(0,0,0,0.3)' 
            : '0 2px 4px rgba(0,0,0,0.1)'
      ) : '0 2px 4px rgba(0,0,0,0.1)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      pointerEvents: 'none',
      position: 'relative',
      transform: isInHand && isSelected ? 'scale(1.05)' : 'none'
    }
  };

  const cardContent = (
    <div 
      className="card-content"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      style={consolidatedStyle.container}
    >
      <img 
        src={imagePath}
        alt={card.show_back ? "Card back" : `${card.rank} of ${card.suit}`}
        className="card-image"
        style={consolidatedStyle.image}
      />
    </div>
  );

  if (canDrag && !card.show_back && isInHand) {
    const cardId = `hand-card-${card.suit}_${card.rank}_${index}`;
    return (
      <Draggable
        id={cardId}
        data={{ card, index }}
        style={consolidatedStyle.container}
        ariaLabel={card.show_back ? "Face down card" : `${card.rank} of ${card.suit}`}
        className="card-container"
      >
        {cardContent}
      </Draggable>
    );
  }

  return (
    <div 
      className={`card-container ${onCardClick && !card.show_back ? 'clickable' : ''}`}
      style={consolidatedStyle.container}
    >
      {cardContent}
    </div>
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
  const [isCurrentPlayerTurn, setIsCurrentPlayerTurn] = useState(false);
  const [showSets, setShowSets] = useState(false);
  const [playerHandOrder, setPlayerHandOrder] = useState([]);
  // Initialize drop zones using the custom hook
  const { dropZoneData } = useGameDropZones(gameState, playerId);

  const BASE_URL = process.env.REACT_APP_API_URL || "https://overtime-cards-api.onrender.com/api/v1";

  // Setup DnD sensors with proper configuration
  const sensors = useSensors(
    useSensor(MouseSensor, {
      // Adjust these as needed so quick clicks aren't always interpreted as a drag
      activationConstraint: {
        distance: 10, // Minimum distance before a drag starts
        tolerance: 5,  // Tolerance for slight movements
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,     // Wait before activating drag
        tolerance: 5,   // Tolerance for slight movements
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

    const activeId = active.id;
    const overId = over.id;

    // Check if both cards are from the player's hand
    const isActiveInHand = activeId.startsWith('hand-card-');
    const isOverInHand = overId.startsWith('hand-card-');

    if (isActiveInHand && isOverInHand) {
      setPlayerHandOrder((oldOrder) => {
        const oldIndex = oldOrder.indexOf(activeId.replace('hand-card-', ''));
        const newIndex = oldOrder.indexOf(overId.replace('hand-card-', ''));

        if (oldIndex === -1 || newIndex === -1) return oldOrder;

        const newOrder = [...oldOrder];
        const [moved] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, moved);
        return newOrder;
      });
    } else {
      // Handle drops on game zones (existing logic)
      const sourceItem = active.data.current;
      const targetZone = dropZoneData[over.id];

      if (targetZone) {
        handleCardDrop(sourceItem, targetZone);
      }
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
      
      // Call leave room API endpoint with correct URL structure
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
          
          // Update current player turn status
          const isMyTurn = String(newState.current_player) === String(playerId);
          setIsCurrentPlayerTurn(isMyTurn);
          
          // Update game state
          setGameState(prevState => {
            // If this is a game update, merge with previous state
            if (data.type === 'game_update') {
              return {
                ...prevState,
                ...newState,
                last_action: newState.last_action || prevState?.last_action,
                current_player: newState.current_player || prevState?.current_player,
                players: {
                  ...prevState?.players,
                  ...newState.players
                }
              };
            }
            // If this is a full game state, replace everything
            return newState;
          });
          
          if (data.type === 'game_update' && data.result && !data.result.success) {
            setError(data.result.message || 'Action failed');
          }
          
          // Clear selected cards when turn changes
          if (data.type === 'game_update' && String(newState.current_player) !== String(playerId)) {
            setSelectedCards([]);
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
          
          // Update current player turn status
          const isMyTurn = String(newState.current_player) === String(playerId);
          setIsCurrentPlayerTurn(isMyTurn);
          
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
      // Clear any previous errors
      setError('');

      // Log for debugging
      console.log('Sending game action:', actionType, actionData);

      // Construct request body to match the Python endpoint
      const response = await fetch(`${BASE_URL}/game-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': window.location.origin,
        },
        body: JSON.stringify({
          room_code: roomCode,            // Ensures the server sees which room we're in
          player_id: parseInt(playerId),  // Player ID must be numeric
          action_type: actionType,        // e.g. "play_card", "snap", "draw_card", etc.
          action_data: {
            ...actionData,
            game_type: gameType,         // e.g. "snap", "go_fish", "bluff", etc.
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to perform action');
      }

      // The server might return a JSON response with the updated game state if needed
      // Remove or modify as needed:
      await response.json();

      // If the action was related to card selection, reset selection
      if (actionType.includes('card')) {
        setSelectedCards([]);
      }

    } catch (err) {
      console.error('Error performing game action:', err);
      setError(err.message || 'Failed to perform action. Please try again.');
      
      // If the action was related to card selection, reset selection
      if (actionType.includes('card')) {
        setSelectedCards([]);
      }
    }
  };

  const handleCardClick = (index) => {
    if (!isCurrentPlayerTurn) return;

    const maxSelectable = gameState?.max_selectable_cards || 1;

    if (selectedCards.includes(index)) {
      // If card is already selected, deselect it
      setSelectedCards(selectedCards.filter(i => i !== index));
    } else {
      // If card is not selected, check if we can select more cards
      if (selectedCards.length >= maxSelectable) {
        // Show warning if trying to select more than allowed
        setError(`You can only select up to ${maxSelectable} card${maxSelectable !== 1 ? 's' : ''} at a time`);
        setTimeout(() => setError(''), 3000); // Clear error after 3 seconds
        return;
      }
      setSelectedCards([...selectedCards, index]);
    }
  };

  const handleCardDrop = (source, target) => {
    if (!gameState?.players?.[playerId]?.hand) return;
    
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
        canDrag={isCurrentPlayerTurn && isInHand && !card.show_back}
        onCardClick={
          // We'll allow click to select if it's in your hand and the card isn't face-down, it also needs to be your turn
          isInHand && !card.show_back && isCurrentPlayerTurn
            ? () => handleCardClick(index)
            : undefined
        }
        isSelected={selectedCards.includes(index)}
        gameType={gameType}
        {...dropConfig}
      />
    );
  };

  const calculatePlayerPosition = (index, totalPlayers, radius = 300) => {
    const playerIds = Object.keys(gameState.players);
    const myIndex = playerIds.indexOf(playerId);
    const isCurrentPlayerHand = playerIds[index] === playerId;
    
    // If this is the current player, position at bottom edge
    if (isCurrentPlayerHand) {
      return {
        left: '50%',
        bottom: '0',
        transform: 'translateX(-50%)',
        position: 'fixed',
        width: 'auto',
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
      position: 'absolute',
      zIndex: 1
    };
  };

  const renderPlayerHand = (player, position) => {
    const isCurrentPlayerHand = player.id === playerId;
    const isTheirTurn = player.id === gameState.current_player;
    const hand = player.hand || [];
    
    let handToRender;
    if (isCurrentPlayerHand) {
      // Use playerHandOrder for the current player's hand
      handToRender = playerHandOrder.map(cardId => {
        const [suit, rank] = cardId.split('_');
        return hand.find(card => card.suit === suit && card.rank === rank);
      }).filter(Boolean);
    } else {
      // For other players, show backs
      handToRender = hand.map(() => ({ show_back: true }));
    }

    // Limit non-current player hands to 10 visible cards
    if (!isCurrentPlayerHand && handToRender.length > 10) {
      handToRender = handToRender.slice(0, 10);
    }

    const handStyle = {
      ...position,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: isCurrentPlayerHand ? '10px 10px 0 10px' : '10px',
      minWidth: '200px',
      maxWidth: '400px',
      overflow: 'visible',
      borderRadius: '10px',
      transition: 'border-color 0.2s ease',
      bottom: isCurrentPlayerHand ? 0 : position.bottom
    };

    const content = (
      <div style={{
        backgroundColor: isCurrentPlayerHand ? 'rgba(255,255,255,0.15)' : 'transparent',
        borderRadius: isCurrentPlayerHand ? '10px 10px 0 0' : '10px',
        padding: isCurrentPlayerHand ? '10px 10px 15px 10px' : '10px',
        position: 'relative',
        animation: isTheirTurn ? 'glow 2s ease-in-out infinite' : 'none',
        boxShadow: isTheirTurn ? '0 0 20px #FFD700' : 'none'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          paddingLeft: handToRender.length > 1 ? '30px' : '0',
          position: 'relative',
          marginLeft: '-25px',
        }}>
          {handToRender.map((card, idx) => (
            <div key={`${card.suit}_${card.rank}_${idx}`} style={{
              marginLeft: idx === 0 ? '0' : '-25px',
            }}>
              {renderCard(card, idx, isCurrentPlayerHand, isCurrentPlayerTurn)}
            </div>
          ))}
        </div>
        <div style={{
          textAlign: 'center',
          color: 'white',
          marginTop: '10px',
          fontSize: '0.9em',
          textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
          padding: '5px 15px',
          borderRadius: '15px',
          backgroundColor: isTheirTurn ? 'rgba(255, 215, 0, 0.2)' : 'transparent',
          border: isTheirTurn ? '1px solid rgba(255, 215, 0, 0.5)' : 'none',
          transition: 'all 0.3s ease'
        }}>
          {player.name} {isCurrentPlayerHand ? '(You)' : `(${hand.length} cards)`}
          {player.is_host && ' (Host)'}
        </div>
      </div>
    );

    return <div style={handStyle}>{content}</div>;
  };

  // Add global CSS animations
  useEffect(() => {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'game-animations';
    styleSheet.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      @keyframes bounceIn {
        0% { transform: scale(0.3); opacity: 0; }
        50% { transform: scale(1.05); opacity: 0.8; }
        70% { transform: scale(0.9); opacity: 0.9; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes glow {
        0% { box-shadow: 0 0 5px rgba(255,215,0,0.5); }
        50% { box-shadow: 0 0 20px rgba(255,215,0,0.8); }
        100% { box-shadow: 0 0 5px rgba(255,215,0,0.5); }
      }
      .card-transfer {
        transition: all 0.5s ease;
      }
      .button-hover {
        transition: transform 0.2s ease;
      }
      .button-hover:hover {
        transform: scale(1.05);
      }
      .fade-in {
        animation: fadeIn 0.3s ease;
      }
      .bounce-in {
        animation: bounceIn 0.5s ease;
      }
      .pulse {
        animation: pulse 1.5s infinite;
      }
      .glow {
        animation: glow 2s ease-in-out infinite;
      }
    `;
    document.head.appendChild(styleSheet);

    return () => {
      const existingStyle = document.getElementById('game-animations');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  const renderGame = () => {
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
            maxHeight: '60vh',
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
                  cursor: isCurrentPlayerTurn ? 'pointer' : 'default'
                }}>
                  {pile.length > 0 ? (
                    renderDroppablePile('foundation', pile.map((card, cardIndex) => (
                      <div key={cardIndex} style={{
                        position: 'absolute',
                        transform: `translateY(${cardIndex * 2}px)`
                      }}>
                        {renderCard(card, cardIndex, false)}
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
                  cursor: isCurrentPlayerTurn ? 'pointer' : 'default'
                }}>
                  {pile.length > 0 ? (
                    renderDroppablePile('corner', pile.map((card, cardIndex) => (
                      <div key={cardIndex} style={{
                        position: 'absolute',
                        transform: `translateY(${cardIndex * 2}px)`
                      }}>
                        {renderCard(card, cardIndex, false)}
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
          <div className="snap-game" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '200px',
            maxHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            justifyContent: 'center'
          }}>
            {/* Center pile */}
            {renderDropZone('center', 
              gameState.center_pile?.slice(-1).map((card, index) => (
                <div key={index} style={{
                  position: 'absolute',
                  transform: `rotate(${Math.random() * 10 - 5}deg)`
                }}>
                  {renderCard(card, index, false)}
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

            {/* Game controls */}
            <div className="game-controls" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '100px'
            }}>
              {isCurrentPlayerTurn && (
                <button 
                  onClick={() => handleGameAction('play_card')}
                  className="button-hover"
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
                className="button-hover pulse"
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
          </div>
        );

      case 'spoons':
        return (
          <div className="spoons-game" style={{ 
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '200px',
            height: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            justifyContent: 'center'
          }}>
            {/* Spoons container */}
            <div className="spoons-container" style={{ 
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '100px'
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

            {/* Game controls */}
            {isCurrentPlayerTurn && (
              <div className="game-controls" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '80px'
              }}>
                <button 
                  onClick={() => {
                    if (selectedCards.length === 1) {
                      handleGameAction('play_card', { card_index: selectedCards[0] });
                      setSelectedCards([]);
                    }
                  }}
                  className="button-hover"
                  style={{
                    backgroundColor: selectedCards.length === 1 ? '#4CAF50' : '#ccc',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '5px',
                    cursor: selectedCards.length === 1 ? 'pointer' : 'not-allowed'
                  }}
                  disabled={selectedCards.length !== 1}
                >
                  Pass Card
                </button>
              </div>
            )}
          </div>
        );

      case 'go_fish':
        return (
          <div className="go-fish-game" style={{
            position: 'absolute',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Draw pile */}
            <div className="center-area" style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              gap: '40px',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <div style={{
                position: 'relative',
                cursor: isCurrentPlayerTurn ? 'pointer' : 'default'
              }}>
                {gameState.deck_size > 0 && renderCard({ show_back: true }, 0, false)}
                <div style={{
                  position: 'absolute',
                  bottom: '-25px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: 'white',
                  fontSize: '0.8em',
                  whiteSpace: 'nowrap'
                }}>
                  Draw Pile ({gameState.deck_size})
                </div>
              </div>
            </div>

            <div className="game-controls" style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              position: 'absolute',
              bottom: '275px',
              left: '50%',
              transform: 'translateX(-50%)',
              opacity: isCurrentPlayerTurn ? '1' : '0.5',
              transition: 'opacity 0.3s ease',
              zIndex: 10000,
              backdropFilter: 'blur(5px)',
              WebkitBackdropFilter: 'blur(5px)',
              padding: '15px',
              borderRadius: '15px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              {/* Turn indicator */}
              <div style={{
                color: 'white',
                textAlign: 'center',
                padding: '10px 20px',
                backgroundColor: isCurrentPlayerTurn ? 'rgba(76,175,80,0.8)' : 'rgba(0,0,0,0.5)',
                borderRadius: '5px',
                marginBottom: '10px',
                transition: 'all 0.3s ease'
              }}>
                {isCurrentPlayerTurn ? "Your Turn!" : `${gameState.players[gameState.current_player]?.name}'s Turn`}
              </div>

              {/* Last action display */}
              {gameState.last_action && (
                <div style={{
                  color: 'white',
                  textAlign: 'center',
                  padding: '10px 20px',
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderRadius: '5px',
                  marginBottom: '10px',
                  animation: 'fadeIn 0.3s ease'
                }}>
                  {gameState.last_action.action === 'go_fish' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <span className="fade-in">
                        {gameState.players[gameState.last_action.player]?.name} asked for {gameState.last_action.rank}s - Go Fish!
                      </span>
                      {gameState.last_action.player === playerId && (
                        <button
                          onClick={() => handleGameAction('draw_card')}
                          className="button-hover pulse"
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '5px',
                            cursor: 'pointer'
                          }}
                        >
                          Draw a Card
                        </button>
                      )}
                    </div>
                  ) : gameState.last_action.action === 'got_cards' ? (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '5px'
                    }}>
                      <span className="bounce-in">
                        {gameState.players[gameState.last_action.player]?.name} got {gameState.last_action.count} {gameState.last_action.rank}{gameState.last_action.count > 1 ? 's' : ''}!
                      </span>
                      {gameState.last_action.player === playerId && (
                        <div className="fade-in" style={{
                          color: '#FFD700',
                          fontSize: '0.9em'
                        }}>
                          Cards added to your hand!
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Player selection for asking cards */}
              {isCurrentPlayerTurn && selectedCards.length === 1 && !gameState.last_action?.action === 'go_fish' && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  padding: '15px',
                  borderRadius: '10px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}>
                  <div style={{ color: 'white', marginBottom: '5px', fontWeight: 'bold' }}>
                    Ask for {gameState?.players?.[playerId]?.hand?.[selectedCards[0]]?.rank}s
                  </div>
                  <select 
                    onChange={(e) => {
                      if (e.target.value) {
                        handleGameAction('ask_for_cards', {
                          target_player_id: parseInt(e.target.value),
                          rank: gameState?.players?.[playerId]?.hand?.[selectedCards[0]]?.rank
                        });
                        setSelectedCards([]);
                      }
                    }}
                    style={{
                      padding: '10px',
                      borderRadius: '5px',
                      border: '1px solid #4CAF50',
                      backgroundColor: 'white',
                      minWidth: '200px',
                      cursor: 'pointer',
                      outline: 'none',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Select a player to ask</option>
                    {Object.entries(gameState.players || {})
                      .filter(([id]) => id !== playerId)
                      .map(([id, player]) => (
                        <option key={id} value={id}>
                          {player.name} ({player.hand_size} cards)
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Instructions when it's player's turn but no card selected */}
              {isCurrentPlayerTurn && selectedCards.length === 0 && !gameState.last_action?.action === 'go_fish' && (
                <div style={{
                  color: 'white',
                  textAlign: 'center',
                  padding: '10px',
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderRadius: '5px',
                  fontStyle: 'italic'
                }}>
                  Select a card to ask for its rank
                </div>
              )}

              {/* View Sets Button */}
              {Object.values(gameState.completed_sets || {}).some(sets => sets.length > 0) && (
                <button
                  onClick={() => setShowSets(true)}
                  className="button-hover"
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#2196F3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    marginTop: '10px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    transition: 'transform 0.2s ease',
                    '&:hover': {
                      transform: 'scale(1.05)'
                    }
                  }}
                >
                  View Sets ({Object.values(gameState.completed_sets).reduce((total, sets) => total + sets.length, 0)})
                </button>
              )}
            </div>

            {/* Sets Overlay */}
            {showSets && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.8)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 10000
              }} onClick={() => setShowSets(false)}>
                <div style={{
                  backgroundColor: 'white',
                  padding: '20px',
                  borderRadius: '10px',
                  maxWidth: '80%',
                  maxHeight: '80%',
                  overflow: 'auto'
                }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ marginTop: 0 }}>Completed Sets</h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '20px',
                    padding: '10px'
                  }}>
                    {Object.entries(gameState.completed_sets || {}).map(([pid, sets]) => (
                      <div key={pid} style={{
                        backgroundColor: '#f5f5f5',
                        padding: '15px',
                        borderRadius: '8px'
                      }}>
                        <div style={{
                          fontWeight: 'bold',
                          marginBottom: '10px',
                          color: pid === playerId ? '#4CAF50' : 'inherit'
                        }}>
                          {gameState.players[pid]?.name} {pid === playerId ? '(You)' : ''}
                        </div>
                        <div style={{ color: '#666' }}>Sets: {sets.length}</div>
                        <div style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '5px',
                          marginTop: '10px'
                        }}>
                          {sets.map((set, index) => (
                            <div key={index} style={{
                              padding: '5px 10px',
                              backgroundColor: 'white',
                              borderRadius: '4px',
                              border: '1px solid #ddd'
                            }}>
                              {set.rank}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setShowSets(false)}
                    className="button-hover"
                    style={{
                      marginTop: '20px',
                      padding: '10px 20px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      case 'rummy':
        return (
          <div className="rummy-game" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            maxWidth: '800px',
            height: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            {/* Melds display area */}
            <div className="melds-area" style={{
              width: '100%',
              minHeight: '150px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '20px',
              justifyContent: 'center',
              alignItems: 'flex-start',
              padding: '20px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: '10px'
            }}>
              {gameState.melds?.map((meld, meldIndex) => (
                <div key={meldIndex} style={{
                  display: 'flex',
                  position: 'relative',
                  padding: '10px',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  marginLeft: meldIndex === 0 ? '0' : '-20px'
                }}>
                  {renderDropZone(`meld_${meldIndex}`,
                    meld.map((card, cardIndex) => (
                      <div key={`${card.suit}_${card.rank}`} style={{
                        marginLeft: cardIndex === 0 ? '0' : '-40px',
                        transition: 'transform 0.2s ease'
                      }}>
                        {renderCard(card, cardIndex, false, isCurrentPlayerTurn)}
                      </div>
                    )),
                    {
                      display: 'flex',
                      minWidth: '100px',
                      minHeight: '120px',
                      justifyContent: 'center',
                      alignItems: 'center',
                      border: '2px dashed rgba(255,255,255,0.2)',
                      borderRadius: '8px',
                      margin: '5px'
                    }
                  )}
                </div>
              ))}
            </div>

            {/* Center area with draw and discard piles */}
            <div className="center-area" style={{
              display: 'flex',
              gap: '40px',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              {/* Draw pile */}
              <div 
                onClick={() => isCurrentPlayerTurn && handleGameAction('draw_card', { source: 'deck' })}
                style={{
                  cursor: isCurrentPlayerTurn ? 'pointer' : 'default',
                  position: 'relative'
                }}
              >
                {gameState.deck_size > 0 && (
                  renderCard({ show_back: true }, 0, false)
                )}
                <div style={{
                  position: 'absolute',
                  bottom: '-25px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: 'white',
                  fontSize: '0.8em',
                  whiteSpace: 'nowrap'
                }}>
                  Draw Pile ({gameState.deck_size})
                </div>
              </div>

              {/* Discard pile */}
              {renderDropZone('discard',
                gameState.discard_pile?.slice(-1).map((card, index) => (
                  <div key={index}>
                    {renderCard(card, index, false)}
                  </div>
                )) || [],
                {
                  width: '80px',
                  height: '120px',
                  border: '2px dashed rgba(255,255,255,0.3)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }
              )}
            </div>

            {/* Game controls */}
            {isCurrentPlayerTurn && (
              <div className="game-controls" style={{
                display: 'flex',
                gap: '10px',
                position: 'absolute',
                bottom: '200px',
                zIndex: 1000
              }}>
                {selectedCards.length > 0 && (
                  <>
                    <button
                      onClick={() => {
                        handleGameAction('create_meld', {
                          card_indices: selectedCards
                        });
                        setSelectedCards([]);
                      }}
                      className="button-hover"
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                      disabled={selectedCards.length < 3}
                    >
                      Create Meld
                    </button>
                    <button
                      onClick={() => {
                        if (selectedCards.length === 1) {
                          handleGameAction('discard_card', {
                            card_index: selectedCards[0]
                          });
                          setSelectedCards([]);
                        }
                      }}
                      className="button-hover"
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                      disabled={selectedCards.length !== 1}
                    >
                      Discard
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );

      case 'scat':
        return (
          <div className="scat-game" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            maxWidth: '800px',
            height: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            {/* Center area with draw and discard piles */}
            <div className="center-area" style={{
              display: 'flex',
              gap: '40px',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              {/* Draw pile */}
              <div 
                onClick={() => isCurrentPlayerTurn && handleGameAction('draw_card', { source: 'deck' })}
                style={{
                  cursor: isCurrentPlayerTurn ? 'pointer' : 'default',
                  position: 'relative'
                }}
              >
                {gameState.deck_size > 0 && (
                  renderCard({ show_back: true }, 0, false)
                )}
                <div style={{
                  position: 'absolute',
                  bottom: '-25px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  color: 'white',
                  fontSize: '0.8em',
                  whiteSpace: 'nowrap'
                }}>
                  Draw Pile ({gameState.deck_size})
                </div>
              </div>

              {/* Discard pile */}
              {renderDropZone('discard',
                gameState.discard_pile?.slice(-1).map((card, index) => (
                  <div key={index}>
                    {renderCard(card, index, false)}
                  </div>
                )) || [],
                {
                  width: '80px',
                  height: '120px',
                  border: '2px dashed rgba(255,255,255,0.3)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }
              )}
            </div>

            {/* Game controls */}
            {isCurrentPlayerTurn && (
              <div className="game-controls" style={{
                display: 'flex',
                gap: '10px',
                position: 'absolute',
                bottom: '200px',
                zIndex: 1000
              }}>
                {selectedCards.length === 1 && (
                  <button
                    onClick={() => {
                      handleGameAction('discard_card', {
                        card_index: selectedCards[0]
                      });
                      setSelectedCards([]);
                    }}
                    className="button-hover"
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    Discard
                  </button>
                )}
                {selectedCards.length === 3 && (
                  <button
                    onClick={() => {
                      handleGameAction('declare_scat', {
                        card_indices: selectedCards
                      });
                      setSelectedCards([]);
                    }}
                    className="button-hover pulse"
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer'
                    }}
                  >
                    Declare Scat!
                  </button>
                )}
              </div>
            )}
          </div>
        );

      case 'spades':
        return (
          <div className="spades-game" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            maxWidth: '800px',
            height: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            {/* Tricks and score display */}
            <div className="score-display" style={{
              display: 'flex',
              justifyContent: 'space-around',
              width: '100%',
              padding: '10px',
              backgroundColor: 'rgba(255,255,255,0.1)',
              borderRadius: '10px',
              marginBottom: '20px'
            }}>
              {Object.entries(gameState.teams || {}).map(([team, data]) => (
                <div key={team} style={{
                  textAlign: 'center',
                  padding: '10px',
                  color: 'white'
                }}>
                  <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>Team {team}</div>
                  <div>Score: {data.score || 0}</div>
                  <div>Tricks: {data.tricks || 0}</div>
                  <div>Bid: {data.bid || 0}</div>
                </div>
              ))}
            </div>

            {/* Current trick display */}
            <div className="current-trick" style={{
              position: 'relative',
              width: '300px',
              height: '300px'
            }}>
              {gameState.current_trick?.map((play, index) => {
                const angle = (index * 90) * (Math.PI / 180);
                const radius = 100;
                const x = Math.cos(angle) * radius;
                const y = Math.sin(angle) * radius;
                
                return (
                  <div key={index} style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
                  }}>
                    {renderCard(play.card, index, false)}
                  </div>
                );
              })}
            </div>

            {/* Game controls */}
            {isCurrentPlayerTurn && (
              <div className="game-controls" style={{
                display: 'flex',
                gap: '10px',
                position: 'absolute',
                bottom: '200px',
                zIndex: 1000
              }}>
                {gameState.phase === 'bidding' ? (
                  <div className="bidding-controls" style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center'
                  }}>
                    <input
                      type="number"
                      min="0"
                      max="13"
                      value={gameState.current_bid || 0}
                      onChange={(e) => {
                        const bid = Math.max(0, Math.min(13, parseInt(e.target.value) || 0));
                        handleGameAction('place_bid', { bid });
                      }}
                      style={{
                        width: '60px',
                        padding: '5px',
                        borderRadius: '5px',
                        border: '1px solid #ccc'
                      }}
                    />
                    <button
                      onClick={() => handleGameAction('confirm_bid')}
                      className="button-hover"
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      Confirm Bid
                    </button>
                  </div>
                ) : (
                  selectedCards.length === 1 && (
                    <button
                      onClick={() => {
                        handleGameAction('play_card', {
                          card_index: selectedCards[0]
                        });
                        setSelectedCards([]);
                      }}
                      className="button-hover"
                      style={{
                        padding: '10px 20px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      Play Card
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        );

      case 'bluff':
        return (
          <div className="bluff-game" style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80%',
            maxWidth: '800px',
            height: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px'
          }}>
            {/* Center pile */}
            <div className="center-pile" style={{
              position: 'relative',
              width: '120px',
              height: '160px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              {renderDropZone('center',
                gameState.center_pile?.slice(-1).map((card, index) => (
                  <div key={index}>
                    {renderCard({ show_back: true }, index, false)}
                  </div>
                )) || [],
                {
                  width: '100%',
                  height: '100%',
                  border: '2px dashed rgba(255,255,255,0.3)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center'
                }
              )}
              <div style={{
                position: 'absolute',
                bottom: '-30px',
                color: 'white',
                fontSize: '0.9em',
                textAlign: 'center'
              }}>
                Center Pile ({gameState.center_pile_size || 0} cards)
                {gameState.last_claim && (
                  <div style={{ marginTop: '5px', color: '#FFD700' }}>
                    Last claim: {gameState.last_claim.count} {gameState.last_claim.rank}s
                  </div>
                )}
              </div>
            </div>

            {/* Game controls */}
            {isCurrentPlayerTurn && (
              <div className="game-controls" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                position: 'absolute',
                bottom: '200px',
                zIndex: 1000
              }}>
                {gameState.last_claim && (
                  <button
                    onClick={() => handleGameAction('call_bluff')}
                    className="button-hover pulse"
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#f44336',
                      color: 'white',
                      border: 'none',
                      borderRadius: '5px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    Call Bluff!
                  </button>
                )}
                
                {selectedCards.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    alignItems: 'center',
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    padding: '15px',
                    borderRadius: '10px'
                  }}>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleGameAction('play_cards', {
                            card_indices: selectedCards,
                            claimed_rank: e.target.value,
                            count: selectedCards.length
                          });
                          setSelectedCards([]);
                        }
                      }}
                      style={{
                        padding: '8px',
                        borderRadius: '5px',
                        border: '1px solid #ccc',
                        width: '200px'
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Select rank to claim</option>
                      {['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map(rank => (
                        <option key={rank} value={rank}>{rank}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
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

  useEffect(() => {
    if (gameState?.current_player === String(playerId)) {
      setIsCurrentPlayerTurn(true);
    } else {
      setIsCurrentPlayerTurn(false);
    }
  }, [gameState?.current_player, playerId]);

  useEffect(() => {
    if (gameState?.players?.[playerId]?.hand) {
      const hand = gameState.players[playerId].hand;
      // Create unique IDs for each card based on suit and rank
      const newOrder = hand.map((card, index) => `${card.suit}_${card.rank}_${index}`);
      setPlayerHandOrder((prev) => {
        // If the hand size changed, use the new order
        if (prev.length !== newOrder.length) {
          return newOrder;
        }
        
        // Check if the cards in prev order still match the current hand
        const currentCards = new Set(newOrder.map(id => id.split('_').slice(0, 2).join('_')));
        const prevCards = new Set(prev.map(id => id.split('_').slice(0, 2).join('_')));
        
        // If the cards have changed (different suits/ranks), use the new order
        if ([...currentCards].some(card => !prevCards.has(card)) || 
            [...prevCards].some(card => !currentCards.has(card))) {
          return newOrder;
        }
        
        // Otherwise keep the current order
        return prev;
      });
    }
  }, [gameState, playerId]);

  return (
    <div className="theme-independent" style={{ height: '100vh', overflow: 'hidden' }}>
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
        <div className="game-view" style={{ height: '100%', position: 'relative' }}>
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

          {/* Game area */}
          {renderGame()}

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
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeId ? (
            <Card
              card={activeDragData?.card}
              index={activeDragData?.index}
              isInHand={false}
              gameType={gameType}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default GameView;

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
        
        if (data.type === 'game_state') {
          console.log('Setting game state from:', data);
          // Handle initial game state
          const newState = data.state || {};
          console.log('New game state to set:', newState);
          
          // Ensure we have a valid players object with proper hand data
          if (!newState.players) {
            newState.players = {};
          }
          
          // Convert player IDs to strings and ensure hands are properly set
          Object.keys(newState.players).forEach(id => {
            const strId = String(id);
            if (newState.players[strId]) {
              newState.players[strId] = {
                ...newState.players[strId],
                id: strId,
                hand: strId === String(playerId) ? 
                  (newState.players[strId].hand || []).map(card => ({
                    ...card,
                    rank: card.rank,
                    suit: card.suit
                  })) : []
              };
            }
          });
          
          setGameState(newState);
          setError('');
        } else if (data.type === 'game_update') {
          console.log('Game update received:', data);
          const newState = data.game_state || {};
          console.log('New game state from update:', newState);
          
          // Ensure we have a valid players object with proper hand data
          if (!newState.players) {
            newState.players = {};
          }
          
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
          
          if (data.result && !data.result.success) {
            setError(data.result.message || 'Action failed');
          } else {
            setError('');
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
        setError('Error processing game update');
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
    if (!card) {
      console.log('Received null or undefined card');
      return null;
    }
    console.log('Rendering card:', card);
    const { rank, suit } = card;
    
    // Convert rank and suit to match filename format
    const rankMap = {
      'A': 'A',
      'K': 'K',
      'Q': 'Q',
      'J': 'J',
      '10': '10',
      '9': '9',
      '8': '8',
      '7': '7',
      '6': '6',
      '5': '5',
      '4': '4',
      '3': '3',
      '2': '2'
    };
    
    const suitMap = {
      'hearts': 'hearts',
      'diamonds': 'diamonds',
      'clubs': 'clubs',
      'spades': 'spades'
    };
    
    const mappedRank = rankMap[rank] || rank;
    const mappedSuit = suitMap[suit] || suit;
    
    // Use the correct file naming format: spades_K.png
    const cardImagePath = `/cards/${mappedSuit}_${mappedRank}.png`;
    console.log('Card image path:', cardImagePath);
    
    return (
      <img 
        src={cardImagePath} 
        alt={`${rank} of ${suit}`}
        className="card-image"
        style={{
          width: '100px',
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

  const renderGameControls = () => {
    if (!gameState) return null;

    const isCurrentPlayer = gameState.current_player === playerId;
    const myHand = gameState.players?.[playerId]?.hand || [];

    const renderCardSelection = () => (
      <div className="card-selection">
        {myHand.map((card, index) => (
          <div 
            key={index} 
            className={`card ${selectedCards.includes(index) ? 'selected' : ''}`}
            onClick={() => handleCardClick(index)}
          >
            {renderCard(card)}
          </div>
        ))}
      </div>
    );

    switch (gameType) {
      case 'snap':
        return (
          <div className="game-controls">
            {isCurrentPlayer && (
              <button 
                onClick={() => handleGameAction('play_card')}
                className="button"
              >
                Play Card
              </button>
            )}
            <button 
              onClick={() => handleGameAction('snap')}
              className="button snap-button"
            >
              SNAP!
            </button>
          </div>
        );

      case 'go_fish':
        return (
          <div className="game-controls">
            {isCurrentPlayer && (
              <>
                {renderCardSelection()}
                <select 
                  onChange={(e) => {
                    if (e.target.value) {
                      handleGameAction('ask_for_cards', {
                        target_player_id: e.target.value,
                        rank: myHand[selectedCards[0]]?.rank
                      });
                    }
                  }}
                  className="player-select"
                  disabled={selectedCards.length !== 1}
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
              </>
            )}
          </div>
        );

      case 'bluff':
        return (
          <div className="game-controls">
            {isCurrentPlayer ? (
              <>
                {renderCardSelection()}
                <select 
                  onChange={(e) => {
                    if (e.target.value && selectedCards.length > 0) {
                      handleGameAction('play_cards', {
                        card_indices: selectedCards,
                        claimed_rank: e.target.value
                      });
                    }
                  }}
                  className="rank-select"
                  disabled={selectedCards.length === 0}
                >
                  <option value="">Claim a rank</option>
                  {['ACE', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'JACK', 'QUEEN', 'KING'].map(rank => (
                    <option key={rank} value={rank}>{rank}</option>
                  ))}
                </select>
              </>
            ) : (
              <button 
                onClick={() => handleGameAction('challenge')}
                className="button"
                disabled={!gameState.can_challenge}
              >
                Challenge!
              </button>
            )}
          </div>
        );

      default:
        return (
          <div className="game-controls">
            {isCurrentPlayer && (
              <>
                {renderCardSelection()}
                <button 
                  onClick={() => handleGameAction('play_cards', { card_indices: selectedCards })}
                  className="button"
                  disabled={selectedCards.length === 0}
                >
                  Play Selected Cards
                </button>
              </>
            )}
          </div>
        );
    }
  };

  return (
    <div className="game-view" style={{ padding: '20px' }}>
      <div className="game-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2>{gameType.toUpperCase()}</h2>
        <button onClick={() => navigate('/')} className="button back-button">
          Leave Game
        </button>
      </div>

      {error && <p className="error" style={{ color: 'red', margin: '10px 0' }}>{error}</p>}

      {gameState && (
        <div className="game-state">
          <div className="game-info" style={{ marginBottom: '20px' }}>
            <p>Room: {roomCode}</p>
            <p>Current Player: {
              gameState.players?.[gameState.current_player]?.name || 'Unknown'
            }</p>
          </div>

          <div className="players-section" style={{ marginBottom: '20px' }}>
            <h3>Players</h3>
            <div className="players-list" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {Object.entries(gameState.players || {}).map(([id, player]) => (
                <div 
                  key={id} 
                  className={`player ${id === gameState.current_player ? 'current' : ''}`}
                  style={{
                    padding: '10px',
                    border: '1px solid #ccc',
                    borderRadius: '5px',
                    backgroundColor: id === gameState.current_player ? '#e8f5e9' : 'transparent'
                  }}
                >
                  <div className="player-name" style={{ 
                    color: 'white', 
                    marginBottom: '10px',
                    fontSize: '1.2em',
                    fontWeight: 'bold',
                    textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                    backgroundColor: gameState.current_player === id ? 'rgba(46, 125, 50, 0.8)' : 'rgba(0,0,0,0.5)',
                    padding: '5px 10px',
                    borderRadius: '5px',
                    whiteSpace: 'nowrap'
                  }}>
                    {player.name}
                  </div>
                  <span className="card-count">{player.hand_size || 0} cards</span>
                  {player.score !== undefined && (
                    <span className="score">Score: {player.score}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="game-area" style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            gap: '20px',
            backgroundColor: '#2e7d32',
            padding: '20px',
            borderRadius: '10px',
            minHeight: '400px'
          }}>
            {gameState.center_pile && (
              <div className="center-pile" style={{ textAlign: 'center' }}>
                <h3 style={{ color: 'white' }}>Center Pile</h3>
                <div className="cards" style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: '10px', 
                  justifyContent: 'center' 
                }}>
                  {gameState.center_pile.map((card, index) => (
                    <div key={index} className="card" style={{ position: 'relative' }}>
                      {renderCard(card)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="my-hand" style={{ textAlign: 'center' }}>
              <h3 style={{ color: 'white' }}>Your Hand</h3>
              {console.log('Current game state:', gameState)}
              {console.log('Player ID:', playerId)}
              {console.log('Player hand:', gameState?.players?.[playerId]?.hand)}
              <div className="cards" style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '10px', 
                justifyContent: 'center',
                marginBottom: '20px'
              }}>
                {gameState?.players?.[playerId]?.hand?.length > 0 ? (
                  gameState.players[playerId].hand.map((card, index) => (
                    <div 
                      key={`${card.rank}_${card.suit}_${index}`}
                      className={`card ${selectedCards.includes(index) ? 'selected' : ''}`}
                      onClick={() => handleCardClick(index)}
                      style={{ 
                        position: 'relative',
                        transform: selectedCards.includes(index) ? 'translateY(-10px)' : 'none',
                        transition: 'transform 0.2s ease',
                        cursor: 'pointer',
                        padding: '5px'
                      }}
                    >
                      {console.log('Rendering card:', card)}
                      {renderCard(card)}
                    </div>
                  ))
                ) : (
                  <div style={{ color: 'white' }}>No cards in hand</div>
                )}
              </div>
              {renderGameControls()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameView; 
import React, { useState, useEffect } from 'react';

const GoFish = ({ gameState, playerId, renderCard, renderDropZone, ws }) => {
  const [isCurrentPlayerTurn, setIsCurrentPlayerTurn] = useState(false);
  const [selectedCards, setSelectedCards] = useState([]);
  const [showSets, setShowSets] = useState(false);

  useEffect(() => {
    // Determine if it's the current player's turn
    setIsCurrentPlayerTurn(gameState.current_player === playerId);
  }, [gameState, playerId]);

  const handleGameAction = (actionType, actionData = {}) => {
    if (!ws) {
      console.error('WebSocket connection not available');
      return;
    }

    const message = {
      type: 'game_action',
      action: {
        action_type: actionType,
        player_id: playerId,
        ...actionData
      }
    };

    ws.send(JSON.stringify(message));
  };

  return (
    <div data-testid="go_fish-game" className="go-fish-game" style={{
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
        <div 
          onClick={() => isCurrentPlayerTurn && handleGameAction('draw_card')}
          style={{
            position: 'relative',
            cursor: isCurrentPlayerTurn ? 'pointer' : 'default',
            transition: 'transform 0.2s ease',
            transform: isCurrentPlayerTurn ? 'scale(1.05)' : 'none'
          }}
          className={isCurrentPlayerTurn ? 'pulse' : ''}
        >
          {gameState.cards_in_deck > 0 && renderCard({ show_back: true }, 0, false)}
          <div style={{
            position: 'absolute',
            bottom: '-25px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'white',
            fontSize: '0.8em',
            whiteSpace: 'nowrap',
            textAlign: 'center'
          }}>
            Draw Pile ({gameState.cards_in_deck || 0})
          </div>
        </div>
      </div>

      <div className="game-controls" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px',
        position: 'absolute',
        bottom: '210px',
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
                  {gameState.players[gameState.last_action.player]?.name} didn't have card rank "{gameState.last_action.rank}", time for {gameState.players[gameState.current_player]?.name} to draw a card!
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
        {isCurrentPlayerTurn && selectedCards.length === 1 && (
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
        {isCurrentPlayerTurn && selectedCards.length === 0 && (
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
};

export default GoFish;
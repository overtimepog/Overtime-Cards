import React from 'react';

const Spoons = ({ gameState, playerId, renderCard, renderDropZone }) => {
    return (
    <div data-testid="spoons-game" className="spoons-game" style={{ 
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
};

export default Spoons;
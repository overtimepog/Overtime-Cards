import React from 'react';

const Scat = ({ gameState, playerId, renderCard, renderDropZone }) => {
    return (
    <div data-testid="scat-game" className="scat-game" style={{
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

      {/* Conditional Rendering: Display player ID */}
      <div style={{ color: 'white' }}>Player ID: {playerId}</div>

      {/* Logging: Log player ID */}
      console.log('Current Player ID:', playerId);

      {/* Game Logic: Check if the current player is the one taking an action */}
      const isCurrentPlayerTurn = gameState.current_player === playerId;
    </div>
  );
};

export default Scat;
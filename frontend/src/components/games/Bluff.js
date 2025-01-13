import React from 'react';

const Bluff = ({ gameState, playerId, renderCard, renderDropZone }) => {
    return (
    <div data-testid="bluff-game" className="bluff-game" style={{
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
};

export default Bluff;
import React from 'react';

const Rummy = ({ gameState, playerId, renderCard, renderDropZone }) => {
    return (
    <div data-testid="rummy-game" className="rummy-game" style={{
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
};

export default Rummy;
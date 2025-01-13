import React from 'react';

const Snap = ({ gameState, playerId, renderCard, renderDropZone }) => {
    return (
    <div data-testid="snap-game" className="snap-game" style={{
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
};

export default Snap;
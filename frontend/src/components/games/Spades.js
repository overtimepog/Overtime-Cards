

const Spades = ({ gameState, playerId, renderCard, renderDropZone }) => {
    return (
    <div data-testid="spades-game" className="spades-game" style={{
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
};

export default Spades;
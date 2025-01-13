import React from 'react';

const KingsCorner = ({ gameState, playerId, renderCard, renderDropZone }) => {
    return (
    <div data-testid="kings_corner-game" className="kings-corner-container" style={{
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
};

export default KingsCorner;
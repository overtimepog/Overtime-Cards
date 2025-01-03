import React from 'react';
import { useNavigate } from 'react-router-dom';

function MainMenu() {
  const navigate = useNavigate();

  return (
    <div className="main-menu">
      <h1>Overtime Cards</h1>
      <div className="menu-description">
        <p>Welcome to Overtime Cards! Choose from a variety of classic card games to play with friends.</p>
      </div>
      
      <div className="menu-buttons">
        <button 
          onClick={() => navigate('/create')}
          className="button create-button"
        >
          Create Room
        </button>
        <button 
          onClick={() => navigate('/join')}
          className="button join-button"
        >
          Join Room
        </button>
      </div>

      <div className="game-list">
        <h2>Available Games</h2>
        <div className="game-grid">
          {[
            {
              name: "Snap",
              description: "Match consecutive cards and be the first to call Snap!",
              players: "2-4 players"
            },
            {
              name: "Go Fish",
              description: "Collect sets of four cards by asking other players",
              players: "2-6 players"
            },
            {
              name: "Bluff",
              description: "Get rid of all your cards by playing them face down",
              players: "2-6 players"
            },
            {
              name: "Scat",
              description: "Get closest to 31 in a single suit",
              players: "2-6 players"
            },
            {
              name: "Rummy",
              description: "Form sets and runs to get rid of all your cards",
              players: "2-6 players"
            },
            {
              name: "Kings Corner",
              description: "Play cards in descending order and alternating colors",
              players: "2-4 players"
            },
            {
              name: "Spades",
              description: "Bid and take tricks, with Spades always being trump",
              players: "4 players"
            },
            {
              name: "Spoons",
              description: "Collect four of a kind and grab a spoon before others!",
              players: "3-8 players"
            }
          ].map((game, index) => (
            <div key={index} className="game-card">
              <h3>{game.name}</h3>
              <p>{game.description}</p>
              <span className="player-count">{game.players}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MainMenu; 
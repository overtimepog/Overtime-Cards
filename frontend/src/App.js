import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MainMenu from './components/MainMenu';
import CreateRoom from './components/CreateRoom';
import JoinRoom from './components/JoinRoom';
import Lobby from './components/Lobby';
import GameView from './components/GameView';
import { ThemeProvider } from './context/ThemeContext';
import ThemeToggle from './components/ThemeToggle';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <div className="App">
          <ThemeToggle />
          <main>
            <Routes>
              <Route path="/" element={<MainMenu />} />
              <Route path="/create" element={<CreateRoom />} />
              <Route path="/join" element={<JoinRoom />} />
              <Route path="/lobby/:roomCode" element={<Lobby />} />
              <Route path="/game/:roomCode/:playerId" element={<GameView />} />
            </Routes>
          </main>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App; 
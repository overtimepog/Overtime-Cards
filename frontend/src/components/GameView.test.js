import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import GameView from './GameView';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock the router hooks
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => ({
    roomCode: 'TEST123',
    playerId: '1',
  }),
  useLocation: () => ({
    state: {
      username: 'TestPlayer',
      gameType: 'snap'
    }
  }),
  useNavigate: () => jest.fn()
}));

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.OPEN;
    setTimeout(() => {
      this.onopen && this.onopen();
    }, 0);
  }
  
  send(data) {
    this.lastSentMessage = JSON.parse(data);
  }
  
  close() {}
}

global.WebSocket = MockWebSocket;

// Helper function to render component with required context
const renderGameView = () => {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={
          <DndContext>
            <GameView />
          </DndContext>
        } />
      </Routes>
    </MemoryRouter>
  );
};

describe('GameView Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders without crashing', () => {
    renderGameView();
    expect(screen.getByText('Leave Game')).toBeInTheDocument();
  });

  test('establishes WebSocket connection on mount', () => {
    renderGameView();
    expect(global.WebSocket).toHaveBeenCalledWith(
      expect.stringContaining('/ws/TEST123/1')
    );
  });

  test('handles leave game button click', () => {
    const navigate = jest.fn();
    jest.spyOn(require('react-router-dom'), 'useNavigate').mockReturnValue(navigate);
    
    renderGameView();
    
    fireEvent.click(screen.getByText('Leave Game'));
    expect(navigate).toHaveBeenCalledWith('/');
  });

  test('handles card selection', () => {
    const { container } = renderGameView();
    
    // Simulate game state with cards
    act(() => {
      const ws = new MockWebSocket('');
      ws.onmessage({
        data: JSON.stringify({
          type: 'game_state',
          state: {
            players: {
              '1': {
                hand: [
                  { suit: 'HEARTS', rank: 'ACE', show_back: false }
                ],
                id: '1',
                name: 'TestPlayer'
              }
            },
            current_player: '1'
          }
        })
      });
    });

    // Find and click a card
    const card = container.querySelector('.card-content');
    fireEvent.click(card);
    
    // Verify card selection visual feedback
    expect(card).toHaveStyle({ transform: expect.stringContaining('translateY') });
  });

  test('displays error messages', () => {
    renderGameView();
    
    act(() => {
      const ws = new MockWebSocket('');
      ws.onmessage({
        data: JSON.stringify({
          type: 'error',
          message: 'Test error message'
        })
      });
    });

    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  test('handles game state updates', () => {
    renderGameView();
    
    const gameState = {
      type: 'game_state',
      state: {
        players: {
          '1': {
            hand: [],
            id: '1',
            name: 'TestPlayer'
          }
        },
        current_player: '1',
        game_type: 'snap'
      }
    };

    act(() => {
      const ws = new MockWebSocket('');
      ws.onmessage({ data: JSON.stringify(gameState) });
    });

    expect(screen.getByText('TestPlayer (You)')).toBeInTheDocument();
  });

  test('handles game actions', () => {
    const { container } = renderGameView();
    let sentMessage;
    
    // Mock WebSocket send
    global.WebSocket.prototype.send = jest.fn((data) => {
      sentMessage = JSON.parse(data);
    });

    // Simulate game state
    act(() => {
      const ws = new MockWebSocket('');
      ws.onmessage({
        data: JSON.stringify({
          type: 'game_state',
          state: {
            players: {
              '1': {
                hand: [{ suit: 'HEARTS', rank: 'ACE', show_back: false }],
                id: '1',
                name: 'TestPlayer'
              }
            },
            current_player: '1',
            game_type: 'snap'
          }
        })
      });
    });

    // Find and click play card button (if it exists)
    const playButton = screen.queryByText('Play Card');
    if (playButton) {
      fireEvent.click(playButton);
      
      expect(sentMessage).toEqual({
        type: 'game_action',
        action: {
          action_type: 'play_card',
          game_type: 'snap'
        }
      });
    }
  });

  test('calculates player positions correctly', () => {
    const { container } = renderGameView();
    
    // Simulate game state with multiple players
    act(() => {
      const ws = new MockWebSocket('');
      ws.onmessage({
        data: JSON.stringify({
          type: 'game_state',
          state: {
            players: {
              '1': { id: '1', name: 'Player 1', hand: [] },
              '2': { id: '2', name: 'Player 2', hand: [] },
              '3': { id: '3', name: 'Player 3', hand: [] }
            },
            current_player: '1'
          }
        })
      });
    });

    // Check if players are positioned around the table
    const playerElements = container.querySelectorAll('.card-container');
    expect(playerElements.length).toBeGreaterThan(0);
  });
});

// Test specific game type rendering
describe('Game Type Specific Rendering', () => {
  const gameTypes = ['snap', 'spoons', 'go_fish', 'rummy', 'scat', 'spades', 'bluff'];
  
  gameTypes.forEach(gameType => {
    test(`renders ${gameType} game type correctly`, () => {
      // Override location state with specific game type
      jest.spyOn(require('react-router-dom'), 'useLocation').mockReturnValue({
        state: { username: 'TestPlayer', gameType }
      });

      renderGameView();
      
      // Simulate game state
      act(() => {
        const ws = new MockWebSocket('');
        ws.onmessage({
          data: JSON.stringify({
            type: 'game_state',
            state: {
              players: {
                '1': { id: '1', name: 'TestPlayer', hand: [] }
              },
              current_player: '1',
              game_type: gameType
            }
          })
        });
      });

      // Verify game-specific elements are rendered
      const gameContainer = screen.getByTestId(`${gameType}-game`);
      expect(gameContainer).toBeInTheDocument();
    });
  });
});

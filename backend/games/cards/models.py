from dataclasses import dataclass
from enum import Enum
import random
from typing import List, Optional, Dict, Any, ForwardRef

Player = ForwardRef('Player')

class Suit(Enum):
    HEARTS = 'hearts'
    DIAMONDS = 'diamonds'
    CLUBS = 'clubs'
    SPADES = 'spades'

class Rank(Enum):
    ACE = 'A'
    TWO = '2'
    THREE = '3'
    FOUR = '4'
    FIVE = '5'
    SIX = '6'
    SEVEN = '7'
    EIGHT = '8'
    NINE = '9'
    TEN = '10'
    JACK = 'J'
    QUEEN = 'Q'
    KING = 'K'

@dataclass
class Card:
    rank: Rank
    suit: Suit

    @property
    def value(self) -> int:
        """Get the numerical value of the card"""
        if self.rank == Rank.ACE:
            return 11  # Can be 1 in some games
        elif self.rank in [Rank.JACK, Rank.QUEEN, Rank.KING]:
            return 10
        else:
            return int(self.rank.value)

    @property
    def image_front(self) -> str:
        """Get the path to the card's front image"""
        return f"cards/{self.suit.value}_{self.rank.value}.png"

    @property
    def image_back(self) -> str:
        """Get the path to the card's back image"""
        return "cards/back_dark.png"

    def to_dict(self) -> Dict[str, str]:
        """Convert card to dictionary for JSON serialization"""
        return {
            'rank': self.rank.value,
            'suit': self.suit.value,
            'image_front': self.image_front,
            'image_back': self.image_back
        }

class Deck:
    def __init__(self):
        self.cards: List[Card] = []
        
    def create_deck(self):
        """Create a deck of 52 cards"""
        for suit in Suit:
            for rank in Rank:
                self.cards.append(Card(rank, suit))
        self.shuffle()
        if len(self.cards) != 52:
            print(f"Deck initialization error: {len(self.cards)} cards instead of 52")
            raise ValueError(f"Deck initialization error: {len(self.cards)} cards instead of 52")
    
    def reset(self):
        """Reset the deck to a new shuffled 52-card deck"""
        self.cards = []
        self.create_deck()
        return self
    
    def shuffle(self):
        """Shuffle the deck"""
        random.shuffle(self.cards)

    def draw(self) -> Optional[Card]:
        """Draw a card from the deck"""
        return self.cards.pop() if self.cards else None

    def draw_multiple(self, count: int) -> List[Card]:
        """Draw multiple cards from the deck"""
        if count > len(self.cards):
            raise ValueError("Not enough cards to deal")
        drawn = []
        for _ in range(count):
            card = self.draw()
            if card:
                drawn.append(card)
        return drawn

    def deal(self, players: List[Player], cards_per_player: int) -> None:
        """Deal cards to players"""
        total_cards_needed = len(players) * cards_per_player
        if total_cards_needed > len(self.cards):
            print(f"Deck initialization error: {len(self.cards)} cards instead of 52")
            raise ValueError(f"Not enough cards to deal. Need {total_cards_needed}, have {len(self.cards)}")
            
        # Deal cards one at a time to each player
        for _ in range(cards_per_player):
            for player in players:
                card = self.draw()
                if not card:  # This shouldn't happen since we checked counts
                    print(f"Deck initialization error: {len(self.cards)} cards instead of 52")
                    raise ValueError("Unexpected error: ran out of cards while dealing")
                player.hand.append(card)

@dataclass
class Player:
    id: str
    name: str
    hand: List[Card]
    score: int = 0
    is_ready: bool = False
    is_host: bool = False

    def to_dict(self, hide_hand: bool = False) -> Dict[str, Any]:
        """Convert player to dictionary for JSON serialization"""
        player_dict = {
            'id': self.id,
            'name': self.name,
            'hand_size': len(self.hand),
            'score': self.score,
            'is_ready': self.is_ready,
            'is_host': self.is_host,
            'hand': []  # Always include hand key
        }
        
        # Only include card details if hand shouldn't be hidden
        if not hide_hand and self.hand:
            player_dict['hand'] = [card.to_dict() for card in self.hand]
        
        return player_dict

class GameState(Enum):
    WAITING = 'waiting'
    STARTING = 'starting'
    PLAYING = 'playing'
    ROUND_END = 'round_end'
    GAME_END = 'game_end'

class BaseGame:
    def __init__(self, room_code: str):
        self.room_code = room_code
        self.players: Dict[str, Player] = {}
        self.deck = Deck()
        self.deck.create_deck()  # Initialize deck with 52 cards
        self.state = GameState.WAITING
        self.current_player_idx = 0
        self.direction = 1  # 1 for clockwise, -1 for counter-clockwise
        self.max_selectable_cards = 0  # Default to 0 - most games don't need card selection

    @property
    def player_order(self) -> List[Player]:
        """Get list of players in turn order"""
        return list(self.players.values())

    @property
    def current_player(self) -> Optional[Player]:
        """Get the current player"""
        players = self.player_order
        return players[self.current_player_idx] if players else None

    def add_player(self, player_id: str, name: str, is_host: bool = False) -> Player:
        """Add a player to the game"""
        player = Player(id=player_id, name=name, hand=[], is_host=is_host)
        self.players[player_id] = player
        return player

    def remove_player(self, player_id: str):
        """Remove a player from the game"""
        if player_id in self.players:
            del self.players[player_id]

    def start_game(self):
        """Start the game"""
        if len(self.players) < 2:
            raise ValueError(f"Need at least 2 players to start game (currently have {len(self.players)})")
        
        try:
            self.state = GameState.STARTING
            # Reset deck and validate card count
            self.deck = Deck()  # Create a fresh deck
            self.deck.create_deck()  # Initialize with 52 cards
            total_cards = len(self.deck.cards)
            if total_cards != 52:
                raise ValueError(f"Invalid deck size: {total_cards} cards instead of 52")
            
            min_cards_needed = self._calculate_min_cards_needed()
            if total_cards < min_cards_needed:
                raise ValueError(f"Not enough cards in deck. Need {min_cards_needed}, have {total_cards}")
            
            # Deal initial cards
            if not self.players:
                raise ValueError("No players to deal cards to")
            
            # Calculate cards per player based on minimum needed
            min_cards = self._calculate_min_cards_needed()
            cards_per_player = min_cards // len(self.players)
            
            # Use the deck's deal method to distribute cards
            self.deck.deal(list(self.players.values()), cards_per_player)
            
            # Set initial current player
            self.current_player_idx = 0
            
            # Ensure all players have their hands set
            for player in self.players.values():
                if not hasattr(player, 'hand'):
                    player.hand = []
                    
            self.state = GameState.PLAYING
        except Exception as e:
            self.state = GameState.WAITING
            raise ValueError(f"Failed to start game: {str(e)}")
    
    def _calculate_min_cards_needed(self) -> int:
        """Calculate minimum cards needed based on number of players"""
        # Default implementation - override in specific games
        return len(self.players) * 7  # Most games deal 7 cards per player

    def next_turn(self):
        """Advance to the next player's turn"""
        self.current_player_idx = (self.current_player_idx + self.direction) % len(self.players)

    def get_game_state(self, for_player_id: Optional[str] = None) -> Dict[str, Any]:
        """Get the current game state"""
        try:
            # Find the host player
            host_player = next((p for p in self.players.values() if p.is_host), None)
            host_id = host_player.id if host_player else None
            
            # Convert players to dict
            players_dict = {}
            for player in self.player_order:
                # Get the full player dict with their cards
                player_dict = player.to_dict(hide_hand=False)
                
                # If we're getting state for a specific player, add show_back flags
                if for_player_id is not None:
                    # Deep copy the hand array to avoid modifying the original card dicts
                    hand_copy = []
                    for card in player_dict['hand']:
                        card_copy = card.copy()
                        # Only add show_back=true for other players' cards
                        card_copy['show_back'] = str(player.id) != str(for_player_id)
                        hand_copy.append(card_copy)
                    player_dict['hand'] = hand_copy
                
                players_dict[str(player.id)] = player_dict
            
            # Get current player safely
            current_player = self.current_player
            current_player_id = current_player.id if current_player else None
            
            game_state = {
                'room_code': self.room_code,
                'state': self.state.value,
                'host_id': host_id,
                'players': players_dict,
                'current_player': current_player_id,
                'deck': {'cards_remaining': len(self.deck.cards)},  # Only send count, not actual cards
                'direction': self.direction,
                'current_player_idx': self.current_player_idx,
                'max_selectable_cards': self.max_selectable_cards  # Add max_selectable_cards to game state
            }
            
            return game_state
        except Exception as e:
            # Return minimal valid state on error, maintaining consistent structure
            return {
                'room_code': self.room_code,
                'state': GameState.WAITING.value,
                'host_id': None,  # Include host_id in error state
                'players': {},  # Empty dict for consistency
                'current_player': None,
                'deck': {'cards_remaining': 0},
                'direction': self.direction,
                'current_player_idx': 0,
                'error': str(e)
            }

    def _save_game_state(self) -> Dict[str, Any]:
        """Save the current game state"""
        try:
            # Get the base game state
            game_state = self.get_game_state()
            
            # Add additional fields that might be needed for saving
            game_state.update({
                'game_type': self.__class__.__name__.lower().replace('game', ''),
                'last_action': getattr(self, 'last_action', None)
            })
            
            return game_state
        except Exception as e:
            # Return minimal valid state on error
            return {
                'room_code': self.room_code,
                'state': GameState.WAITING.value,
                'game_type': self.__class__.__name__.lower().replace('game', ''),
                'error': str(e)
            }

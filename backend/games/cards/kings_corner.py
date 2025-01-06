from typing import Dict, Any, Optional, List, Tuple
from .models import BaseGame, Card, GameState, Player, Rank, Suit

class PileType:
    FOUNDATION = 'foundation'  # Main foundation piles
    CORNER = 'corner'  # Corner piles (started with Kings)

class KingsCornerGame(BaseGame):
    def __init__(self, room_code: str):
        super().__init__(room_code)
        self.piles: Dict[str, List[Card]] = {}  # Pile ID to list of cards
        self.pile_types: Dict[str, PileType] = {}  # Pile ID to pile type
        self.last_action: Optional[Dict[str, Any]] = None
        self.cards_per_hand = 7  # Kings Corner deals 7 cards to each player

    def _calculate_min_cards_needed(self) -> int:
        """Calculate minimum cards needed for Kings Corner"""
        # Need cards for each player plus 4 for foundation piles
        return (len(self.players) * self.cards_per_hand) + 4

    def _initialize_game_state(self):
        """Initialize Kings Corner-specific state after dealing cards"""
        # Set up foundation piles (4 in center)
        for i in range(4):
            pile_id = f'foundation_{i}'
            self.piles[pile_id] = []
            self.pile_types[pile_id] = PileType.FOUNDATION
            
            # Draw and validate card for foundation
            card = self.deck.draw()
            if not card:
                raise ValueError("Not enough cards for foundation piles")
                
            # If it's a King, put it back and draw another
            while card.rank == Rank.KING:
                self.deck.cards.append(card)
                self.deck.shuffle()
                card = self.deck.draw()
                if not card:
                    raise ValueError("Not enough cards for foundation piles")
            
            self.piles[pile_id].append(card)

        # Set up corner piles (4 in corners, initially empty)
        for i in range(4):
            pile_id = f'corner_{i}'
            self.piles[pile_id] = []
            self.pile_types[pile_id] = PileType.CORNER

    def _is_card_black(self, card: Card) -> bool:
        """Check if a card is black (clubs or spades)"""
        try:
            return card.suit in [Suit.CLUBS, Suit.SPADES]
        except Exception as e:
            raise ValueError(f"Failed to check card color: {str(e)}")

    def _can_place_on_pile(self, card: Card, pile_id: str) -> bool:
        """Check if a card can be placed on a pile"""
        try:
            pile = self.piles[pile_id]
            pile_type = self.pile_types[pile_id]

            # Empty corner pile can only take Kings
            if not pile and pile_type == PileType.CORNER:
                return card.rank == Rank.KING

            # Empty foundation pile can take any card
            if not pile and pile_type == PileType.FOUNDATION:
                return True

            # Non-empty pile requires descending rank and alternating color
            top_card = pile[-1]
            ranks = list(Rank)
            return (
                ranks.index(card.rank) == ranks.index(top_card.rank) - 1 and
                self._is_card_black(card) != self._is_card_black(top_card)
            )
        except Exception as e:
            raise ValueError(f"Failed to validate card placement: {str(e)}")

    def _can_move_pile(self, source_id: str, target_id: str) -> bool:
        """Check if one pile can be moved onto another"""
        try:
            source_pile = self.piles[source_id]
            if not source_pile:
                return False

            return self._can_place_on_pile(source_pile[0], target_id)
        except Exception as e:
            raise ValueError(f"Failed to validate pile movement: {str(e)}")

    def play_card(self, player_id: str, card_index: int, pile_id: str) -> Dict[str, Any]:
        """Play a card from hand to a pile"""
        try:
            if self.state != GameState.PLAYING:
                raise ValueError("Game is not in playing state")

            player = self.players.get(str(player_id))
            if not player:
                raise ValueError("Player not found")

            if not self.current_player:
                raise ValueError("No current player set")

            if player.id != self.current_player.id:
                raise ValueError("Not your turn")

            if card_index < 0 or card_index >= len(player.hand):
                raise ValueError("Invalid card index")

            if pile_id not in self.piles:
                raise ValueError("Invalid pile")

            card = player.hand[card_index]
            if not self._can_place_on_pile(card, pile_id):
                raise ValueError("Invalid move")

            # Move card from hand to pile
            player.hand.pop(card_index)
            self.piles[pile_id].append(card)

            self.last_action = {
                'action': 'card_played',
                'player': player.id,
                'card': card.to_dict(),
                'pile': pile_id,
                'game_state': self.state.value
            }

            # Check for win
            if not player.hand:
                self.state = GameState.GAME_END
                player.score += 1  # Winner gets a point
                self.last_action.update({
                    'game_state': self.state.value,
                    'winner': str(player.id)
                })

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to play card: {str(e)}")

    def move_pile(self, player_id: str, source_pile_id: str, target_pile_id: str) -> Dict[str, Any]:
        """Move an entire pile onto another pile"""
        try:
            if self.state != GameState.PLAYING:
                raise ValueError("Game is not in playing state")

            player = self.players.get(str(player_id))
            if not player:
                raise ValueError("Player not found")

            if not self.current_player:
                raise ValueError("No current player set")

            if player.id != self.current_player.id:
                raise ValueError("Not your turn")

            if source_pile_id not in self.piles or target_pile_id not in self.piles:
                raise ValueError("Invalid pile")

            if not self._can_move_pile(source_pile_id, target_pile_id):
                raise ValueError("Invalid move")

            # Move all cards from source to target
            source_cards = self.piles[source_pile_id]
            self.piles[target_pile_id].extend(source_cards)
            self.piles[source_pile_id] = []

            self.last_action = {
                'action': 'pile_moved',
                'player': player.id,
                'source_pile': source_pile_id,
                'target_pile': target_pile_id,
                'cards': [card.to_dict() for card in source_cards],
                'game_state': self.state.value
            }

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to move pile: {str(e)}")

    def draw_card(self, player_id: str) -> Dict[str, Any]:
        """Draw a card from the deck"""
        try:
            if self.state != GameState.PLAYING:
                raise ValueError("Game is not in playing state")

            player = self.players.get(str(player_id))
            if not player:
                raise ValueError("Player not found")

            if not self.current_player:
                raise ValueError("No current player set")

            if player.id != self.current_player.id:
                raise ValueError("Not your turn")

            card = self.deck.draw()
            if not card:
                raise ValueError("No cards left in deck")

            player.hand.append(card)

            self.last_action = {
                'action': 'card_drawn',
                'player': player.id,
                'game_state': self.state.value
            }

            # Move to next player
            self.next_turn()

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to draw card: {str(e)}")

    def end_turn(self, player_id: str) -> Dict[str, Any]:
        """End the current player's turn"""
        try:
            if self.state != GameState.PLAYING:
                raise ValueError("Game is not in playing state")

            player = self.players.get(str(player_id))
            if not player:
                raise ValueError("Player not found")

            if not self.current_player:
                raise ValueError("No current player set")

            if player.id != self.current_player.id:
                raise ValueError("Not your turn")

            self.last_action = {
                'action': 'turn_ended',
                'player': player.id,
                'game_state': self.state.value
            }

            # Move to next player
            self.next_turn()

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to end turn: {str(e)}")

    def get_game_state(self, for_player_id: Optional[str] = None) -> Dict[str, Any]:
        """Get the current game state"""
        try:
            # Get base game state
            base_state = super().get_game_state(for_player_id)
            
            # Create kings corner specific state
            kings_corner_state = {
                'piles': {
                    pile_id: [card.to_dict() for card in pile]
                    for pile_id, pile in self.piles.items()
                },
                'pile_types': self.pile_types.copy(),
                'cards_in_deck': len(self.deck.cards),
                'last_action': self.last_action
            }
            
            # Merge states
            return {**base_state, **kings_corner_state}
            
        except Exception as e:
            # Return minimal valid state on error
            return {
                'room_code': self.room_code,
                'state': GameState.WAITING.value,
                'players': {},  # Empty dict to match base game state structure
                'current_player': None,
                'deck': {'cards': []},
                'direction': self.direction,
                'current_player_idx': 0,
                'piles': {},
                'pile_types': {},
                'cards_in_deck': 0,
                'last_action': None,
                'error': str(e)
            }

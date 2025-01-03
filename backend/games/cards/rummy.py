from typing import Dict, Any, Optional, List, Set, Tuple
from .models import BaseGame, Card, GameState, Player, Rank, Suit

class RummyGame(BaseGame):
    def __init__(self, room_code: str):
        super().__init__(room_code)
        self.discard_pile: List[Card] = []
        self.last_action: Optional[Dict[str, Any]] = None
        self.melds: Dict[str, List[List[Card]]] = {}  # Player ID to list of melds
        self.cards_per_hand = 7  # Standard Rummy deals 7 cards

    def deal_initial_cards(self):
        """Deal initial cards to players"""
        if not self.players:
            raise ValueError("No players to deal cards to")
            
        try:
            # Initialize game state
            for player in self.players.values():
                # Deal cards
                cards = self.deck.draw_multiple(self.cards_per_hand)
                if not cards or len(cards) < self.cards_per_hand:
                    raise ValueError("Not enough cards to deal")
                player.hand = cards
                
                # Initialize melds
                self.melds[str(player.id)] = []

            # Start discard pile
            first_card = self.deck.draw()
            if not first_card:
                raise ValueError("No card for discard pile")
            self.discard_pile.append(first_card)
            
            # Set initial current player
            self.current_player_idx = 0
        except Exception as e:
            raise ValueError(f"Failed to deal initial cards: {str(e)}")

    def _is_valid_run(self, cards: List[Card]) -> bool:
        """Check if cards form a valid run (sequential cards of same suit)"""
        if len(cards) < 3:
            return False

        try:
            # Sort by rank value
            sorted_cards = sorted(cards, key=lambda c: c.value)
            
            # Check all cards are same suit
            suit = sorted_cards[0].suit
            if not all(card.suit == suit for card in sorted_cards):
                return False

            # Check ranks are sequential
            ranks = list(Rank)
            for i in range(len(sorted_cards) - 1):
                curr_idx = ranks.index(sorted_cards[i].rank)
                next_idx = ranks.index(sorted_cards[i + 1].rank)
                if next_idx != curr_idx + 1:
                    return False

            return True
        except Exception as e:
            raise ValueError(f"Failed to validate run: {str(e)}")

    def _is_valid_set(self, cards: List[Card]) -> bool:
        """Check if cards form a valid set (same rank, different suits)"""
        if len(cards) < 3:
            return False

        try:
            # Check all cards are same rank
            rank = cards[0].rank
            if not all(card.rank == rank for card in cards):
                return False

            # Check all suits are different
            suits = {card.suit for card in cards}
            return len(suits) == len(cards)
        except Exception as e:
            raise ValueError(f"Failed to validate set: {str(e)}")

    def draw_card(self, player_id: str, from_discard: bool = False) -> Dict[str, Any]:
        """Draw a card from either the deck or discard pile"""
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

            if from_discard:
                if not self.discard_pile:
                    raise ValueError("Discard pile is empty")
                card = self.discard_pile.pop()
            else:
                card = self.deck.draw()
                if not card:
                    # Reshuffle discard pile if deck is empty
                    if len(self.discard_pile) > 1:  # Keep top card
                        self.deck.cards = self.discard_pile[:-1]
                        self.deck.shuffle()
                        self.discard_pile = [self.discard_pile[-1]]
                        card = self.deck.draw()
                    if not card:
                        raise ValueError("No cards left to draw")

            player.hand.append(card)

            self.last_action = {
                'action': 'card_drawn',
                'player': player.id,
                'from_discard': from_discard,
                'card': card.to_dict() if from_discard else None,
                'game_state': self.state.value
            }

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to draw card: {str(e)}")

    def discard_card(self, player_id: str, card_index: int) -> Dict[str, Any]:
        """Discard a card from hand"""
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

            # Remove card from hand and add to discard pile
            card = player.hand.pop(card_index)
            self.discard_pile.append(card)

            # Update game state
            self.last_action = {
                'action': 'card_discarded',
                'player': player_id,
                'card': card.to_dict(),
                'game_state': self.state.value  # Convert enum to string
            }

            # Move to next player
            self.next_turn()
            
            return self.get_game_state()

        except Exception as e:
            raise ValueError(f"Failed to discard card: {str(e)}")

    def lay_meld(self, player_id: str, card_indices: List[int]) -> Dict[str, Any]:
        """Lay down a meld (set or run)"""
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

            if not card_indices or len(card_indices) < 3:
                raise ValueError("Must use at least 3 cards")

            if any(i < 0 or i >= len(player.hand) for i in card_indices):
                raise ValueError("Invalid card indices")

            # Get cards being used
            cards = [player.hand[i] for i in sorted(card_indices)]

            # Validate meld
            if not (self._is_valid_run(cards) or self._is_valid_set(cards)):
                raise ValueError("Cards do not form a valid meld")

            # Remove cards from hand and add to melds
            for i in sorted(card_indices, reverse=True):
                player.hand.pop(i)
            self.melds[str(player.id)].append(cards)

            self.last_action = {
                'action': 'meld_laid',
                'player': player.id,
                'cards': [card.to_dict() for card in cards],
                'meld_type': 'run' if self._is_valid_run(cards) else 'set',
                'game_state': self.state.value
            }

            # Check if player has won
            if not player.hand:
                self.state = GameState.GAME_END
                player.score += 1  # Winner gets a point
                self.last_action.update({
                    'game_state': self.state.value,
                    'winner': str(player.id)
                })

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to lay meld: {str(e)}")

    def add_to_meld(self, player_id: str, card_index: int, meld_index: int) -> Dict[str, Any]:
        """Add a card to an existing meld"""
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

            if meld_index < 0 or meld_index >= len(self.melds[str(player.id)]):
                raise ValueError("Invalid meld index")

            # Get card and meld
            card = player.hand[card_index]
            meld = self.melds[str(player.id)][meld_index]

            # Try adding card to meld
            test_meld = meld + [card]
            if not (self._is_valid_run(test_meld) or self._is_valid_set(test_meld)):
                raise ValueError("Card cannot be added to meld")

            # Remove card from hand and add to meld
            player.hand.pop(card_index)
            self.melds[str(player.id)][meld_index].append(card)

            self.last_action = {
                'action': 'card_added_to_meld',
                'player': player.id,
                'card': card.to_dict(),
                'meld_index': meld_index,
                'game_state': self.state.value
            }

            # Check if player has won
            if not player.hand:
                self.state = GameState.GAME_END
                player.score += 1  # Winner gets a point
                self.last_action.update({
                    'game_state': self.state.value,
                    'winner': str(player.id)
                })

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to add to meld: {str(e)}")

    def get_game_state(self, for_player_id: Optional[str] = None) -> Dict[str, Any]:
        """Get the current game state"""
        try:
            # Get base game state
            base_state = super().get_game_state(for_player_id)
            
            # Get discard pile top safely
            discard_top = None
            try:
                if self.discard_pile:
                    discard_top = self.discard_pile[-1].to_dict()
            except Exception:
                # If there's any error getting discard top, leave it as None
                pass
            
            # Create rummy specific state
            rummy_state = {
                'discard_pile_top': discard_top,
                'cards_in_deck': len(self.deck.cards),
                'melds': {
                    player_id: [
                        [card.to_dict() for card in meld]
                        for meld in player_melds
                    ]
                    for player_id, player_melds in self.melds.items()
                },
                'last_action': self.last_action
            }
            
            # Merge states
            return {**base_state, **rummy_state}
            
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
                'discard_pile_top': None,
                'cards_in_deck': 0,
                'melds': {},
                'last_action': None,
                'error': str(e)
            }

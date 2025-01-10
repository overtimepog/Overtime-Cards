from typing import Dict, Any, Optional, List, Tuple
from .models import BaseGame, Card, GameState, Player, Rank, Suit

class ScatGame(BaseGame):
    def __init__(self, room_code: str):
        super().__init__(room_code)
        self.discard_pile: List[Card] = []
        self.last_action: Optional[Dict[str, Any]] = None
        self.knocked_player_id: Optional[str] = None  # ID of player who knocked
        self.final_round = False  # True when someone knocks
        self.lives: Dict[str, int] = {}  # Player ID to number of lives (usually 3)
        self.INITIAL_LIVES = 3
        self.max_selectable_cards = 1  # Players select one card to discard

    def _calculate_min_cards_needed(self) -> int:
        """Calculate minimum cards needed for Scat"""
        # In Scat, each player gets 3 cards
        return len(self.players) * 3

    def start_game(self):
        """Start the game with initial setup"""
        # Initialize lives for each player
        for player in self.players.values():
            self.lives[str(player.id)] = self.INITIAL_LIVES
        
        super().start_game()
        
        # Start discard pile
        first_card = self.deck.draw()
        if not first_card:
            raise ValueError("Not enough cards for discard pile")
        self.discard_pile = [first_card]

    def _calculate_hand_value(self, hand: List[Card]) -> int:
        """Calculate the highest value possible in a single suit"""
        try:
            # Group cards by suit
            suits: Dict[Suit, List[Card]] = {}
            for card in hand:
                if card.suit not in suits:
                    suits[card.suit] = []
                suits[card.suit].append(card)

            # Calculate value for each suit
            max_value = 0
            for suit_cards in suits.values():
                value = sum(card.value for card in suit_cards)
                max_value = max(max_value, value)

            return min(max_value, 31)  # Cap at 31
        except Exception as e:
            raise ValueError(f"Failed to calculate hand value: {str(e)}")

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

            if len(player.hand) > 3:
                raise ValueError("Already have maximum cards")

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

            self.last_action = {
                'action': 'card_discarded',
                'player': player.id,
                'card': card.to_dict(),
                'game_state': self.state.value
            }

            # Move to next player unless it's the final round
            if not self.final_round:
                self.next_turn()
            elif player_id == self.knocked_player_id:
                # If knocker has discarded, end the round
                self._end_round()
            else:
                self.next_turn()

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to discard card: {str(e)}")

    def knock(self, player_id: str) -> Dict[str, Any]:
        """Player knocks to end the round"""
        try:
            if self.state != GameState.PLAYING:
                raise ValueError("Game is not in playing state")

            if self.final_round:
                raise ValueError("Round is already ending")

            player = self.players.get(str(player_id))
            if not player:
                raise ValueError("Player not found")

            if not self.current_player:
                raise ValueError("No current player set")

            if player.id != self.current_player.id:
                raise ValueError("Not your turn")

            if len(player.hand) != 3:
                raise ValueError("Must have exactly 3 cards to knock")

            self.knocked_player_id = player_id
            self.final_round = True

            self.last_action = {
                'action': 'player_knocked',
                'player': player_id,
                'game_state': self.state.value
            }

            # Move to next player
            self.next_turn()

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to knock: {str(e)}")

    def _end_round(self):
        """End the current round and determine results"""
        try:
            # Calculate scores
            scores = {}
            for player_id, player in self.players.items():
                scores[str(player_id)] = self._calculate_hand_value(player.hand)

            # Find lowest score(s)
            min_score = min(scores.values())
            losers = [pid for pid, score in scores.items() if score == min_score]

            # Deduct lives from losers
            for loser_id in losers:
                self.lives[loser_id] = max(0, self.lives[loser_id] - 1)

            # Check for eliminated players
            eliminated = [pid for pid, lives in self.lives.items() if lives <= 0]
            
            if len([pid for pid, lives in self.lives.items() if lives > 0]) <= 1:
                # Game over - only one player left with lives
                self.state = GameState.GAME_END
                # Find winner
                winner = next(pid for pid, lives in self.lives.items() if lives > 0)
                self.players[winner].score += 1
            else:
                # Reset for next round
                self.state = GameState.ROUND_END
                self.final_round = False
                self.knocked_player_id = None
                
                # Collect all cards
                for player in self.players.values():
                    self.deck.cards.extend(player.hand)
                    player.hand.clear()
                self.deck.cards.extend(self.discard_pile)
                self.discard_pile.clear()
                
                # Shuffle and deal new hands
                self.deck.shuffle()
                super().start_game()
                
                # Move to next round
                self.state = GameState.PLAYING

            self.last_action = {
                'action': 'round_end',
                'scores': scores,
                'losers': losers,
                'lives': self.lives.copy(),
                'eliminated': eliminated,
                'game_state': self.state.value,
                'game_over': self.state == GameState.GAME_END
            }

            if self.state == GameState.GAME_END:
                # Add winner to last action
                winner = next(pid for pid, lives in self.lives.items() if lives > 0)
                self.last_action['winner'] = winner

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to end round: {str(e)}")

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
            
            # Create scat specific state
            scat_state = {
                'discard_pile_top': discard_top,
                'cards_in_deck': len(self.deck.cards),
                'final_round': self.final_round,
                'knocked_player': self.knocked_player_id,
                'lives': self.lives.copy(),
                'last_action': self.last_action
            }
            
            # Merge states
            return {**base_state, **scat_state}
            
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
                'final_round': False,
                'knocked_player': None,
                'lives': {},
                'last_action': None,
                'error': str(e)
            }

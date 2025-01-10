from typing import Dict, Any, Optional, List, Tuple
from .models import BaseGame, Card, GameState, Player, Rank
import random

class BluffGame(BaseGame):
    def __init__(self, room_code: str):
        super().__init__(room_code)
        self.center_pile: List[Tuple[List[Card], Rank]] = []  # List of (cards, claimed_rank)
        self.last_action: Optional[Dict[str, Any]] = None
        self.current_rank: Optional[Rank] = None  # The rank that must be played next
        self.cards_per_play = 1  # Number of cards that must be played (can increase with multiple same-rank cards)
        self.max_selectable_cards = 4  # Players can play up to 4 cards of the same rank

    def _calculate_min_cards_needed(self) -> int:
        """Calculate minimum cards needed for Bluff"""
        # In Bluff, cards are divided equally among players
        return 52  # Use full deck

    def play_cards(self, player_id: str, card_indices: List[int], claimed_rank: str) -> Dict[str, Any]:
        """Play cards from hand, claiming they are of a specific rank"""
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

            # Validate card indices
            if not card_indices:
                raise ValueError("No cards selected")
                
            if len(card_indices) != self.cards_per_play:
                raise ValueError(f"Must play exactly {self.cards_per_play} cards")

            if any(i < 0 or i >= len(player.hand) for i in card_indices):
                raise ValueError("Invalid card indices")

            # Convert claimed rank string to Rank enum
            try:
                rank_enum = next(r for r in Rank if r.value == claimed_rank)
            except StopIteration:
                raise ValueError("Invalid rank")

            # Validate claimed rank matches required rank if set
            if self.current_rank and rank_enum != self.current_rank:
                raise ValueError(f"Must play {self.current_rank.value}")

            # Get cards being played
            cards = [player.hand[i] for i in sorted(card_indices, reverse=True)]
            
            # Remove cards from hand
            for i in sorted(card_indices, reverse=True):
                player.hand.pop(i)

            # Add cards to center pile
            self.center_pile.append((cards, rank_enum))

            # Update game state
            self.last_action = {
                'action': 'cards_played',
                'player': player.id,
                'cards_count': len(cards),
                'claimed_rank': claimed_rank,
                'game_state': self.state.value
            }

            # Move to next player
            self.next_turn()

            # Set next required rank
            next_rank_idx = (list(Rank).index(rank_enum) + 1) % len(Rank)
            self.current_rank = list(Rank)[next_rank_idx]

            # Check for win condition
            if not player.hand:
                self.state = GameState.GAME_END
                player.score += 1  # Winner gets a point
                self.last_action.update({
                    'game_state': self.state.value,
                    'winner': player.id
                })

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to play cards: {str(e)}")

    def challenge(self, challenger_id: str) -> Dict[str, Any]:
        """Challenge the last played cards"""
        try:
            if self.state != GameState.PLAYING:
                raise ValueError("Game is not in playing state")

            if not self.center_pile:
                raise ValueError("No cards to challenge")

            challenger = self.players.get(str(challenger_id))
            if not challenger:
                raise ValueError("Player not found")

            # Get the last played cards and their claimed rank
            last_cards, claimed_rank = self.center_pile[-1]
            
            # Find the last player
            last_player_idx = (self.current_player_idx - 1) % len(self.players)
            last_player = self.player_order[last_player_idx]
            if not last_player:
                raise ValueError("Last player not found")

            # Check if the claim was true
            was_bluffing = any(card.rank != claimed_rank for card in last_cards)

            # Collect all cards from center pile
            all_cards = [card for cards, _ in self.center_pile for card in cards]
            total_cards = len(all_cards)

            if was_bluffing:
                # Challenger was right - last player takes the center pile
                last_player.hand.extend(all_cards)
                self.center_pile.clear()
                
                # Sort the received cards
                last_player.hand.sort(key=lambda card: (card.rank.value, card.suit.value))

                self.last_action = {
                    'action': 'challenge_success',
                    'challenger': challenger_id,
                    'challenged_player': last_player.id,
                    'cards_count': total_cards,
                    'revealed_cards': [card.to_dict() for card in last_cards],
                    'game_state': self.state.value
                }
                
                # Challenger gets a point
                challenger.score += 1
            else:
                # Challenger was wrong - they take the center pile
                challenger.hand.extend(all_cards)
                self.center_pile.clear()
                
                # Sort the received cards
                challenger.hand.sort(key=lambda card: (card.rank.value, card.suit.value))

                self.last_action = {
                    'action': 'challenge_failed',
                    'challenger': challenger_id,
                    'challenged_player': last_player.id,
                    'cards_count': total_cards,
                    'revealed_cards': [card.to_dict() for card in last_cards],
                    'game_state': self.state.value
                }
                
                # Last player gets a point for successful bluff
                last_player.score += 1

            # Reset play requirements
            self.current_rank = None
            self.cards_per_play = 1

            # Check if game should end
            if not last_player.hand or not challenger.hand:
                self.state = GameState.GAME_END
                self.last_action['game_state'] = self.state.value
                if not last_player.hand:
                    self.last_action['winner'] = last_player.id
                    last_player.score += 1
                if not challenger.hand:
                    self.last_action['winner'] = challenger.id
                    challenger.score += 1

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to process challenge: {str(e)}")

    def get_game_state(self, for_player_id: Optional[str] = None) -> Dict[str, Any]:
        """Get the current game state"""
        try:
            # Get base game state
            base_state = super().get_game_state(for_player_id)
            
            # Calculate center pile information
            total_cards = sum(len(cards) for cards, _ in self.center_pile)
            
            # Get last played info safely
            last_played = None
            try:
                if self.center_pile:
                    last_cards, last_rank = self.center_pile[-1]
                    last_played = {
                        'cards_count': len(last_cards),
                        'claimed_rank': last_rank.value
                    }
            except Exception:
                # If there's any error getting last played info, leave it as None
                pass
            
            # Create bluff specific state
            bluff_state = {
                'center_pile_count': total_cards,
                'last_played': last_played,
                'next_rank': self.current_rank.value if self.current_rank else None,
                'cards_per_play': self.cards_per_play,
                'last_action': self.last_action
            }
            
            # Merge states
            return {**base_state, **bluff_state}
            
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
                'center_pile_count': 0,
                'last_played': None,
                'next_rank': None,
                'cards_per_play': 1,
                'last_action': None,
                'error': str(e)
            }

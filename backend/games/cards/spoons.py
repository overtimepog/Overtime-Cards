from typing import Dict, Any, Optional, List
from .models import BaseGame, Card, GameState, Player
import random

class SpoonsGame(BaseGame):
    def __init__(self, room_code: str):
        super().__init__(room_code)
        self.spoons: int = 0  # Number of spoons in play
        self.last_action: Optional[Dict[str, Any]] = None
        self.cards_per_hand = 4  # Each player gets 4 cards

    def _calculate_min_cards_needed(self) -> int:
        """Calculate minimum cards needed for Spoons"""
        # Need 4 cards per player
        return len(self.players) * self.cards_per_hand

    def start_game(self):
        """Start the Spoons game by dealing cards and setting initial state"""
        self.spoons = len(self.players) - 1
        self.deal_initial_cards()
        self.state = GameState.PLAYING
        self.current_player_idx = 0

    def deal_initial_cards(self):
        """Deal 4 cards to each player"""
        if len(self.players) < 3:
            raise ValueError("Spoons requires at least 3 players")
            
        try:
            # Validate we have enough cards
            total_cards_needed = len(self.players) * self.cards_per_hand
            if len(self.deck.cards) < total_cards_needed:
                raise ValueError(f"Not enough cards to deal. Need {total_cards_needed}, have {len(self.deck.cards)}")
            
            # Pre-calculate all hands
            hands = []
            for _ in range(len(self.players)):
                hand = self.deck.draw_multiple(self.cards_per_hand)
                if len(hand) != self.cards_per_hand:
                    raise ValueError(f"Could not deal {self.cards_per_hand} cards to each player")
                hands.append(hand)
            
            # Assign hands to players
            for player, hand in zip(self.players.values(), hands):
                player.hand = hand
                
        except Exception as e:
            raise ValueError(f"Failed to deal initial cards: {str(e)}")

    def play_turn(self, player_id: str, card_index: int) -> Dict[str, Any]:
        """Player plays a card and passes it to the next player"""
        if self.state != GameState.PLAYING:
            raise ValueError("Game is not in playing state")

        player = self.players.get(player_id)
        if not player:
            raise ValueError("Player not found")

        if player.id != self.current_player.id:
            raise ValueError("Not your turn")

        if card_index < 0 or card_index >= len(player.hand):
            raise ValueError("Invalid card index")

        # Pass the card to the next player
        card = player.hand.pop(card_index)
        next_player = self.get_next_player()
        next_player.hand.append(card)

        # Check for four of a kind
        if self.has_four_of_a_kind(player):
            self.state = GameState.GAME_END
            return {
                'action': 'four_of_a_kind',
                'player': player.id,
                'game_state': self.state.value
            }

        # Move to next player
        self.next_turn()

        return {
            'action': 'card_passed',
            'player': player.id,
            'next_player': next_player.id,
            'game_state': self.state.value
        }

    def has_four_of_a_kind(self, player: Player) -> bool:
        """Check if the player has four cards of the same rank"""
        rank_count = {}
        for card in player.hand:
            rank_count[card.rank] = rank_count.get(card.rank, 0) + 1
            if rank_count[card.rank] == 4:
                return True
        return False

    def get_game_state(self, for_player_id: Optional[str] = None) -> Dict[str, Any]:
        """Get the current game state"""
        base_state = super().get_game_state(for_player_id)
        spoons_state = {
            'spoons': self.spoons,
            'last_action': self.last_action
        }
        return {**base_state, **spoons_state}

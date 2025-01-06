from typing import Dict, Any, Optional, List
from .models import BaseGame, Card, GameState, Player
import random

class SpoonsGame(BaseGame):
    def __init__(self, room_code: str):
        super().__init__(room_code)
        self.spoons: int = 0  # Number of spoons in play
        self.total_spoons: int = 0  # Total number of spoons at game start
        self.grabbed_spoons: Dict[str, bool] = {}  # Track which players have grabbed spoons
        self.last_action: Optional[Dict[str, Any]] = None
        self.cards_per_hand = 4  # Each player gets 4 cards
        self.spoons_taken = set()  # Set of player IDs who have taken spoons

    def _calculate_min_cards_needed(self) -> int:
        """Calculate minimum cards needed for Spoons"""
        # In Spoons, each player gets 4 cards
        return len(self.players) * 4

    def start_game(self):
        """Start the Spoons game by dealing cards and setting initial state"""
        if len(self.players) < 3:
            raise ValueError("Spoons requires at least 3 players")
            
        self.total_spoons = len(self.players) - 1
        self.spoons = self.total_spoons
        self.grabbed_spoons = {}  # Reset grabbed spoons
        super().start_game()

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

    def grab_spoon(self, player_id: str) -> Dict[str, Any]:
        """Player attempts to grab a spoon"""
        if self.state != GameState.PLAYING:
            raise ValueError("Game is not in playing state")

        player = self.players.get(player_id)
        if not player:
            raise ValueError("Player not found")

        if self.spoons <= 0:
            raise ValueError("No spoons left to grab")

        if player_id in self.grabbed_spoons:
            raise ValueError("You already grabbed a spoon")

        # Check if player has four of a kind
        has_four = self.has_four_of_a_kind(player)
        
        # Record that this player grabbed a spoon
        self.grabbed_spoons[player_id] = True
        
        # Decrement spoon count
        self.spoons -= 1
        
        # If this was the last spoon, end the game
        if self.spoons == 0:
            self.state = GameState.GAME_END
            # The player without a spoon loses
            for pid in self.players:
                if pid not in self.grabbed_spoons:
                    self.loser = pid
                    break
        
        self.last_action = {
            'action': 'grab_spoon',
            'player': player_id,
            'had_four_of_a_kind': has_four,
            'spoon_index': self.spoons  # Index of the spoon that was grabbed
        }
        
        return {
            'action': 'spoon_grabbed',
            'player': player_id,
            'spoons_left': self.spoons,
            'had_four_of_a_kind': has_four,
            'spoon_index': self.spoons,
            'game_state': self.state.value
        }

    def get_game_state(self, for_player_id: Optional[str] = None) -> Dict[str, Any]:
        """Get the current game state"""
        base_state = super().get_game_state(for_player_id)
        spoons_state = {
            'spoons': self.spoons,
            'total_spoons': self.total_spoons,
            'grabbed_spoons': self.grabbed_spoons,
            'last_action': self.last_action
        }
        return {**base_state, **spoons_state}

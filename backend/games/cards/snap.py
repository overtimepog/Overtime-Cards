from typing import Dict, Any, Optional, List
from .models import BaseGame, Card, GameState
import time

class SnapGame(BaseGame):
    def __init__(self, room_code: str):
        super().__init__(room_code)
        self.center_pile: List[Card] = []
        self.last_snap_time: Dict[str, float] = {}  # Player ID to timestamp
        self.snap_window = 0.1  # 100ms window for simultaneous snaps
        self.last_card_time: Optional[float] = None
        self.card_play_timeout = 5.0  # 5 seconds to play a card
        self.cards_per_player = 4  # Snap deals 4 cards to each player

    def _calculate_min_cards_needed(self) -> int:
        """Calculate minimum cards needed for Snap"""
        # Snap needs at least 4 cards per player to be playable
        return len(self.players) * self.cards_per_player

    def deal_initial_cards(self):
        """Deal initial cards to players in Snap"""
        try:
            # Validate we have enough cards
            total_cards_needed = len(self.players) * self.cards_per_player
            if len(self.deck.cards) < total_cards_needed:
                raise ValueError(f"Not enough cards to deal. Need {total_cards_needed}, have {len(self.deck.cards)}")

            # Pre-calculate all player hands to ensure fair dealing
            hands = []
            for _ in range(len(self.players)):
                hand = self.deck.draw_multiple(self.cards_per_player)
                if len(hand) != self.cards_per_player:
                    raise ValueError(f"Could not deal {self.cards_per_player} cards to each player")
                hands.append(hand)

            # Assign hands to players
            for player, hand in zip(self.players.values(), hands):
                player.hand = hand

        except Exception as e:
            raise ValueError(f"Failed to deal initial cards: {str(e)}")

    def start_game(self):
        """Start the Snap game by dealing cards and setting initial state"""
        self.deal_initial_cards()
        self.state = GameState.PLAYING
        self.current_player_idx = 0

    def play_card(self, player_id: str) -> Dict[str, Any]:
        """Play a card from the player's hand to the center"""
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

            if not player.hand:
                raise ValueError("No cards in hand")

            # Play the top card
            card = player.hand.pop()
            self.center_pile.append(card)
            self.last_card_time = time.time()

            # Move to next player
            self.next_turn()

            # Update game state
            self.last_action = {
                'action': 'card_played',
                'player': player_id,
                'card': card.to_dict(),
                'game_state': self.state
            }

            # Save game state
            self._save_game_state()

            return self.get_game_state()
        except Exception as e:
            raise ValueError(f"Failed to play card: {str(e)}")

    def snap(self, player_id: str) -> Dict[str, Any]:
        """Player calls snap on matching cards"""
        try:
            if self.state != GameState.PLAYING:
                raise ValueError("Game is not in playing state")

            if len(self.center_pile) < 2:
                raise ValueError("Not enough cards to snap")

            player = self.players.get(str(player_id))
            if not player:
                raise ValueError("Player not found")

            current_time = time.time()
            self.last_snap_time[str(player_id)] = current_time

            # Check if cards match
            top_card = self.center_pile[-1]
            second_card = self.center_pile[-2]
            cards_match = top_card.rank == second_card.rank

            if not cards_match:
                # Penalty: Player must give one card to each other player
                penalty_cards = []
                if player.hand:
                    for _ in range(min(len(self.players) - 1, len(player.hand))):
                        penalty_cards.append(player.hand.pop())

                if penalty_cards:
                    other_players = [p for p in self.players.values() if p.id != str(player_id)]
                    for i, card in enumerate(penalty_cards):
                        other_players[i % len(other_players)].hand.append(card)

                # Update game state if player is out of cards
                if not player.hand:
                    players_with_cards = [p for p in self.players.values() if p.hand]
                    if len(players_with_cards) <= 1:
                        self.state = GameState.GAME_END
                        if players_with_cards:
                            players_with_cards[0].score += 1

                return {
                    'action': 'snap_failed',
                    'player': player.id,
                    'penalty_cards': len(penalty_cards),
                    'game_state': self.state.value
                }

            # Find all players who snapped within the time window
            valid_snaps = {
                pid: t for pid, t in self.last_snap_time.items()
                if current_time - t <= self.snap_window
            }

            if not valid_snaps:
                return {'action': 'no_valid_snaps'}

            # Find the fastest player
            winner_id = min(valid_snaps.items(), key=lambda x: x[1])[0]
            winner = self.players.get(str(winner_id))
            if not winner:
                return {'action': 'no_valid_snaps'}

            # Calculate points based on center pile size
            points = len(self.center_pile) // 2  # 1 point per pair
            winner.score += points

            # Winner gets all cards from the center pile
            center_pile_size = len(self.center_pile)
            winner.hand.extend(self.center_pile)
            self.center_pile.clear()
            self.last_snap_time.clear()
            self.last_card_time = None

            # Check if game is over
            players_with_cards = [p for p in self.players.values() if p.hand]
            if len(players_with_cards) <= 1:
                self.state = GameState.GAME_END
                if players_with_cards:
                    players_with_cards[0].score += 1

            return {
                'action': 'snap_success',
                'player': winner.id,
                'cards_won': center_pile_size,
                'points_earned': points,
                'game_state': self.state.value
            }
        except Exception as e:
            raise ValueError(f"Failed to process snap: {str(e)}")

    def get_game_state(self, for_player_id: Optional[str] = None) -> Dict[str, Any]:
        """Get the current game state"""
        try:
            # Get base game state
            base_state = super().get_game_state(for_player_id)

            # Create snap-specific state
            snap_state = {
                'center_pile': [card.to_dict() for card in self.center_pile],
                'center_pile_count': len(self.center_pile),
                'can_snap': len(self.center_pile) >= 2,
                'last_card_time': self.last_card_time,
                'last_action': {
                    'action': 'card_played',
                    'player': self.current_player.id if self.current_player else None,
                    'timestamp': self.last_card_time
                } if self.last_card_time else None
            }

            # Merge states
            return {**base_state, **snap_state}

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
                'center_pile': [],
                'center_pile_count': 0,
                'can_snap': False,
                'error': str(e)
            }

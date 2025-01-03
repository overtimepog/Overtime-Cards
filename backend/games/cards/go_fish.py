from typing import Dict, Any, Optional, List, Tuple
from .models import BaseGame, Card, GameState, Player, Rank

class GoFishGame(BaseGame):
    def __init__(self, room_code: str):
        super().__init__(room_code)
        self.sets: Dict[str, List[List[Card]]] = {}  # Player ID to list of completed sets
        self.last_action: Optional[Dict[str, Any]] = None
        self.cards_per_hand = 7  # Standard Go Fish uses 7 cards for 2-3 players, 5 for 4-6 players
        
    def _calculate_min_cards_needed(self) -> int:
        """Calculate minimum cards needed for Go Fish"""
        # Adjust cards per hand based on player count
        cards_needed = 7 if len(self.players) <= 3 else 5
        # Need enough cards for each player's initial hand plus some for fishing
        return (len(self.players) * cards_needed) + len(self.players)

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
                self.sets[str(player.id)] = []

            # Set initial current player
            self.current_player_idx = 0
            
            # Save initial game state
            return self.get_game_state()
        except Exception as e:
            raise ValueError(f"Failed to deal initial cards: {str(e)}")

    def _check_for_sets(self, player: Player) -> List[List[Card]]:
        """Check and remove any completed sets from player's hand"""
        # Group cards by rank
        ranks: Dict[Rank, List[Card]] = {}
        for card in player.hand:
            if card.rank not in ranks:
                ranks[card.rank] = []
            ranks[card.rank].append(card)
        
        # Find and remove sets of four
        new_sets = []
        for rank, cards in list(ranks.items()):
            if len(cards) == 4:
                new_sets.append(cards)
                player.hand = [c for c in player.hand if c not in cards]
                player.score += 1
        
        if new_sets:
            self.sets[str(player.id)].extend(new_sets)
        
        return new_sets

    def ask_for_cards(self, asking_player_id: str, target_player_id: str, rank: str) -> Dict[str, Any]:
        """Ask another player for cards of a specific rank"""
        try:
            if self.state != GameState.PLAYING:
                raise ValueError("Game is not in playing state")

            asking_player = self.players.get(str(asking_player_id))
            target_player = self.players.get(str(target_player_id))

            if not asking_player or not target_player:
                raise ValueError("Player not found")

            if asking_player.id != self.current_player.id:
                raise ValueError("Not your turn")

            if asking_player.id == target_player.id:
                raise ValueError("Cannot ask yourself for cards")

            # Check if asking player has a card of the requested rank
            has_rank = any(card.rank == rank for card in asking_player.hand)
            if not has_rank:
                # Draw a card if player doesn't have the requested rank
                drawn_card = self.deck.draw()
                if drawn_card:
                    asking_player.hand.append(drawn_card)
                    self.last_action = {
                        'action': 'go_fish',
                        'player': asking_player_id,
                        'rank': rank,
                        'game_state': self.state.value
                    }
                    self.next_turn()
                    return self.get_game_state(asking_player_id)
                else:
                    self.last_action = {
                        'action': 'no_cards',
                        'player': asking_player_id,
                        'rank': rank,
                        'game_state': self.state.value
                    }
                    self.next_turn()
                    return self.get_game_state(asking_player_id)

            # Check if target player has any matching cards
            matching_cards = [card for card in target_player.hand if card.rank == rank]
            
            if matching_cards:
                # Transfer cards
                for card in matching_cards:
                    target_player.hand.remove(card)
                    asking_player.hand.append(card)
                
                # Check for sets after receiving cards
                new_sets = self._check_for_sets(asking_player)
                
                self.last_action = {
                    'action': 'cards_received',
                    'player': asking_player_id,
                    'target': target_player_id,
                    'rank': rank,
                    'count': len(matching_cards),
                    'new_sets': [[card.to_dict() for card in set_cards] for set_cards in new_sets],
                    'game_state': self.state.value
                }
            else:
                # Go fish
                drawn_card = self.deck.draw()
                if drawn_card:
                    asking_player.hand.append(drawn_card)
                    # Check if drawn card matches requested rank
                    if drawn_card.rank == rank:
                        self.last_action = {
                            'action': 'successful_fish',
                            'player': asking_player_id,
                            'rank': rank,
                            'game_state': self.state.value
                        }
                    else:
                        self.last_action = {
                            'action': 'go_fish',
                            'player': asking_player_id,
                            'rank': rank,
                            'game_state': self.state.value
                        }
                        # Move to next player since card didn't match
                        self.next_turn()
                else:
                    # No cards left in deck
                    self.last_action = {
                        'action': 'no_cards',
                        'player': asking_player_id,
                        'rank': rank,
                        'game_state': self.state.value
                    }
                    self.next_turn()

            # Check for game end
            if self._check_game_end():
                self.state = GameState.GAME_END
                
            return self.get_game_state(asking_player_id)

        except Exception as e:
            raise ValueError(f"Failed to ask for cards: {str(e)}")

    def get_game_state(self, for_player_id: Optional[str] = None) -> Dict[str, Any]:
        """Get the current game state"""
        try:
            # Get base game state
            base_state = super().get_game_state(for_player_id)
            
            # Create go fish specific state
            go_fish_state = {
                'sets': {
                    player_id: [[card.to_dict() for card in set_cards] for set_cards in sets]
                    for player_id, sets in self.sets.items()
                },
                'scores': {
                    player_id: len(sets)
                    for player_id, sets in self.sets.items()
                },
                'cards_in_deck': len(self.deck.cards),
                'last_action': self.last_action
            }
            
            # Add player's hand if for_player_id is provided
            if for_player_id:
                player = self.players.get(str(for_player_id))
                if player:
                    base_state['players'][str(for_player_id)]['hand'] = [card.to_dict() for card in player.hand]
            
            # Merge states and return
            return {**base_state, **go_fish_state}
            
        except Exception as e:
            raise ValueError(f"Failed to get game state: {str(e)}")

    def _check_game_end(self) -> bool:
        """Check if the game should end"""
        # Game ends when all cards are in sets (no cards in hands or deck)
        total_cards = sum(len(p.hand) for p in self.players.values()) + len(self.deck.cards)
        return total_cards == 0

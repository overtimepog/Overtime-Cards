from typing import Dict, Any, Optional, List, Tuple
from .models import BaseGame, Card, GameState, Player, Rank, Suit

class SpadesGame(BaseGame):
    def __init__(self, room_code: str):
        super().__init__(room_code)
        self.current_trick: List[Tuple[str, Card]] = []  # List of (player_id, card)
        self.tricks_won: Dict[str, int] = {}  # player_id -> tricks won
        self.bids: Dict[str, int] = {}  # player_id -> bid
        self.scores: Dict[str, int] = {}  # player_id -> score
        self.bags: Dict[str, int] = {}  # player_id -> bags
        self.spades_broken = False
        self.target_score = 500
        self.required_players = 4  # Spades requires exactly 4 players

    def _calculate_min_cards_needed(self) -> int:
        """Calculate minimum cards needed for Spades"""
        # In Spades, each player gets 13 cards
        return len(self.players) * 13

    def start_game(self):
        """Start the game with validation for exactly 4 players"""
        if len(self.players) != self.required_players:
            raise ValueError(f"Spades requires exactly {self.required_players} players (currently have {len(self.players)})")
            
        # Initialize player state
        for player in self.players.values():
            player_id = str(player.id)
            self.tricks_won[player_id] = 0
            self.bids[player_id] = -1  # -1 indicates bid not yet made
            
            # Initialize scores if not already set
            if player_id not in self.scores:
                self.scores[player_id] = 0
                self.bags[player_id] = 0
        
        super().start_game()
        
        # Sort each player's hand by suit and rank
        for player in self.players.values():
            player.hand = sorted(player.hand, key=lambda card: (
                card.suit.value,
                list(Rank).index(card.rank)
            ))

    def make_bid(self, player_id: str, bid: int) -> Dict[str, Any]:
        """Player makes a bid for number of tricks they expect to win"""
        try:
            if self.state != GameState.STARTING:
                raise ValueError("Not in bidding phase")

            player = self.players.get(str(player_id))
            if not player:
                raise ValueError("Player not found")

            if not self.current_player:
                raise ValueError("No current player set")

            if player.id != self.current_player.id:
                raise ValueError("Not your turn to bid")

            if bid < 0 or bid > 13:
                raise ValueError("Bid must be between 0 and 13")

            self.bids[str(player_id)] = bid
            self.last_action = {
                'action': 'bid_made',
                'player': player_id,
                'bid': bid,
                'game_state': self.state.value
            }

            # Move to next player
            self.next_turn()

            # Check if all players have bid
            if all(bid >= 0 for bid in self.bids.values()):
                self.state = GameState.PLAYING
                self.last_action['game_state'] = self.state.value

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to make bid: {str(e)}")

    def _get_trick_winner(self) -> str:
        """Determine winner of the current trick"""
        try:
            if not self.current_trick:
                raise ValueError("No cards in trick")

            # Get the leading suit
            leading_suit = self.current_trick[0][1].suit

            # Find highest card of leading suit or highest spade
            highest_card = self.current_trick[0][1]
            winner_id = self.current_trick[0][0]

            for player_id, card in self.current_trick[1:]:
                # If either card is a spade, compare them specially
                if card.suit == Suit.SPADES or highest_card.suit == Suit.SPADES:
                    # If only one is a spade, spade wins
                    if card.suit == Suit.SPADES and highest_card.suit != Suit.SPADES:
                        highest_card = card
                        winner_id = player_id
                    # If both are spades, higher rank wins
                    elif card.suit == Suit.SPADES and highest_card.suit == Suit.SPADES:
                        if list(Rank).index(card.rank) > list(Rank).index(highest_card.rank):
                            highest_card = card
                            winner_id = player_id
                # If neither is a spade, follow leading suit
                elif (card.suit == highest_card.suit and 
                      list(Rank).index(card.rank) > list(Rank).index(highest_card.rank)):
                    highest_card = card
                    winner_id = player_id

            return winner_id
        except Exception as e:
            raise ValueError(f"Failed to determine trick winner: {str(e)}")

    def play_card(self, player_id: str, card_index: int) -> Dict[str, Any]:
        """Play a card to the current trick"""
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

            card = player.hand[card_index]

            # Validate play
            if self.current_trick:
                # Must follow suit if possible
                leading_suit = self.current_trick[0][1].suit
                if card.suit != leading_suit:
                    has_suit = any(c.suit == leading_suit for c in player.hand)
                    if has_suit:
                        raise ValueError("Must follow suit")
            else:
                # Leading the trick
                # Can't lead with spades unless spades are broken or only have spades
                if (card.suit == Suit.SPADES and not self.spades_broken and
                    any(c.suit != Suit.SPADES for c in player.hand)):
                    raise ValueError("Cannot lead with spades until broken")

            # Remove card from hand and add to trick
            player.hand.pop(card_index)
            self.current_trick.append((player_id, card))

            # Mark spades as broken if spade is played
            if card.suit == Suit.SPADES:
                self.spades_broken = True

            self.last_action = {
                'action': 'card_played',
                'player': player_id,
                'card': card.to_dict(),
                'game_state': self.state.value
            }

            # If trick is complete
            if len(self.current_trick) == len(self.players):
                # Determine winner
                winner_id = self._get_trick_winner()
                self.tricks_won[winner_id] += 1

                # Update last action
                self.last_action.update({
                    'trick_complete': True,
                    'winner': winner_id,
                    'trick': [(pid, card.to_dict()) for pid, card in self.current_trick]
                })

                # Clear trick and set next player
                self.current_trick = []
                self.current_player_idx = list(self.players.keys()).index(winner_id)

                # Check if hand is complete
                if not any(player.hand for player in self.players.values()):
                    self._score_hand()
            else:
                # Move to next player
                self.next_turn()

            return self.last_action
        except Exception as e:
            raise ValueError(f"Failed to play card: {str(e)}")

    def _score_hand(self):
        """Score the completed hand"""
        try:
            self.state = GameState.ROUND_END
            
            # Calculate scores for each player
            round_scores = {}
            for player_id, bid in self.bids.items():
                tricks = self.tricks_won[player_id]
                
                if tricks >= bid:
                    # Made bid: 10 points per bid + 1 point per overtrick
                    round_scores[player_id] = bid * 10
                    overtricks = tricks - bid
                    round_scores[player_id] += overtricks
                    self.bags[player_id] += overtricks
                    
                    # Check for bag penalty (10 bags = -100 points)
                    if self.bags[player_id] >= 10:
                        round_scores[player_id] -= 100
                        self.bags[player_id] -= 10
                else:
                    # Failed bid: -10 points per bid
                    round_scores[player_id] = -bid * 10

            # Update total scores
            for player_id, score in round_scores.items():
                self.scores[player_id] += score

            # Check for game end
            if any(score >= self.target_score for score in self.scores.values()):
                self.state = GameState.GAME_END
                # Winner is player with highest score
                winner_id = max(self.scores.items(), key=lambda x: x[1])[0]
                self.last_action = {
                    'action': 'game_end',
                    'winner': winner_id,
                    'final_scores': self.scores.copy(),
                    'game_state': self.state.value
                }
            else:
                # Reset for next hand
                self.current_trick = []
                self.tricks_won = {str(pid): 0 for pid in self.players.keys()}
                self.bids = {str(pid): -1 for pid in self.players}
                self.spades_broken = False
                
                # Collect and shuffle cards
                self.deck.reset()
                
                # Deal new hand
                super().start_game()
                
                # Move to bidding phase
                self.state = GameState.STARTING
                
                self.last_action = {
                    'action': 'hand_scored',
                    'round_scores': round_scores,
                    'total_scores': self.scores.copy(),
                    'bags': self.bags.copy(),
                    'game_state': self.state.value
                }
        except Exception as e:
            raise ValueError(f"Failed to score hand: {str(e)}")

    def get_game_state(self, for_player_id: Optional[str] = None) -> Dict[str, Any]:
        """Get the current game state"""
        try:
            # Get base game state
            base_state = super().get_game_state(for_player_id)
            
            # Create spades specific state
            spades_state = {
                'bids': self.bids.copy(),
                'tricks_won': self.tricks_won.copy(),
                'current_trick': [
                    (pid, card.to_dict())
                    for pid, card in self.current_trick
                ],
                'spades_broken': self.spades_broken,
                'scores': self.scores.copy(),
                'bags': self.bags.copy(),
                'last_action': self.last_action
            }
            
            # Merge states
            return {**base_state, **spades_state}
            
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
                'bids': {},
                'tricks_won': {},
                'current_trick': [],
                'spades_broken': False,
                'scores': {},
                'bags': {},
                'last_action': None,
                'error': str(e)
            }

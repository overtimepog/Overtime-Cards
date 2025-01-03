from .models import Card, Rank, Suit, GameState
from .snap import SnapGame
from .go_fish import GoFishGame
from .bluff import BluffGame
from .scat import ScatGame
from .rummy import RummyGame
from .kings_corner import KingsCornerGame
from .spades import SpadesGame
from .spoons import SpoonsGame

# Map of game IDs to game classes
CARD_GAMES = {
    'snap': {
        'class': SnapGame,
        'name': 'Snap',
        'min_players': 2,
        'max_players': 6,
        'description': 'Race to collect all cards by being the first to spot matching ranks.'
    },
    'go_fish': {
        'class': GoFishGame,
        'name': 'Go Fish',
        'min_players': 2,
        'max_players': 6,
        'description': 'Collect sets of four cards by asking other players for specific ranks.'
    },
    'bluff': {
        'class': BluffGame,
        'name': 'Bluff',
        'min_players': 2,
        'max_players': 6,
        'description': 'Get rid of all your cards by playing them face down and claiming their ranks. But beware - other players can challenge your claims!'
    },
    'scat': {
        'class': ScatGame,
        'name': 'Scat (31)',
        'min_players': 2,
        'max_players': 6,
        'description': 'Try to get the highest score in one suit (up to 31) or knock if you think you have the best hand.'
    },
    'rummy': {
        'class': RummyGame,
        'name': 'Rummy',
        'min_players': 2,
        'max_players': 6,
        'description': 'Form sets (same rank) and runs (sequential cards of same suit) to get rid of all your cards.'
    },
    'kings_corner': {
        'class': KingsCornerGame,
        'name': 'Kings in the Corner',
        'min_players': 2,
        'max_players': 4,
        'description': 'Get rid of all your cards by building foundation piles in descending order, alternating colors.'
    },
    'spades': {
        'class': SpadesGame,
        'name': 'Spades',
        'min_players': 4,
        'max_players': 4,
        'description': 'A trick-taking game where spades are always trump. Bid the number of tricks you think you can win.'
    },
    'spoons': {
        'class': SpoonsGame,
        'name': 'Spoons',
        'min_players': 3,
        'max_players': 8,
        'description': 'Pass cards quickly to collect four of a kind, then grab a spoon. Last player without a spoon loses!'
    }
}

# Export all game-related classes and constants
__all__ = [
    'Card', 'Rank', 'Suit', 'GameState',
    'SnapGame', 'GoFishGame', 'BluffGame', 'ScatGame',
    'RummyGame', 'KingsCornerGame', 'SpadesGame', 'SpoonsGame',
    'CARD_GAMES'
]

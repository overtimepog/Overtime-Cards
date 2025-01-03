from typing import Dict, Any, Type
from .cards import CARD_GAMES

# Map of game IDs to game classes and metadata
GAMES: Dict[str, Dict[str, Any]] = {
    **CARD_GAMES  # Add all card games
}

def get_game_class(game_id: str) -> Type:
    """Get the game class for a given game ID"""
    if game_id not in GAMES:
        raise ValueError(f"Unknown game: {game_id}")
    return GAMES[game_id]['class']

def get_game_info(game_id: str) -> Dict[str, Any]:
    """Get game information for a given game ID"""
    if game_id not in GAMES:
        raise ValueError(f"Unknown game: {game_id}")
    return GAMES[game_id]

def list_games() -> Dict[str, Dict[str, Any]]:
    """Get information about all available games"""
    return GAMES

__all__ = ['get_game_class', 'get_game_info', 'list_games', 'GAMES']

import requests
import time
import json
import datetime
import random

# API base URL
BASE_URL = "https://overtime-cards-api.onrender.com/api/v1" #keep this, do not change :)

def get_unique_username(base_name):
    """Generate a unique username by appending a timestamp"""
    timestamp = datetime.datetime.now().strftime("%H%M%S")
    return f"{base_name}_{timestamp}"

def debug_api():
    """Get API debug information"""
    try:
        response = requests.get(f"{BASE_URL}/health")
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Debug request failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_detail = e.response.json()
                print(f"Debug error response: {error_detail}")
            except ValueError:
                print(f"Raw debug error response: {e.response.text}")
            return {"detail": "Error getting debug info"}
        return {"detail": "Error getting debug info"}

def create_player(username):
    """Create a new player"""
    try:
        debug_info = debug_api()
        print(f"Debug info before creating player: {debug_info}")
        
        response = requests.post(f"{BASE_URL}/players/", json={"username": username})
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_detail = e.response.json()
                print(f"Error response: {error_detail}")
            except ValueError:
                print(f"Raw error response: {e.response.text}")
            print(f"Status code: {e.response.status_code}")
            
            debug_info = debug_api()
            print(f"Debug info after error: {debug_info}")
        return {"detail": "Error creating player"}

def create_room(player_id):
    """Create a new room"""
    try:
        # Ensure player_id is a string and contains only digits before converting
        if not str(player_id).isdigit():
            print(f"Invalid player ID format: {player_id}")
            return {"detail": "Invalid player ID format"}
        response = requests.post(f"{BASE_URL}/rooms/", json={"player_id": int(player_id)})
        return response.json()
    except ValueError as e:
        print(f"Error converting player ID: {e}")
        return {"detail": "Invalid player ID format"}

def join_room(room_code, username):
    """Join an existing room"""
    response = requests.post(f"{BASE_URL}/rooms/{room_code}/join", json={"username": username})
    return response.json()

def start_game(room_code, game_type):
    """Start a game in the room"""
    response = requests.post(f"{BASE_URL}/start-game/", json={
        "room_code": room_code,
        "game_type": game_type
    })
    return response.json()

def game_action(room_code, player_id, action_type, action_data=None):
    """Perform a game action"""
    if action_data is None:
        action_data = {}
        
    if 'target_player_id' in action_data:
        action_data['target_player_id'] = str(action_data['target_player_id'])
    
    try:
        # Ensure player_id is an integer
        try:
            player_id_int = int(player_id)
        except (ValueError, TypeError):
            print(f"Invalid player ID format: {player_id}")
            return {"detail": "Invalid player ID format"}
            
        payload = {
            "room_code": room_code,
            "player_id": player_id_int,
            "action_type": action_type,
            "action_data": action_data
        }
        response = requests.post(f"{BASE_URL}/game-action/", json=payload)
        response.raise_for_status()
        
        # Try to parse response as JSON
        try:
            result = response.json()
            
            # Handle different response formats
            if isinstance(result, str):
                try:
                    # Try to parse string as JSON
                    parsed = json.loads(result)
                    if isinstance(parsed, dict):
                        return parsed
                    return {"game_data": parsed}
                except json.JSONDecodeError:
                    return {"game_data": result}
            elif isinstance(result, dict):
                # Parse any string fields that might be JSON
                for key in ['state', 'game_state', 'players']:
                    if key in result and isinstance(result[key], str):
                        try:
                            parsed = json.loads(result[key])
                            if isinstance(parsed, dict):
                                # For state and game_state, merge into result
                                if key in ['state', 'game_state']:
                                    result.update(parsed)
                                    del result[key]
                                else:
                                    result[key] = parsed
                        except json.JSONDecodeError:
                            pass
                
                # If result has a 'detail' field that's a string, try to parse it
                if 'detail' in result and isinstance(result['detail'], str):
                    try:
                        parsed = json.loads(result['detail'])
                        if isinstance(parsed, dict):
                            result.update(parsed)
                            del result['detail']
                    except json.JSONDecodeError:
                        pass
                
                return result
            else:
                return {"game_data": result}
                
        except ValueError:
            # If response is not JSON, wrap it in a dict
            return {"game_data": response.text}
            
    except requests.exceptions.RequestException as e:
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_response = e.response.json()
                if isinstance(error_response, str):
                    try:
                        return json.loads(error_response)
                    except json.JSONDecodeError:
                        return {"detail": error_response}
                return error_response
            except ValueError:
                return {"detail": str(e)}
        return {"detail": str(e)}

def end_game(room_code, scores):
    """End the game"""
    scores = {str(player_id): score for player_id, score in scores.items()}
    response = requests.post(f"{BASE_URL}/end-game/", json={
        "room_code": room_code,
        "scores": scores
    })
    return response.json()

def validate_game_state(state):
    """Validate that a game state response is properly formatted"""
    if not isinstance(state, dict):
        print(f"Invalid game state type: {type(state)}")
        return False
        
    if "detail" in state:
        print(f"Error in game state: {state['detail']}")
        return False
        
    # For get_state actions, we expect certain fields
    if 'players' in state:
        return True
        
    print(f"Missing required fields. Available fields: {list(state.keys())}")
    return False

def handle_game_action(room_code, player_id, action_type, action_data=None):
    """Handle a game action with proper validation"""
    try:
        print(f"\nPerforming {action_type} action for player {player_id}...")
        # Ensure player_id is a valid integer
        try:
            player_id_int = int(player_id)
            result = game_action(room_code, player_id_int, action_type, action_data)
        except ValueError:
            print(f"Invalid player ID format: {player_id}")
            return None
        
        print(f"Raw response: {result}")  # Debug print
        
        if not isinstance(result, dict):
            print(f"Unexpected response type: {type(result)}")
            return None

        if 'detail' in result:
            # Try to parse detail as JSON if it's a string
            if isinstance(result['detail'], str):
                try:
                    parsed = json.loads(result['detail'])
                    if isinstance(parsed, dict):
                        result = parsed
                    else:
                        print(f"Error in response: {result['detail']}")
                        return None
                except json.JSONDecodeError:
                    print(f"Error in response: {result['detail']}")
                    return None
            else:
                print(f"Error in response: {result['detail']}")
                return None
            
        # For get_state actions, we expect certain fields
        if action_type == "get_state":
            if isinstance(result, dict):
                # Try to parse any string fields that might be JSON
                for key in ['game_data', 'players', 'state', 'game_state']:
                    if key in result and isinstance(result[key], str):
                        try:
                            parsed = json.loads(result[key])
                            if isinstance(parsed, dict):
                                # For state and game_state, merge into result
                                if key in ['state', 'game_state']:
                                    result.update(parsed)
                                    del result[key]
                                else:
                                    result[key] = parsed
                        except json.JSONDecodeError:
                            pass
                
                # Check for valid state
                if any(key in result for key in ['players', 'game_data', 'current_player']):
                    print(f"Action {action_type} completed successfully")
                    # If game_data exists, merge it into the main result
                    if 'game_data' in result:
                        if isinstance(result['game_data'], dict):
                            result.update(result['game_data'])
                            del result['game_data']
                    return result
        else:
            # For other actions, any valid response without error is success
            print(f"Action {action_type} completed successfully")
            return result
            
        print(f"Invalid game state format. Available fields: {list(result.keys())}")
        return None
        
    except Exception as e:
        print(f"Error performing {action_type}: {str(e)}")
        return None

def test_game_setup(players, game_type):
    """Common game setup for all card games"""
    print(f"\n=== Testing {game_type.title()} Game ===")
    
    # Create and setup room
    room = create_room(int(players[0]["id"]))
    if not room or "room_code" not in room:
        print(f"Error creating room: {room}")
        return None
    room_code = room["room_code"]
    
    # Test same username in different rooms
    test_username = "DuplicateUser"
    # Create first room with the username
    room1 = create_room(int(players[0]["id"]))
    if room1 and "room_code" in room1:
        join_result1 = join_room(room1["room_code"], test_username)
        if "detail" in join_result1:
            print(f"Error testing duplicate username in different rooms: {join_result1['detail']}")
            return None
        print("Successfully joined first room with test username")
        
        # Try same username in second room
        room2 = create_room(int(players[1]["id"]))
        if room2 and "room_code" in room2:
            join_result2 = join_room(room2["room_code"], test_username)
            if "detail" in join_result2:
                print(f"Error testing duplicate username in different rooms: {join_result2['detail']}")
                return None
            print("Successfully used same username in different room")
    
    # Test duplicate username in same room
    duplicate_join = join_room(room_code, players[0]["username"])
    if "detail" not in duplicate_join:
        print("Error: Duplicate username in same room was allowed")
        return None
    print("Successfully prevented duplicate username in same room")
    
    # Host joins their own room first
    host_join = join_room(room_code, players[0]["username"])
    if "detail" in host_join:
        print(f"Error host joining room ({players[0]['username']}): {host_join['detail']}")
        return None
    if "player_id" in host_join:
        players[0]["id"] = str(host_join["player_id"])
    print(f"Host {players[0]['username']} joined their room")
    
    # Other players join
    for player in players[1:]:
        join_result = join_room(room_code, player["username"])
        if "detail" in join_result:
            print(f"Error joining room ({player['username']}): {join_result['detail']}")
            return None
        if "player_id" in join_result:
            player["id"] = str(join_result["player_id"])
        print(f"Player {player['username']} joined")
        # Give a small delay to ensure notifications are processed
        time.sleep(0.1)

    # Start game
    game = start_game(room_code, game_type)
    if "detail" in game:
        print(f"Error starting game: {game['detail']}")
        return None
    print("Game started")
    
    # Wait for game state to initialize
    time.sleep(1)
    
    return room_code

def test_snap_game(players):
    """Test Snap game"""
    success = True
    errors = []
    
    room_code = test_game_setup(players, "snap")
    if not room_code:
        errors.append("Failed to setup game room")
        return False, errors
        
    # Verify initial card dealing
    for player in players:
        state = handle_game_action(room_code, int(player['id']), "get_state")
        if not state or 'players' not in state:
            success = False
            errors.append(f"Failed to get initial state for {player['username']}")
            continue
            
        player_state = state['players'].get(str(player['id']))
        if not player_state:
            success = False
            errors.append(f"Player {player['username']} not found in game state")
            continue
        
        hand_size = player_state.get('hand_size', 0)
        if hand_size < 4:
            success = False
            errors.append(f"Player {player['username']} has insufficient cards: {hand_size}")
        else:
            print(f"Player {player['username']} has {hand_size} cards")
    
    # Test basic game flow
    for round_num in range(2):  # Play 2 rounds
        # Get current game state
        state = handle_game_action(room_code, int(players[0]['id']), "get_state")
        if not state or not isinstance(state, dict):
            success = False
            errors.append(f"Failed to get valid state in round {round_num + 1}")
            continue
            
        current_player_id = state.get('current_player')
        if not current_player_id:
            success = False
            errors.append(f"No current player in round {round_num + 1}")
            continue
            
        # Find current player
        try:
            current_player = next(p for p in players if str(p['id']) == current_player_id)
            print(f"Current player: {current_player['username']}")
            
            # Play a card
            result = handle_game_action(room_code, int(current_player['id']), "play_card")
            if not result or 'error' in str(result).lower() or 'detail' in result:
                success = False
                error_msg = result.get('detail', str(result)) if result else "Failed to play card"
                errors.append(f"Error playing card: {error_msg}")
            else:
                print(f"{current_player['username']} played a card")
                
                # Get updated state to check center pile
                state = handle_game_action(room_code, int(current_player['id']), "get_state")
                if state and state.get('center_pile_count', 0) >= 2:
                    # Try to snap if there are at least 2 cards
                    snap_result = handle_game_action(room_code, int(current_player['id']), "snap")
                    if snap_result and not ('error' in str(snap_result).lower() or 'detail' in snap_result):
                        print(f"{current_player['username']} attempted to snap")
                
            time.sleep(0.5)  # Wait before next action
            
        except StopIteration:
            success = False
            errors.append(f"Failed to find current player in round {round_num + 1}")
            continue
    
    # End game
    scores = {str(player['id']): 0 for player in players}
    end_result = end_game(room_code, scores)
    if "detail" in end_result:
        success = False
        errors.append(f"Error ending game: {end_result['detail']}")
        
    return success, errors

def test_go_fish_game(players):
    """Test Go Fish game"""
    success = True
    errors = []
    
    room_code = test_game_setup(players, "go_fish")
    if not room_code:
        errors.append("Failed to setup game room")
        return False, errors
        
    # Test basic game flow
    for round_num in range(2):  # Play 2 rounds
        state = handle_game_action(room_code, int(players[0]['id']), "get_state")
        if not state:
            success = False
            errors.append(f"Failed to get game state in round {round_num + 1}")
            continue
            
        if 'error' in str(state).lower() or 'detail' in state:
            success = False
            error_msg = state.get('detail', str(state))
            errors.append(f"Error in game state: {error_msg}")
            continue
            
        current_player_id = state.get('current_player')
        if not current_player_id:
            success = False
            errors.append(f"No current player in round {round_num + 1}")
            continue
            
        try:
            current_player = next(p for p in players if str(p['id']) == str(current_player_id))
            target_player = next(p for p in players if str(p['id']) != str(current_player_id))
            
            # Ask for a card
            result = handle_game_action(room_code, int(current_player_id), "ask_for_cards", {
                "target_player_id": target_player['id'],
                "rank": "A"  # Just try asking for Aces
            })
            
            if not result or 'error' in str(result).lower() or 'detail' in result:
                success = False
                error_msg = result.get('detail', str(result)) if result else "Failed to ask for cards"
                errors.append(f"Error asking for cards: {error_msg}")
            else:
                print(f"{current_player['username']} asked {target_player['username']} for Aces")
                
            time.sleep(0.5)
            
        except StopIteration:
            success = False
            errors.append(f"Failed to find current or target player in round {round_num + 1}")
    
    # End game
    scores = {player['id']: 0 for player in players}
    end_result = end_game(room_code, scores)
    if "detail" in end_result:
        success = False
        errors.append(f"Error ending game: {end_result['detail']}")
        
    return success, errors

def test_rummy_game(players):
    """Test Rummy game"""
    success = True
    errors = []
    
    room_code = test_game_setup(players, "rummy")
    if not room_code:
        errors.append("Failed to setup game room")
        return False, errors
        
    # Test basic game flow
    for round_num in range(2):  # Play 2 rounds
        state = handle_game_action(room_code, int(players[0]['id']), "get_state")
        if not state:
            success = False
            errors.append(f"Failed to get game state in round {round_num + 1}")
            continue
            
        if 'error' in str(state).lower() or 'detail' in state:
            success = False
            error_msg = state.get('detail', str(state))
            errors.append(f"Error in game state: {error_msg}")
            continue
            
        current_player_id = state.get('current_player')
        if not current_player_id:
            success = False
            errors.append(f"No current player in round {round_num + 1}")
            continue
            
        try:
            current_player = next(p for p in players if str(p['id']) == str(current_player_id))
            
            # Draw a card
            result = handle_game_action(room_code, int(current_player_id), "draw_card")
            if not result or 'error' in str(result).lower() or 'detail' in result:
                success = False
                error_msg = result.get('detail', str(result)) if result else "Failed to draw card"
                errors.append(f"Error drawing card: {error_msg}")
            else:
                print(f"{current_player['username']} drew a card")
                
            # Discard a card
            result = handle_game_action(room_code, int(current_player_id), "discard_card", {"card_index": 0})
            if not result or 'error' in str(result).lower() or 'detail' in result:
                success = False
                error_msg = result.get('detail', str(result)) if result else "Failed to discard card"
                errors.append(f"Error discarding card: {error_msg}")
            else:
                print(f"{current_player['username']} discarded a card")
                
            time.sleep(0.5)
            
        except StopIteration:
            success = False
            errors.append(f"Failed to find current player in round {round_num + 1}")
    
    # End game
    scores = {player['id']: 0 for player in players}
    end_result = end_game(room_code, scores)
    if "detail" in end_result:
        success = False
        errors.append(f"Error ending game: {end_result['detail']}")
        
    return success, errors

def test_kings_corner_game(players):
    """Test Kings Corner game"""
    success = True
    errors = []
    
    room_code = test_game_setup(players, "kings_corner")
    if not room_code:
        errors.append("Failed to setup game room")
        return False, errors
        
    # Test basic game flow
    for round_num in range(2):  # Play 2 rounds
        state = handle_game_action(room_code, int(players[0]['id']), "get_state")
        if not state:
            success = False
            errors.append(f"Failed to get game state in round {round_num + 1}")
            continue
            
        if 'error' in str(state).lower() or 'detail' in state:
            success = False
            error_msg = state.get('detail', str(state))
            errors.append(f"Error in game state: {error_msg}")
            continue
            
        current_player_id = state.get('current_player')
        if not current_player_id:
            success = False
            errors.append(f"No current player in round {round_num + 1}")
            continue
            
        try:
            current_player = next(p for p in players if str(p['id']) == str(current_player_id))
            
            # Draw a card
            result = handle_game_action(room_code, int(current_player_id), "draw_card")
            if not result or 'error' in str(result).lower() or 'detail' in result:
                success = False
                error_msg = result.get('detail', str(result)) if result else "Failed to draw card"
                errors.append(f"Error drawing card: {error_msg}")
            else:
                print(f"{current_player['username']} drew a card")
                
            time.sleep(0.5)
            
        except StopIteration:
            success = False
            errors.append(f"Failed to find current player in round {round_num + 1}")
    
    # End game
    scores = {player['id']: 0 for player in players}
    end_result = end_game(room_code, scores)
    if "detail" in end_result:
        success = False
        errors.append(f"Error ending game: {end_result['detail']}")
        
    return success, errors

def test_bluff_game(players):
    """Test Bluff game"""
    success = True
    errors = []
    
    room_code = test_game_setup(players, "bluff")
    if not room_code:
        errors.append("Failed to setup game room")
        return False, errors
        
    # Test basic game flow
    for round_num in range(2):  # Play 2 rounds
        state = handle_game_action(room_code, int(players[0]['id']), "get_state")
        if not state:
            success = False
            errors.append(f"Failed to get game state in round {round_num + 1}")
            continue
            
        if 'error' in str(state).lower() or 'detail' in state:
            success = False
            error_msg = state.get('detail', str(state))
            errors.append(f"Error in game state: {error_msg}")
            continue
            
        current_player_id = state.get('current_player')
        if not current_player_id:
            success = False
            errors.append(f"No current player in round {round_num + 1}")
            continue
            
        try:
            current_player = next(p for p in players if str(p['id']) == str(current_player_id))
            
            # Play cards
            result = handle_game_action(room_code, int(current_player_id), "play_cards", {
                "card_indices": [0],  # Try playing first card
                "claimed_rank": "A"
            })
            if not result or 'error' in str(result).lower() or 'detail' in result:
                success = False
                error_msg = result.get('detail', str(result)) if result else "Failed to play cards"
                errors.append(f"Error playing cards: {error_msg}")
            else:
                print(f"{current_player['username']} played cards claiming Aces")
                
            time.sleep(0.5)
            
        except StopIteration:
            success = False
            errors.append(f"Failed to find current player in round {round_num + 1}")
    
    # End game
    scores = {player['id']: 0 for player in players}
    end_result = end_game(room_code, scores)
    if "detail" in end_result:
        success = False
        errors.append(f"Error ending game: {end_result['detail']}")
        
    return success, errors

def test_scat_game(players):
    """Test Scat game"""
    success = True
    errors = []
    
    room_code = test_game_setup(players, "scat")
    if not room_code:
        errors.append("Failed to setup game room")
        return False, errors
        
    # Test basic game flow
    for round_num in range(2):  # Play 2 rounds
        state = handle_game_action(room_code, int(players[0]['id']), "get_state")
        if not state:
            success = False
            errors.append(f"Failed to get game state in round {round_num + 1}")
            continue
            
        if 'error' in str(state).lower() or 'detail' in state:
            success = False
            error_msg = state.get('detail', str(state))
            errors.append(f"Error in game state: {error_msg}")
            continue
            
        current_player_id = state.get('current_player')
        if not current_player_id:
            success = False
            errors.append(f"No current player in round {round_num + 1}")
            continue
            
        try:
            current_player = next(p for p in players if str(p['id']) == str(current_player_id))
            target_player = next(p for p in players if p['id'] != current_player_id)
            
            # Only proceed if it's our turn
            if current_player_id == str(current_player['id']):
                # Draw a card
                result = handle_game_action(room_code, int(current_player_id), "draw_card")
                if not result or 'error' in str(result).lower() or 'detail' in result:
                    success = False
                    error_msg = result.get('detail', str(result)) if result else "Failed to draw card"
                    errors.append(f"Error drawing card: {error_msg}")
                else:
                    print(f"{current_player['username']} drew a card")
                    
                    # Discard a card to get back to 3 cards
                    result = handle_game_action(room_code, int(current_player_id), "discard_card", {"card_index": 0})
                    if not result or 'error' in str(result).lower() or 'detail' in result:
                        success = False
                        error_msg = result.get('detail', str(result)) if result else "Failed to discard card"
                        errors.append(f"Error discarding card: {error_msg}")
                    else:
                        print(f"{current_player['username']} discarded a card")
                        
                        # Get state again to verify it's still our turn
                        state = handle_game_action(room_code, int(current_player_id), "get_state")
                        if state and state.get('current_player') == str(current_player['id']):
                            # Now try to knock with 3 cards
                            result = handle_game_action(room_code, int(current_player_id), "knock")
                            if not result or 'error' in str(result).lower() or 'detail' in result:
                                success = False
                                error_msg = result.get('detail', str(result)) if result else "Failed to knock"
                                errors.append(f"Error knocking: {error_msg}")
                            else:
                                print(f"{current_player['username']} knocked")
                
            time.sleep(0.5)
            
        except StopIteration:
            success = False
            errors.append(f"Failed to find current or target player in round {round_num + 1}")
    
    # End game
    scores = {player['id']: 0 for player in players}
    end_result = end_game(room_code, scores)
    if "detail" in end_result:
        success = False
        errors.append(f"Error ending game: {end_result['detail']}")
        
    return success, errors

def test_spoons_game(players):
    """Test Spoons game"""
    success = True
    errors = []
    
    # Setup game
    room_code = test_game_setup(players, "spoons")
    if not room_code:
        errors.append("Failed to setup game room")
        return False, errors

    # Test basic game flow
    for round_num in range(2):  # Play 2 rounds
        # Get initial state
        state = handle_game_action(room_code, int(players[0]['id']), "get_state")
        if not state:
            success = False
            errors.append(f"Failed to get game state in round {round_num + 1}")
            continue

        # Validate state
        if not isinstance(state, dict):
            success = False
            errors.append(f"Invalid game state format in round {round_num + 1}")
            continue
            
        if 'error' in state or 'detail' in state:
            success = False
            error_msg = state.get('detail', str(state))
            errors.append(f"Error in game state: {error_msg}")
            continue
            
        # Get current player
        current_player_id = state.get('current_player')
        if not current_player_id:
            success = False
            errors.append(f"No current player in round {round_num + 1}")
            continue
            
        try:
            # Find current player
            current_player = next(p for p in players if str(p['id']) == str(current_player_id))
            
            # Play a card
            action_data = {"card_index": 0}
            result = handle_game_action(room_code, int(current_player_id), "play_turn", action_data)
            
            if not isinstance(result, dict):
                success = False
                errors.append(f"Invalid play turn result format in round {round_num + 1}")
            elif 'error' in result or 'detail' in result:
                success = False
                error_msg = result.get('detail', str(result))
                errors.append(f"Error playing turn: {error_msg}")
            else:
                print(f"{current_player['username']} played a turn")
                
            time.sleep(0.5)  # Wait for state update
            
        except StopIteration:
            success = False
            errors.append(f"Failed to find current player in round {round_num + 1}")
            continue
        except Exception as e:
            success = False
            errors.append(f"Unexpected error in round {round_num + 1}: {str(e)}")
            continue
    
    # End game with scores
    try:
        scores = {str(player['id']): 0 for player in players}
        end_result = end_game(room_code, scores)
        
        if not isinstance(end_result, dict):
            success = False
            errors.append("Invalid end game result format")
        elif 'error' in end_result or 'detail' in end_result:
            success = False
            errors.append(f"Error ending game: {end_result.get('detail', str(end_result))}")
    except Exception as e:
        success = False
        errors.append(f"Error ending game: {str(e)}")
    
    return success, errors

def test_spades_game(players):
    """Test Spades game"""
    success = True
    errors = []
    
    room_code = test_game_setup(players, "spades")
    if not room_code:
        errors.append("Failed to setup game room")
        return False, errors
        
    # Test basic game flow
    for round_num in range(2):  # Play 2 rounds
        state = handle_game_action(room_code, int(players[0]['id']), "get_state")
        if not state:
            success = False
            errors.append(f"Failed to get game state in round {round_num + 1}")
            continue
            
        if 'error' in str(state).lower() or 'detail' in state:
            success = False
            error_msg = state.get('detail', str(state))
            errors.append(f"Error in game state: {error_msg}")
            continue
            
        current_player_id = state.get('current_player')
        if not current_player_id:
            success = False
            errors.append(f"No current player in round {round_num + 1}")
            continue
            
        try:
            current_player = next(p for p in players if str(p['id']) == str(current_player_id))
            
            # Play a card
            result = handle_game_action(room_code, int(current_player_id), "play_card", {"card_index": 0})
            if not result or 'error' in str(result).lower() or 'detail' in result:
                success = False
                error_msg = result.get('detail', str(result)) if result else "Failed to play card"
                errors.append(f"Error playing card: {error_msg}")
            else:
                print(f"{current_player['username']} played a card")
                
            time.sleep(0.5)
            
        except StopIteration:
            success = False
            errors.append(f"Failed to find current player in round {round_num + 1}")
    
    # End game
    scores = {player['id']: 0 for player in players}
    end_result = end_game(room_code, scores)
    if "detail" in end_result:
        success = False
        errors.append(f"Error ending game: {end_result['detail']}")
        
    return success, errors

def reset_database():
    """Reset the database before running tests."""
    response = requests.post(f"{BASE_URL}/reset-database")
    if response.status_code != 200:
        print(f"Failed to reset database: {response}")
        print(f"Error response: {response.json()}")
    return response.json()

def test_username_cleanup():
    """Test that usernames become available after rooms are cleared"""
    print("\n=== Testing Username Cleanup ===")
    
    # Create a test player
    test_username = "CleanupTest"
    player = create_player(test_username)
    if "detail" in player:
        print(f"Error creating player: {player['detail']}")
        return False, ["Failed to create test player"]
    
    # Create and join a room
    room = create_room(int(player["id"]))
    if not room or "room_code" not in room:
        print(f"Error creating room: {room}")
        return False, ["Failed to create room"]
    
    room_code = room["room_code"]
    join_result = join_room(room_code, test_username)
    if "detail" in join_result:
        print(f"Error joining room: {join_result['detail']}")
        return False, ["Failed to join room"]
    
    print("Successfully created and joined room with test username")
    
    # Wait for cleanup interval
    print("Waiting for room cleanup...")
    time.sleep(35)  # Wait longer than the empty room cleanup time (30 minutes in production, shortened for testing)
    
    # Try to use the same username in a new room
    new_player = create_player(test_username)
    if "detail" in new_player:
        print(f"Error: Username not available after cleanup: {new_player['detail']}")
        return False, ["Username not available after cleanup"]
    
    print("Successfully reused username after room cleanup")
    return True, []

def main():
    """Main test function"""
    print("\n=== Starting Card Game Tests ===\n")
    
    # Reset database before starting tests
    reset_database()
    
    # Test username cleanup first
    cleanup_success, cleanup_errors = test_username_cleanup()
    if not cleanup_success:
        print("\nUsername cleanup test failed:")
        for error in cleanup_errors:
            print(f"  - {error}")
    else:
        print("\nUsername cleanup test passed")
    
    # Test with different numbers of players
    test_cases = [
        (2, ["Player1", "Player2"]),
        (3, ["Player1", "Player2", "Player3"]),
        (4, ["Player1", "Player2", "Player3", "Player4"])
    ]
    
    # Set up logging to both console and file
    import sys
    from io import StringIO
    
    # Create a StringIO object to capture output
    output_capture = StringIO()
    
    # Create a custom stdout that writes to both console and StringIO
    class MultiWriter:
        def __init__(self, *writers):
            self.writers = writers
            
        def write(self, text):
            for writer in self.writers:
                writer.write(text)
                
        def flush(self):
            for writer in self.writers:
                writer.flush()
    
    # Replace sys.stdout with our custom writer
    sys.stdout = MultiWriter(sys.stdout, output_capture)
    
    try:
        # Check API health first
        print("\nChecking API health...")
        health_response = requests.get(f"{BASE_URL}/health")
        health_data = health_response.json()
        print(f"API Health: {health_data}")

        if health_response.status_code != 200:
            print("API is not healthy, aborting test")
            return

        # Create test players
        print("\nCreating players...")
        players = []
        player_names = ["Alice", "Bob", "Charlie", "David"]
        for name in player_names:
            username = get_unique_username(name)
            player = create_player(username)
            if "detail" in player:
                print(f"Error creating player {name}: {player['detail']}")
                return
            
            # Ensure we have a valid player ID
            if "id" not in player:
                print(f"Error: No player ID returned for {username}")
                return
                
            players.append({
                "id": str(player["id"]),  # Ensure ID is stored as string
                "username": username
            })
            print(f"Created player: {username} (ID: {player['id']})")

        # Test all card games
        games_to_test = [
            ("Snap", test_snap_game),
            ("Go Fish", test_go_fish_game),
            ("Rummy", test_rummy_game),
            ("Kings Corner", test_kings_corner_game),
            ("Bluff", test_bluff_game),
            ("Scat", test_scat_game),
            ("Spades", test_spades_game),
            ("Spoons", test_spoons_game)
        ]

        test_results = {}
        for game_name, test_func in games_to_test:
            print(f"\nTesting {game_name}...")
            try:
                success, errors = test_func(players.copy())  # Pass a copy to avoid modifications
                test_results[game_name] = {
                    'success': success,
                    'errors': errors
                }
                print(f"{game_name} test {'succeeded' if success else 'failed'}")
            except Exception as e:
                test_results[game_name] = {
                    'success': False,
                    'errors': [str(e)]
                }
                print(f"Error testing {game_name}: {str(e)}")
            time.sleep(1)  # Brief pause between games

        # Print test summary
        print("\n=== Test Summary ===")
        print("\nResults by game:")
        for game_name, result in test_results.items():
            status = "✅ PASSED" if result['success'] else "❌ FAILED"
            print(f"{game_name}: {status}")
            if not result['success'] and result['errors']:
                print("  Errors:")
                for error in result['errors']:
                    print(f"  - {error}")

        # Overall summary
        total_tests = len(test_results)
        passed_tests = sum(1 for result in test_results.values() if result['success'])
        print(f"\nOverall Results:")
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {total_tests - passed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        # Write complete test output to file
        with open("test_results.txt", "w") as f:
            # Write the full test output first, Dont change this, it's the full output of the tests
            f.write("=== Complete Test Output ===\n\n")
            f.write(output_capture.getvalue())
            
            # Write the test summary
            f.write("\n\n=== Test Summary ===\n")
            f.write("\nResults by game:\n")
            for game_name, result in test_results.items():
                status = "✅ PASSED" if result['success'] else "❌ FAILED"
                f.write(f"{game_name}: {status}\n")
                if not result['success'] and result['errors']:
                    f.write("  Errors:\n")
                    for error in result['errors']:
                        f.write(f"  - {error}\n")
            f.write(f"\nOverall Results:\n")
            f.write(f"Total Tests: {total_tests}\n")
            f.write(f"Passed: {passed_tests}\n")
            f.write(f"Failed: {total_tests - passed_tests}\n")
            f.write(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%\n")

        # Restore original stdout
        sys.stdout = sys.__stdout__
        
    except requests.exceptions.RequestException as e:
        # Make sure to restore stdout even if an error occurs
        sys.stdout = sys.__stdout__
        print(f"Error occurred: {e}")
        if hasattr(e, 'response') and e.response is not None:
            try:
                error_data = json.loads(e.response.text)
                print(f"Response: {error_data}")
            except json.JSONDecodeError:
                print(f"Could not parse error response: {e.response.text}")

if __name__ == "__main__":
    main()

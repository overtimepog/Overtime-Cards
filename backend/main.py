from typing import Optional, Dict
import logging
import sentry_sdk
import json
import asyncio
import uvloop
import zlib
import sqlite3
from base64 import b64encode, b64decode
from functools import wraps
from sentry_sdk.integrations.fastapi import FastApiIntegration
from cachetools import TTLCache
from datetime import datetime, timedelta
import random
import string
from fastapi import FastAPI, WebSocket, HTTPException, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from config import get_settings
from contextlib import contextmanager
from starlette.websockets import WebSocketState
from games.cards import snap, go_fish, bluff, scat, rummy, kings_corner, spades, spoons
from games.cards.models import GameState, Card, Rank, Suit

# Enable uvloop for better async performance
asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())

api_url = "https://overtime-cards-api.onrender.com"

# Load settings
settings = get_settings()

# Configure Sentry
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        integrations=[FastApiIntegration()],
    )

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configure in-memory caches with optimized sizes and TTLs
request_cache = TTLCache(maxsize=10000, ttl=60)  # Cache for rate limiting
query_cache = TTLCache(maxsize=5000, ttl=300)    # Cache for database queries
player_cache = TTLCache(maxsize=1000, ttl=600)   # Cache for player data
room_cache = TTLCache(maxsize=500, ttl=300)      # Cache for room data

def generate_cache_key(*args, **kwargs):
    """Generate a consistent cache key from arguments"""
    try:
        key_parts = [str(arg) for arg in args]
        key_parts.extend(f"{k}:{v}" for k, v in sorted(kwargs.items()))
        return ":".join(key_parts)
    except Exception as e:
        logger.error(f"Error generating cache key: {e}")
        return ""

def compress_payload(data: dict) -> str:
    """Compress JSON payload using zlib"""
    try:
        json_str = json.dumps(data)
        compressed = zlib.compress(json_str.encode('utf-8'))
        return b64encode(compressed).decode('utf-8')
    except Exception as e:
        logger.error(f"Error compressing payload: {e}")
        return ""

def decompress_payload(compressed_data: str) -> dict:
    """Decompress zlib compressed JSON payload"""
    try:
        compressed = b64decode(compressed_data)
        decompressed = zlib.decompress(compressed)
        return json.loads(decompressed.decode('utf-8'))
    except Exception as e:
        logger.error(f"Error decompressing payload: {e}")
        return {}

def cache_player(player_id: int, player_data: dict):
    """Cache player data with TTL"""
    try:
        player_cache[str(player_id)] = player_data
    except Exception as e:
        logger.error(f"Error caching player data: {e}")

def get_cached_player(player_id: int) -> Optional[dict]:
    """Get player data from cache"""
    try:
        return player_cache.get(str(player_id))
    except Exception as e:
        logger.error(f"Error getting cached player: {e}")
        return None

def cache_room(room_code: str, room_data: dict):
    """Cache room data with TTL"""
    try:
        room_cache[room_code] = room_data
    except Exception as e:
        logger.error(f"Error caching room data: {e}")

def get_cached_room(room_code: str) -> Optional[dict]:
    """Get room data from cache"""
    try:
        return room_cache.get(room_code)
    except Exception as e:
        logger.error(f"Error getting cached room: {e}")
        return None

# Configure rate limiter with in-memory backend
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute", "5/second"],
    storage_uri="memory://"
)

# Cache decorator for database queries using in-memory cache
def cache_query(ttl: int = 300):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"
            if cache_key in query_cache:
                return query_cache[cache_key]
            result = await func(*args, **kwargs)
            query_cache[cache_key] = result
            return result
        return wrapper
    return decorator

# Database connection management
@contextmanager
def get_db():
    conn = sqlite3.connect(settings.DATABASE_URL)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# Initialize database schema
def init_db():
    with get_db() as conn:
        try:
            # Enable foreign keys
            conn.execute("PRAGMA foreign_keys = ON")
            
            # Read schema
            with open('schema.sql', 'r') as f:
                schema = f.read()
            
            # Execute schema in a transaction
            conn.executescript(schema)
            
            # Verify tables were created
            tables = ['players', 'rooms', 'game_state']
            for table in tables:
                cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
                if cursor.fetchone() is None:
                    raise Exception(f"Failed to create table: {table}")
            
            conn.commit()
            logger.info("Database initialized successfully")
            
        except Exception as e:
            logger.error(f"Error initializing database: {e}")
            conn.rollback()
            raise

# Pydantic models for request/response
class PlayerCreate(BaseModel):
    username: str

class RoomCreate(BaseModel):
    player_id: int

class GameStart(BaseModel):
    room_code: str
    game_type: str

class GameAction(BaseModel):
    room_code: str
    player_id: int
    action_type: str
    action_data: dict

class GameEnd(BaseModel):
    room_code: str
    scores: dict

# Game types and their configurations
GAME_TYPES = {
    "snap": {
        "min_players": 2,
        "max_players": 4,
        "description": "Match consecutive cards and be the first to call Snap!"
    },
    "go_fish": {
        "min_players": 2,
        "max_players": 6,
        "description": "Collect sets of four cards by asking other players"
    },
    "bluff": {
        "min_players": 2,
        "max_players": 6,
        "description": "Get rid of all your cards by playing them face down, but beware of challenges!"
    },
    "scat": {
        "min_players": 2,
        "max_players": 6,
        "description": "Get closest to 31 in a single suit and knock to end the round"
    },
    "rummy": {
        "min_players": 2,
        "max_players": 6,
        "description": "Form sets and runs to get rid of all your cards"
    },
    "kings_corner": {
        "min_players": 2,
        "max_players": 4,
        "description": "Play cards in descending order and alternating colors, using Kings to start new piles"
    },
    "spades": {
        "min_players": 4,
        "max_players": 4,
        "description": "Bid and take tricks, with Spades always being trump"
    },
    "spoons": {
        "min_players": 3,
        "max_players": 8,
        "description": "Collect four of a kind and grab a spoon before others!"
    }
}

# Helper function to generate room code
def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

app = FastAPI(
    title=settings.PROJECT_NAME,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json"
)

# Root route redirects to docs
@app.get("/")
async def root():
    return {"message": "Welcome to Overtime Cards API", "docs_url": "/docs"}

# Initialize scheduler
scheduler = AsyncIOScheduler(timezone="UTC")

# Function to cleanup inactive rooms
async def cleanup_inactive_rooms():
    with get_db() as conn:
        try:
            # More aggressive cleanup for empty rooms
            empty_room_cutoff = (datetime.utcnow() - timedelta(minutes=30)).isoformat()
            inactive_room_cutoff = (datetime.utcnow() - timedelta(hours=2)).isoformat()
            
            # Get inactive room codes
            cursor = conn.execute(
                """
                SELECT code FROM rooms 
                WHERE (
                    last_activity < ? 
                    OR (
                        last_activity < ? 
                        AND NOT EXISTS (
                            SELECT 1 FROM players 
                            WHERE players.room_code = rooms.code
                            AND players.last_activity > ?
                        )
                    )
                )
                """,
                (inactive_room_cutoff, empty_room_cutoff, empty_room_cutoff)
            )
            inactive_rooms = [row['code'] for row in cursor.fetchall()]
            
            if inactive_rooms:
                # Clean up chat history for rooms being deleted
                conn.execute(
                    "UPDATE rooms SET chat_history = '[]' WHERE code IN ({})"
                    .format(','.join('?' * len(inactive_rooms))),
                    inactive_rooms
                )
                
                # Remove room_code from players in these rooms
                conn.execute(
                    "UPDATE players SET room_code = NULL WHERE room_code IN ({})".format(
                        ','.join('?' * len(inactive_rooms))
                    ),
                    inactive_rooms
                )
                
                # Delete game states
                conn.execute(
                    "DELETE FROM game_state WHERE room_code IN ({})".format(
                        ','.join('?' * len(inactive_rooms))
                    ),
                    inactive_rooms
                )
                
                # Delete rooms
                conn.execute(
                    "DELETE FROM rooms WHERE code IN ({})".format(
                        ','.join('?' * len(inactive_rooms))
                    ),
                    inactive_rooms
                )
                
                conn.commit()
                logger.info(f"Cleaned up {len(inactive_rooms)} inactive rooms")
                
        except Exception as e:
            conn.rollback()
            logger.error(f"Error cleaning up inactive rooms: {e}")

#function to cleanup inactive players
async def cleanup_inactive_players():
    with get_db() as conn:
        try:
            # Different cutoffs for players in rooms vs not in rooms
            in_room_cutoff = (datetime.utcnow() - timedelta(minutes=2)).isoformat()
            no_room_cutoff = (datetime.utcnow() - timedelta(minutes=1)).isoformat()
            
            # Remove room_code from inactive players
            conn.execute(
                """
                UPDATE players 
                SET room_code = NULL
                WHERE (
                    (room_code IS NOT NULL AND last_activity < ?) 
                    OR (room_code IS NULL AND last_activity < ?)
                )
                """,
                (in_room_cutoff, no_room_cutoff)
            )
            
            # Then delete players that have been inactive for even longer
            delete_cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
            cursor = conn.execute(
                """
                SELECT id FROM players 
                WHERE last_activity < ?
                """,
                (delete_cutoff,)
            )
            inactive_players = [row['id'] for row in cursor.fetchall()]

            if inactive_players:
                # Delete the inactive players
                conn.execute(
                    "DELETE FROM players WHERE id IN ({})".format(
                        ','.join('?' * len(inactive_players))
                    ),
                    inactive_players
                )
                
                conn.commit()
                logger.info(f"Cleaned up {len(inactive_players)} inactive players and their usernames")
                
        except Exception as e:
            conn.rollback()
            logger.error(f"Error cleaning up inactive players: {e}")

# Start the scheduler when the app starts
@app.on_event("startup")
async def startup_event():
    try:
        # Initialize database
        init_db()
        
        # Start scheduler
        scheduler.add_job(cleanup_inactive_rooms, 'interval', minutes=15)
        scheduler.add_job(cleanup_inactive_players, 'interval', minutes=15)
        scheduler.start()
        logger.info("Scheduler started successfully")
        
        # Pre-warm caches
        with get_db() as conn:
            try:
                # Pre-warm caches with active rooms and players
                active_cutoff = (datetime.utcnow() - timedelta(hours=1)).isoformat()
                cursor = conn.execute(
                    "SELECT * FROM rooms WHERE last_activity > ?",
                    (active_cutoff,)
                )
                active_rooms = cursor.fetchall()
                
                for room in active_rooms:
                    room_data = {
                        "code": room['code'],
                        "host_id": room['host_id'],
                        "game_state": room['game_state'],
                        "last_activity": room['last_activity']
                    }
                    cache_room(room['code'], room_data)
                    
                    # Cache players in active rooms
                    cursor = conn.execute(
                        "SELECT * FROM players WHERE room_code = ?",
                        (room['code'],)
                    )
                    players = cursor.fetchall()
                    
                    for player in players:
                        player_data = {
                            "id": player['id'],
                            "username": player['username'],
                            "room_code": player['room_code'],
                            "status": player['status'],
                            "wins": player['wins']
                        }
                        cache_player(player['id'], player_data)
                
                logger.info(f"Pre-warmed cache with {len(active_rooms)} rooms and their players")
                
            except Exception as e:
                logger.error(f"Error during startup initialization: {e}")
                raise
            
    except Exception as e:
        logger.error(f"Error during startup: {e}", exc_info=True)
        raise

# Shutdown the scheduler when the app stops
@app.on_event("shutdown")
async def shutdown_event():
    scheduler.shutdown()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Add rate limiter middleware
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global error handler caught: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

# Health check endpoint
@app.get("/health")
@app.get(f"{settings.API_V1_STR}/health")
async def health_check():
    db_status = "unknown"
    db_error = None
    
    try:
        # Test database connection
        with get_db() as conn:
            cursor = conn.execute("SELECT 1")
            cursor.fetchone()
            db_status = "connected"
    except Exception as e:
        db_status = "error"
        db_error = str(e)
        logger.error(f"Database connection error in health check: {e}")
    finally:
        response = {
            "status": "healthy" if db_status == "connected" else "unhealthy",
            "timestamp": datetime.utcnow(),
            "database": {
                "status": db_status,
                "path": settings.DATABASE_URL
            }
        }
        
        if db_error:
            response["database"]["error"] = db_error
        
        return response

# Optimized WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[int, WebSocket]] = {}
        logger.info("ConnectionManager initialized")

    async def connect(self, websocket: WebSocket, room_code: str, player_id: int):
        await websocket.accept()
        if room_code not in self.active_connections:
            self.active_connections[room_code] = {}
        self.active_connections[room_code][player_id] = websocket
        
        # Get player details from database
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT p.username, p.id = r.host_id as is_host, r.chat_history,
                       (SELECT COUNT(*) FROM players WHERE room_code = r.code AND last_activity > ?) as player_count
                FROM players p
                JOIN rooms r ON r.code = p.room_code
                WHERE p.id = ? AND p.room_code = ?
                """,
                ((datetime.utcnow() - timedelta(minutes=2)).isoformat(), player_id, room_code)
            )
            player = cursor.fetchone()
            
            if player:
                username = player['username']
                is_host = player['is_host']
                host_status = "host" if is_host else "player"
                logger.info(f"{username} ({host_status}, ID: {player_id}) connected to room {room_code}")
                
                # Update player activity
                conn.execute(
                    """
                    UPDATE players 
                    SET last_activity = ? 
                    WHERE id = ? AND room_code = ?
                    """,
                    (datetime.utcnow().isoformat(), player_id, room_code)
                )

                # Add system message about player joining
                join_message = {
                    "type": "player_joined",
                    "data": {
                        "player_id": player_id,
                        "username": username,
                        "is_host": is_host,
                        "is_ready": False
                    },
                    "username": "System",
                    "message": f"{username} joined the room",
                    "isSystem": True,
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                # Update room activity
                conn.execute(
                    """
                    UPDATE rooms 
                    SET last_activity = ? 
                    WHERE code = ?
                    """,
                    (datetime.utcnow().isoformat(), room_code)
                )
                conn.commit()
                
                await self.store_and_broadcast_message(join_message, room_code)
            else:
                logger.error(f"Player {username} (ID: {player_id}) not found in room {room_code}")
                raise Exception("Player not found in room")

    async def disconnect(self, websocket: WebSocket, room_code: str, player_id: int):
        try:
            if room_code in self.active_connections:
                if player_id in self.active_connections[room_code]:
                    try:
                        with get_db() as conn:
                            # Get disconnecting player's details
                            cursor = conn.execute(
                                """
                                SELECT p.username, p.id = r.host_id as is_host
                                FROM players p
                                JOIN rooms r ON r.code = p.room_code
                                WHERE p.id = ? AND p.room_code = ?
                                """,
                                (player_id, room_code)
                            )
                            player = cursor.fetchone()
                            
                            if player:
                                was_host = player['is_host']
                                username = player['username']
                                
                                # Remove from active connections first
                                del self.active_connections[room_code][player_id]
                                if not self.active_connections[room_code]:
                                    del self.active_connections[room_code]
                                
                                host_status = "host" if was_host else "player"
                                logger.info(f"{username} ({host_status}, ID: {player_id}) disconnected from room {room_code}")
                                
                                # Clear room association
                                conn.execute(
                                    """
                                    UPDATE players 
                                    SET room_code = NULL 
                                    WHERE id = ?
                                    """,
                                    (player_id,)
                                )
                                
                                # If player was host, check for remaining active players
                                if was_host:
                                    cursor = conn.execute(
                                        """
                                        SELECT id, username
                                        FROM players
                                        WHERE room_code = ? AND id != ? AND last_activity > ?
                                        ORDER BY last_activity DESC
                                        LIMIT 1
                                        """,
                                        (room_code, player_id, (datetime.utcnow() - timedelta(minutes=2)).isoformat())
                                    )
                                    new_host = cursor.fetchone()
                                    
                                    if new_host:
                                        # Assign new host
                                        conn.execute(
                                            "UPDATE rooms SET host_id = ? WHERE code = ?",
                                            (new_host['id'], room_code)
                                        )
                                        
                                        # Add system message about new host
                                        host_message = {
                                            "type": "host_update",
                                            "username": "System",
                                            "message": f"{new_host['username']} is now the host",
                                            "isSystem": True,
                                            "timestamp": datetime.utcnow().isoformat(),
                                            "new_host_id": new_host['id'],
                                            "new_host_name": new_host['username']
                                        }
                                        await manager.broadcast_to_room(host_message, room_code)
                                    else:
                                        # No active players left, delete the room
                                        conn.execute("DELETE FROM game_state WHERE room_code = ?", (room_code,))
                                        conn.execute("DELETE FROM rooms WHERE code = ?", (room_code,))

                    except sqlite3.Error as e:
                        logger.error(f"Database error in disconnect: {e}")
                        # Still remove from active connections even if database operations fail
                        del self.active_connections[room_code][player_id]
                        if not self.active_connections[room_code]:
                            del self.active_connections[room_code]
        except Exception as e:
            logger.error(f"Error in disconnect: {e}")

    async def store_and_broadcast_message(self, message: dict, room_code: str):
        """Store message in chat history and broadcast to all players in room"""
        try:
            # First broadcast the message to all connected clients
            await self.broadcast_to_room(message, room_code)
            
            # Then store in database
            try:
                with get_db() as conn:
                    # Get current chat history
                    cursor = conn.execute(
                        "SELECT chat_history FROM rooms WHERE code = ?",
                        (room_code,)
                    )
                    result = cursor.fetchone()
                    
                    if result:
                        try:
                            # Parse existing chat history
                            chat_history = json.loads(result['chat_history'] or '[]')
                            
                            # Add new message
                            chat_history.append(message)
                            
                            # Keep only last 100 messages and messages from last 24 hours
                            cutoff_time = (datetime.utcnow() - timedelta(hours=24)).isoformat()
                            chat_history = [
                                msg for msg in chat_history 
                                if msg.get('timestamp', '') >= cutoff_time
                            ][-100:]
                            
                            # Update chat history in database
                            conn.execute(
                                "UPDATE rooms SET chat_history = ? WHERE code = ?",
                                (json.dumps(chat_history), room_code)
                            )
                            conn.commit()
                        except json.JSONDecodeError:
                            # If chat history is corrupted, start fresh
                            chat_history = [message]
                            conn.execute(
                                "UPDATE rooms SET chat_history = ? WHERE code = ?",
                                (json.dumps(chat_history), room_code)
                            )
                            conn.commit()
            except sqlite3.Error as e:
                logger.error(f"Database error in store_and_broadcast_message: {e}")
                # Continue even if database storage fails - message was already broadcast
                
        except Exception as e:
            logger.error(f"Error in store_and_broadcast_message: {e}")

    async def broadcast_to_room(self, message: dict, room_code: str):
        if room_code in self.active_connections:
            disconnected_players = []
            for player_id, websocket in self.active_connections[room_code].items():
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.error(f"Error broadcasting message to player (ID: {player_id}): {e}")
                    disconnected_players.append(player_id)
            
            # Clean up disconnected players
            for player_id in disconnected_players:
                try:
                    del self.active_connections[room_code][player_id]
                except KeyError:
                    pass
            
            # Clean up empty room from connections
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

    async def send_to_player(self, message: dict, room_code: str, player_id: int):
        try:
            if room_code in self.active_connections:
                if player_id in self.active_connections[room_code]:
                    await self.active_connections[room_code][player_id].send_json(message)
        except Exception as e:
            logger.error(f"Error sending message to player: {e}")

manager = ConnectionManager()

# API Endpoints
@app.post("/players/", response_model=dict)
@app.post(f"{settings.API_V1_STR}/players/", response_model=dict)
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
def create_player(request: Request, player: PlayerCreate):
    with get_db() as conn:
        try:
            now = datetime.utcnow().isoformat()
            cursor = conn.execute(
                """
                INSERT INTO players (username, last_activity) 
                VALUES (?, ?) 
                RETURNING id, username
                """,
                (player.username, now)
            )
            result = cursor.fetchone()
            conn.commit()
            
            return {"id": result['id'], "username": result['username']}
            
        except sqlite3.Error as e:
            conn.rollback()
            logger.error(f"Error creating player: {e}")
            raise HTTPException(status_code=500, detail="Error creating player")

@app.post("/rooms/", response_model=dict)
@app.post(f"{settings.API_V1_STR}/rooms/", response_model=dict)
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
def create_room(request: Request, room: RoomCreate):
    with get_db() as conn:
        try:
            for _ in range(5):
                room_code = generate_room_code()
                cursor = conn.execute(
                    "SELECT EXISTS(SELECT 1 FROM rooms WHERE code = ?) AS room_exists",
                    (room_code,)
                )
                if not cursor.fetchone()['room_exists']:
                    break
            else:
                raise HTTPException(status_code=500, detail="Failed to generate unique room code")
            
            # Create room and update host's room_code
            conn.execute(
                "INSERT INTO rooms (code, host_id, last_activity) VALUES (?, ?, ?)",
                (room_code, room.player_id, datetime.utcnow().isoformat())
            )
            
            # Update host's room_code
            conn.execute(
                """
                UPDATE players 
                SET room_code = ?, status = 'not ready'
                WHERE id = ?
                """,
                (room_code, room.player_id)
            )
            
            conn.commit()
            
            return {"room_code": room_code, "host_id": room.player_id}
            
        except sqlite3.Error as e:
            conn.rollback()
            logger.error(f"Error creating room: {e}")
            raise HTTPException(status_code=500, detail="Error creating room")

@app.post("/rooms/{room_code}/join")
@app.post(f"{settings.API_V1_STR}/rooms/{{room_code}}/join")
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
async def join_room(request: Request, room_code: str, player: PlayerCreate):
    with get_db() as conn:
        try:
            now = datetime.utcnow().isoformat()
            
            # First check if the room exists
            cursor = conn.execute(
                "SELECT EXISTS(SELECT 1 FROM rooms WHERE code = ?) as room_exists",
                (room_code,)
            )
            if not cursor.fetchone()['room_exists']:
                raise HTTPException(status_code=404, detail="Room not found")
            
            # Check if username is already taken in this specific room by an active player
            cursor = conn.execute(
                """
                SELECT COUNT(*) as count 
                FROM players 
                WHERE username = ? 
                AND room_code = ? 
                AND last_activity > ?
                """,
                (player.username, room_code, (datetime.utcnow() - timedelta(minutes=2)).isoformat())
            )
            if cursor.fetchone()['count'] > 0:
                raise HTTPException(status_code=400, detail="Username already taken in this room")
            
            # Update room activity
            conn.execute(
                """
                UPDATE rooms 
                SET last_activity = ? 
                WHERE code = ?
                """,
                (now, room_code)
            )

            # Create new player
            cursor = conn.execute(
                """
                INSERT INTO players (username, room_code, last_activity)
                VALUES (?, ?, ?)
                RETURNING id
                """,
                (player.username, room_code, now)
            )
            player_id = cursor.fetchone()['id']
            
            conn.commit()
            
            # Broadcast new player joined event to room using the existing manager instance
            await manager.broadcast_to_room(
                {
                    "type": "player_joined",
                    "data": {
                        "player_id": player_id,
                        "username": player.username,
                        "is_ready": False
                    }
                },
                room_code
            )
            
            return {"message": "Joined room successfully", "player_id": player_id}
            
        except sqlite3.Error as e:
            conn.rollback()
            logger.error(f"Error joining room: {e}")
            raise HTTPException(status_code=500, detail="Error joining room")

@app.post("/rooms/{room_code}/leave")
@app.post(f"{settings.API_V1_STR}/rooms/{{room_code}}/leave")
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
def leave_room(request: Request, room_code: str, player: PlayerCreate):
    with get_db() as conn:
        try:
            # Get room and player
            cursor = conn.execute(
                """
                SELECT r.*, p.id as player_id
                FROM rooms r
                JOIN players p ON p.username = ? AND p.room_code = r.code
                WHERE r.code = ?
                """,
                (player.username, room_code)
            )
            result = cursor.fetchone()
            
            if not result:
                raise HTTPException(status_code=404, detail="Room or player not found")
            
            player_id = result['player_id']
            
            # If player is host, find new host
            if result['host_id'] == player_id:
                cursor = conn.execute(
                    """
                    SELECT id FROM players
                    WHERE room_code = ? AND id != ?
                    LIMIT 1
                    """,
                    (room_code, player_id)
                )
                new_host = cursor.fetchone()
                
                if new_host:
                    conn.execute(
                        "UPDATE rooms SET host_id = ? WHERE code = ?",
                        (new_host['id'], room_code)
                    )
                else:
                    # No other players, delete room
                    conn.execute("DELETE FROM game_state WHERE room_code = ?", (room_code,))
                    conn.execute("DELETE FROM rooms WHERE code = ?", (room_code,))
            
            # Remove player from room
            conn.execute(
                """
                UPDATE players
                SET room_code = NULL, status = 'not ready'
                WHERE id = ?
                """,
                (player_id,)
            )
            
            conn.commit()
            return {"message": "Left room successfully"}
            
        except sqlite3.Error as e:
            conn.rollback()
            logger.error(f"Error leaving room: {e}")
            raise HTTPException(status_code=500, detail="Error leaving room")

@app.post("/start-game/")
@app.post(f"{settings.API_V1_STR}/start-game/")
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
async def start_game(request: Request, game: GameStart):
    try:
        with get_db() as conn:
            # Get room and player count
            cursor = conn.execute(
                """
                SELECT COUNT(*) as player_count
                FROM players
                WHERE room_code = ? AND status = 'active'
                """,
                (game.room_code,)
            )
            player_count = cursor.fetchone()['player_count']
            
            # Get game requirements
            game_config = GAME_TYPES.get(game.game_type)
            if not game_config:
                raise HTTPException(status_code=400, detail="Invalid game type")
                
            # Validate player count
            if player_count < game_config['min_players'] or player_count > game_config['max_players']:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Game requires {game_config['min_players']}-{game_config['max_players']} players"
                )
            
            # Get all players in room
            cursor = conn.execute(
                """
                SELECT id, username, status
                FROM players
                WHERE room_code = ? AND status = 'active'
                """,
                (game.room_code,)
            )
            players = [dict(row) for row in cursor.fetchall()]
            
            # Initialize game state
            initial_state = {
                'room_code': game.room_code,
                'game_type': game.game_type,
                'players': players,
                'state': GameState.STARTING.value
            }
            
            # Create game state record
            cursor = conn.execute(
                """
                INSERT INTO game_state (room_code, game_type, players, state, status)
                VALUES (?, ?, ?, ?, 'active')
                RETURNING id
                """,
                (
                    game.room_code,
                    game.game_type,
                    json.dumps(players),
                    json.dumps(initial_state)
                )
            )
            game_state_id = cursor.fetchone()['id']
            
            # Update room with game state
            conn.execute(
                """
                UPDATE rooms 
                SET game_state = ?, last_activity = ?
                WHERE code = ?
                """,
                (game_state_id, datetime.utcnow().isoformat(), game.room_code)
            )
            
            conn.commit()
            
            # Broadcast game start to all players
            await manager.broadcast_to_room(
                {
                    "type": "game_started",
                    "game_type": game.game_type,
                    "state": initial_state
                },
                game.room_code
            )
            
            return {"message": "Game started successfully", "game_state_id": game_state_id}
            
    except Exception as e:
        logger.error(f"Error starting game: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/end-game/")
@app.post(f"{settings.API_V1_STR}/end-game/")
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
async def end_game(request: Request, game_end: GameEnd):
    with get_db() as conn:
        try:
            # Get winner ID
            winner_id = max(game_end.scores.items(), key=lambda x: x[1])[0]
            
            # Get room and winner
            cursor = conn.execute(
                """
                SELECT r.*, p.*
                FROM rooms r
                JOIN players p ON p.id = ?
                WHERE r.code = ?
                """,
                (winner_id, game_end.room_code)
            )
            result = cursor.fetchone()
            
            if not result:
                raise HTTPException(status_code=404, detail="Room or winner not found")
            
            # Convert result to dictionary
            result = dict(result)
            
            # Update winner's wins and clear game state
            conn.execute(
                """
                UPDATE players
                SET wins = wins + 1
                WHERE id = ?
                """,
                (winner_id,)
            )
            
            conn.execute(
                """
                UPDATE rooms
                SET game_state = NULL, last_activity = ?
                WHERE code = ?
                """,
                (datetime.utcnow().isoformat(), game_end.room_code)
            )
            
            conn.commit()
            
            # Notify all players
            await manager.broadcast_to_room(
                {
                    "type": "game_over",
                    "scores": game_end.scores,
                    "winner": {
                        "id": winner_id,
                        "username": result['username'],
                        "wins": result['wins'] + 1
                    }
                },
                game_end.room_code
            )
            
            return {"message": "Game ended", "winner": result['username']}
            
        except sqlite3.Error as e:
            conn.rollback()
            logger.error(f"Error ending game: {e}")
            raise HTTPException(status_code=500, detail="Error ending game")

@app.get("/leaderboard/{room_code}")
@app.get(f"{settings.API_V1_STR}/leaderboard/{{room_code}}")
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
def get_leaderboard(request: Request, room_code: str):
    with get_db() as conn:
        try:
            cursor = conn.execute(
                """
                SELECT username, wins
                FROM players
                WHERE room_code = ?
                ORDER BY wins DESC
                """,
                (room_code,)
            )
            players = cursor.fetchall()
            return [{"username": p['username'], "wins": p['wins']} for p in players]
            
        except sqlite3.Error as e:
            logger.error(f"Error getting leaderboard: {e}")
            raise HTTPException(status_code=500, detail="Error getting leaderboard")

@app.post("/api/v1/game-action/")
@app.post(f"{settings.API_V1_STR}/game-action/")
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
async def game_action(request: Request, action: GameAction):
    with get_db() as conn:
        try:
            now = datetime.utcnow().isoformat()
            # Update activity timestamps at start of action
            conn.execute(
                """
                UPDATE players 
                SET last_activity = ? 
                WHERE id = ?
                """,
                (now, action.player_id)
            )
            conn.execute(
                """
                UPDATE rooms 
                SET last_activity = ? 
                WHERE code = ?
                """,
                (now, action.room_code)
            )
            
            logger.info(f"Processing game action: room={action.room_code}, player={action.player_id}, action={action.action_type}")
            
            # First get the room and game state
            cursor = conn.execute(
                """
                SELECT game_state, host_id
                FROM rooms 
                WHERE code = ?
                """,
                (action.room_code,)
            )
            room_data = cursor.fetchone()
            if not room_data or not room_data['game_state']:
                raise HTTPException(status_code=404, detail="Room or game not found")

            game_state_id = int(room_data['game_state'])
            
            # Then get the game state and player data
            cursor = conn.execute(
                """
                SELECT g.*, p.*, g.game_type as game_type
                FROM game_state g
                JOIN players p ON p.room_code = g.room_code AND p.id = ?
                WHERE g.id = ? AND g.status = 'active'
                """,
                (action.player_id, game_state_id)
            )
            result = cursor.fetchone()
            
            if not result:
                logger.error(f"Game or player not found: room={action.room_code}, player={action.player_id}")
                raise HTTPException(status_code=404, detail="Game or player not found")
            
            # Convert result to dictionary
            result = dict(result)
            
            logger.info(f"Found game state: type={result['game_type']}, status={result['status']}")
            
            if result['status'] != 'active':
                try:
                    # Ensure game state is active
                    conn.execute(
                        """
                        UPDATE game_state
                        SET status = 'active'
                        WHERE id = ?
                        """,
                        (game_state_id,)
                    )
                    conn.commit()
                except sqlite3.Error as e:
                    logger.error(f"Error updating game state status: {e}")
                    raise HTTPException(status_code=500, detail="Error updating game state")

            # Get all players in room
            cursor = conn.execute(
                "SELECT * FROM players WHERE room_code = ?",
                (action.room_code,)
            )
            # Convert sqlite3.Row objects to dictionaries
            players_rows = cursor.fetchall()
            players = {}
            for p in players_rows:
                p_dict = dict(p)
                players[p_dict['id']] = p_dict
            
            # Process game action
            player_states = json.loads(result['players'])
            game_data = json.loads(result['state'])
            
            # Convert player IDs to strings in game data
            if isinstance(game_data, dict) and 'players' in game_data:
                for player in game_data['players']:
                    if isinstance(player, dict) and 'id' in player:
                        player['id'] = str(player['id'])
            
            logger.info(f"Processing game action: player_id={action.player_id}, action_type={action.action_type}")
            logger.info(f"Current player states: {player_states}")
            logger.info(f"Current game data: {game_data}")
            
            try:
                # Handle card game actions
                logger.info(f"Game type: {result['game_type']}")
                game_classes = {
                    "snap": snap.SnapGame,
                    "go_fish": go_fish.GoFishGame,
                    "bluff": bluff.BluffGame,
                    "scat": scat.ScatGame,
                    "rummy": rummy.RummyGame,
                    "kings_corner": kings_corner.KingsCornerGame,
                    "spades": spades.SpadesGame,
                    "spoons": spoons.SpoonsGame
                }
                
                # Create game instance and restore state
                logger.info("Creating game instance and restoring state...")
                
                # Get host_id from room data and ensure it's a string
                host_id = str(room_data['host_id'])
                logger.info(f"Host ID: {host_id}")
                
                try:
                    # Create game instance
                    game_instance = game_classes[result['game_type']](action.room_code)
                except Exception as e:
                    logger.error(f"Error creating game instance: {e}")
                    raise HTTPException(status_code=500, detail=f"Error creating game instance: {str(e)}")
                
                # Add all players first
                for player_id, player in players.items():
                    str_player_id = str(player_id)
                    is_host = (str_player_id == host_id)
                    game_instance.add_player(str_player_id, player['username'], is_host=is_host)
                
                # Set game state to playing since we're restoring an active game
                game_instance.state = GameState.PLAYING
                
                # Restore game state components
                if isinstance(game_data, dict):
                    # Check if we have valid saved state
                    if ('deck' in game_data and 'cards' in game_data['deck'] and
                        'players' in game_data and game_data['deck']['cards'] and
                        'game_state_id' in game_data and str(game_data['game_state_id']) == str(result['id'])):
                        try:
                            # Restore deck
                            game_instance.deck.cards = [
                                Card(Rank(card['rank']), Suit(card['suit']))
                                for card in game_data['deck']['cards']
                            ]
                            
                            # Restore player hands
                            all_hands_valid = True
                            for player_id, player in game_instance.players.items():
                                player_data = game_data['players'].get(player_id, {})
                                
                                # Get player's hand from game data
                                if 'hand' in player_data and isinstance(player_data['hand'], list):
                                    try:
                                        player.hand = [
                                            Card(Rank(card['rank']), Suit(card['suit']))
                                            for card in player_data['hand']
                                            if isinstance(card, dict) and 'rank' in card and 'suit' in card
                                        ]
                                    except Exception as e:
                                        logger.error(f"Error restoring hand for player {player_id}: {e}")
                                        all_hands_valid = False
                                
                                # If hand is empty or invalid but should have cards, deal new ones
                                if not player.hand:
                                    try:
                                        if not game_instance.deck.cards:
                                            game_instance.deck.reset()
                                        # Calculate cards per hand based on game type
                                        cards_per_hand = getattr(game_instance, 'cards_per_hand', None)
                                        if cards_per_hand is None:
                                            # Calculate minimum cards needed and divide by number of players
                                            min_cards = game_instance._calculate_min_cards_needed()
                                            cards_per_hand = min_cards // len(game_instance.players)
                                        player.hand = game_instance.deck.draw_multiple(cards_per_hand)
                                    except Exception as e:
                                        logger.error(f"Error dealing new cards to player {player_id}: {e}")
                                        all_hands_valid = False
                            
                            # If any hands are invalid, reinitialize the game
                            if not all_hands_valid:
                                logger.info("Some hands were invalid, reinitializing game")
                                game_instance.deck.reset()
                                game_instance.start_game()
                            
                            # Restore game flow control
                            if 'current_player_idx' in game_data:
                                game_instance.current_player_idx = game_data['current_player_idx']
                            if 'direction' in game_data:
                                game_instance.direction = game_data['direction']
                            
                            # Restore game-specific state
                            if result['game_type'] == 'snap':
                                if 'center_pile' in game_data and isinstance(game_data['center_pile'], list):
                                    game_instance.center_pile = [
                                        Card(Rank(card['rank']), Suit(card['suit']))
                                        for card in game_data['center_pile']
                                        if isinstance(card, dict) and 'rank' in card and 'suit' in card
                                    ]
                            elif result['game_type'] == 'go_fish':
                                if 'sets' in game_data and isinstance(game_data['sets'], dict):
                                    game_instance.sets = {
                                        player_id: [
                                            [Card(Rank(card['rank']), Suit(card['suit'])) for card in set_cards]
                                            for set_cards in sets
                                        ]
                                        for player_id, sets in game_data['sets'].items()
                                    }
                        except Exception as e:
                            logger.error(f"Error restoring game state: {e}")
                            # Reinitialize game if restoration fails
                            game_instance.deck.reset()
                            game_instance.deck.shuffle()
                            game_instance.start_game()
                    else:
                        # Initialize new game state
                        logger.info("Initializing new game state")
                        game_instance.deck.reset()
                        game_instance.deck.shuffle()
                        game_instance.start_game()
                
                # Handle get_state action type for all games
                if action.action_type == "get_state":
                    logger.info("Getting game state for player...")
                    try:
                        # Get state for specific player
                        game_data = game_instance.get_game_state(str(action.player_id))
                        logger.info(f"Raw game state received: {type(game_data)}")
                        
                        # Ensure game_data is a dictionary
                        if not isinstance(game_data, dict):
                            game_data = {
                                'state': str(game_data),
                                'room_code': action.room_code,
                                'players': {},
                                'current_player': None,
                                'deck': {'cards': []},
                                'direction': game_instance.direction,
                                'current_player_idx': game_instance.current_player_idx
                            }
                        
                        # Add game type to the state
                        game_data["game_type"] = result['game_type']
                        
                        logger.info(f"Final formatted game state: {game_data}")
                        return game_data
                        
                    except Exception as e:
                        logger.error(f"Error getting game state: {e}", exc_info=True)
                        # Return a minimal valid game state on error
                        return {
                            'room_code': action.room_code,
                            'state': 'error',
                            'game_type': result['game_type'],
                            'error': str(e),
                            'players': {},
                            'current_player': None,
                            'deck': {'cards': []},
                            'direction': 1,
                            'current_player_idx': 0
                        }
                # Process other actions based on game type
                elif result['game_type'] == "snap":
                    logger.info(f"Processing Snap game action: {action.action_type}")
                    try:
                        logger.info(f"Current game state before action: {game_instance.get_game_state()}")
                        if action.action_type == "play_card":
                            game_instance.play_card(str(action.player_id))
                            game_data = game_instance.get_game_state()
                        elif action.action_type == "snap":
                            game_instance.snap(str(action.player_id))
                            game_data = game_instance.get_game_state()
                        else:
                            raise HTTPException(status_code=400, detail="Invalid action type for Snap")
                    except Exception as e:
                        raise HTTPException(status_code=400, detail=str(e))
                elif result['game_type'] == "go_fish":
                    try:
                        if action.action_type == "ask_for_cards":
                            game_instance.ask_for_cards(
                                str(action.player_id),
                                str(action.action_data["target_player_id"]),
                                action.action_data["rank"]
                            )
                            game_data = game_instance.get_game_state()
                        else:
                            raise HTTPException(status_code=400, detail="Invalid action type for Go Fish")
                    except Exception as e:
                        raise HTTPException(status_code=400, detail=str(e))
                elif result['game_type'] == "bluff":
                    if action.action_type == "play_cards":
                        game_instance.play_cards(
                            str(action.player_id),
                            action.action_data["card_indices"],
                            action.action_data["claimed_rank"]
                        )
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "challenge":
                        game_instance.challenge(str(action.player_id))
                        game_data = game_instance.get_game_state()
                    else:
                        raise HTTPException(status_code=400, detail="Invalid action type for Bluff")
                elif result['game_type'] == "scat":
                    if action.action_type == "draw_card":
                        game_instance.draw_card(
                            str(action.player_id),
                            action.action_data.get("from_discard", False)
                        )
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "discard_card":
                        game_instance.discard_card(
                            str(action.player_id),
                            action.action_data["card_index"]
                        )
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "knock":
                        game_instance.knock(str(action.player_id))
                        game_data = game_instance.get_game_state()
                    else:
                        raise HTTPException(status_code=400, detail="Invalid action type for Scat")
                elif result['game_type'] == "rummy":
                    if action.action_type == "draw_card":
                        game_instance.draw_card(
                            str(action.player_id),
                            action.action_data.get("from_discard", False)
                        )
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "discard_card":
                        game_instance.discard_card(
                            str(action.player_id),
                            action.action_data["card_index"]
                        )
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "lay_meld":
                        game_instance.lay_meld(
                            str(action.player_id),
                            action.action_data["card_indices"]
                        )
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "add_to_meld":
                        game_instance.add_to_meld(
                            str(action.player_id),
                            action.action_data["card_index"],
                            action.action_data["meld_index"]
                        )
                        game_data = game_instance.get_game_state()
                    else:
                        raise HTTPException(status_code=400, detail="Invalid action type for Rummy")
                elif result['game_type'] == "kings_corner":
                    if action.action_type == "play_card":
                        game_instance.play_card(
                            str(action.player_id),
                            action.action_data["card_index"],
                            action.action_data["pile_id"]
                        )
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "move_pile":
                        game_instance.move_pile(
                            str(action.player_id),
                            action.action_data["source_pile_id"],
                            action.action_data["target_pile_id"]
                        )
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "draw_card":
                        game_instance.draw_card(str(action.player_id))
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "end_turn":
                        game_instance.end_turn(str(action.player_id))
                        game_data = game_instance.get_game_state()
                    else:
                        raise HTTPException(status_code=400, detail="Invalid action type for Kings Corner")
                elif result['game_type'] == "spades":
                    if action.action_type == "make_bid":
                        game_instance.make_bid(
                            str(action.player_id),
                            action.action_data["bid"]
                        )
                        game_data = game_instance.get_game_state()
                    elif action.action_type == "play_card":
                        game_instance.play_card(
                            str(action.player_id),
                            action.action_data["card_index"]
                        )
                        game_data = game_instance.get_game_state()
                    else:
                        raise HTTPException(status_code=400, detail="Invalid action type for Spades")
                
                # Update game data with new state
                raw_game_data = game_instance.get_game_state()
                
                # Format game state consistently
                formatted_game_data = {
                    "room_code": action.room_code,
                    "current_player": str(game_instance.current_player_idx),
                    "game_type": result['game_type'],
                    "players": {
                        str(p_id): {
                            "id": str(p_id),
                            "name": p.name,
                            "hand_size": len(p.hand),
                            "score": p.score,
                            "is_host": p.is_host,
                            "hand": [card.to_dict() for card in p.hand] if str(p_id) == str(action.player_id) else []
                        }
                        for p_id, p in game_instance.players.items()
                    },
                    "deck": {
                        'cards': [card.to_dict() for card in game_instance.deck.cards]
                    }
                }
                
                # Merge game-specific state
                if isinstance(raw_game_data, dict):
                    formatted_game_data.update(raw_game_data)
                else:
                    formatted_game_data["state"] = str(raw_game_data)
                
                game_data = formatted_game_data
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
            
            # Update game state
            try:
                # Log game state before update
                logger.info(f"Updating game state in database. Type: {type(game_data)}")
                if isinstance(game_data, str):
                    logger.info("Converting string game state to dictionary for database")
                    game_data = {"state": game_data}
                elif not isinstance(game_data, dict):
                    logger.info(f"Converting {type(game_data)} game state to dictionary for database")
                    game_data = {"state": str(game_data)}

                # Ensure game_data has the game state ID
                game_data['game_state_id'] = result['id']

                # Log final game state
                logger.info(f"Final game state for database: {json.dumps(game_data)[:200]}...")
                
                # Update game state with explicit status
                conn.execute(
                    """
                    UPDATE game_state
                    SET players = ?, state = ?, status = 'active'
                    WHERE id = ?
                    """,
                    (
                        json.dumps(player_states),
                        json.dumps(game_data),
                        result['id']
                    )
                )
            except Exception as e:
                logger.error(f"Error updating game state: {e}")
                raise HTTPException(status_code=500, detail=f"Error updating game state: {str(e)}")
            
            # Update room activity
            conn.execute(
                """
                UPDATE rooms
                SET last_activity = ?
                WHERE code = ?
                """,
                (datetime.utcnow().isoformat(), action.room_code)
            )
            
            conn.commit()
            # Format player list with host information from game state
            players_with_host = format_player_states(player_states, players)
            
            # Ensure game_data is properly formatted before broadcasting
            broadcast_game_data = game_data
            if isinstance(game_data, str):
                broadcast_game_data = {"state": game_data}
            elif not isinstance(game_data, dict):
                broadcast_game_data = {"state": str(game_data)}

            # Broadcast update to all players
            await manager.broadcast_to_room(
                {
                    "type": "game_update",
                    "action": action.action_type,
                    "player_id": action.player_id,
                    "result": {"success": True},
                    "players": players_with_host,
                    "game_state": broadcast_game_data
                },
                action.room_code
            )
            
            return game_data
            
        except sqlite3.Error as e:
            conn.rollback()
            logger.error(f"Error processing game action: {e}")
            raise HTTPException(status_code=500, detail="Error processing game action")

@app.websocket("/ws/{room_code}/{player_id}")
@app.websocket(f"{settings.API_V1_STR}/ws/{{room_code}}/{{player_id}}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_id: int):
    try:
        # Get player details before connecting
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT p.username, p.id = r.host_id as is_host
                FROM players p
                JOIN rooms r ON r.code = p.room_code
                WHERE p.id = ? AND p.room_code = ?
                """,
                (player_id, room_code)
            )
            player = cursor.fetchone()
            
            if not player:
                logger.error(f"Player {player['username']} (ID: {player_id}) not found in room {room_code}")
                await websocket.close(code=4004, reason="Player not found in room")
                return

        await manager.connect(websocket, room_code, player_id)
        
        try:
            while True:
                try:
                    data = await websocket.receive_json()
                    await process_websocket_message(websocket, data, room_code, player_id)
                except WebSocketDisconnect:
                    logger.info(f"WebSocket disconnected for player {player['username']} (ID: {player_id}) in room {room_code}")
                    break
                except Exception as e:
                    logger.error(f"Error processing websocket message: {e}")
                    if websocket.client_state != WebSocketState.DISCONNECTED:
                        await websocket.send_json({
                            "type": "error",
                            "message": str(e)
                        })
        finally:
            await manager.disconnect(websocket, room_code, player_id)
            
    except Exception as e:
        logger.error(f"Error in websocket endpoint: {e}")
        if websocket.client_state != WebSocketState.DISCONNECTED:
            await websocket.close(code=1011, reason=str(e))

async def process_websocket_message(websocket: WebSocket, data: dict, room_code: str, player_id: int):
    """Process incoming WebSocket messages"""
    try:
        message_type = data.get('type')
        
        # Get player details for logging
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT p.username, p.id = r.host_id as is_host
                FROM players p
                JOIN rooms r ON r.code = p.room_code
                WHERE p.id = ? AND p.room_code = ?
                """,
                (player_id, room_code)
            )
            player = cursor.fetchone()
            
        player_info = f"{player['username']} ({'host' if player['is_host'] else 'player'})" if player else f"Player {player_id}"
        logger.info(f"Processing WebSocket message: {message_type} from {player_info} in room {room_code}")

        if message_type == 'get_state':
            try:
                with get_db() as conn:
                    cursor = conn.execute(
                        """
                        SELECT gs.state, gs.players, gs.game_type, r.chat_history, r.host_id,
                               (SELECT COUNT(*) FROM players WHERE room_code = r.code AND last_activity > ?) as player_count
                        FROM rooms r
                        LEFT JOIN game_state gs ON gs.room_code = r.code
                        WHERE r.code = ?
                        LIMIT 1
                        """,
                        ((datetime.utcnow() - timedelta(minutes=2)).isoformat(), room_code)
                    )
                    result = cursor.fetchone()

                    if result:
                        # Get all active players in the room
                        cursor = conn.execute(
                            """
                            SELECT DISTINCT id, username, last_activity > ? as is_ready
                            FROM players
                            WHERE room_code = ? AND last_activity > ?
                            ORDER BY id
                            """,
                            ((datetime.utcnow() - timedelta(seconds=30)).isoformat(), room_code, (datetime.utcnow() - timedelta(minutes=2)).isoformat())
                        )
                        players = cursor.fetchall()
                        
                        formatted_players = [{
                            'id': str(p['id']),
                            'name': p['username'],
                            'isHost': p['id'] == result['host_id'],
                            'isReady': p['is_ready']
                        } for p in players]
                        
                        chat_history = json.loads(result['chat_history']) if result['chat_history'] else []
                        
                        # If there's an active game
                        if result['state']:
                            state = json.loads(result['state'])
                            
                            await websocket.send_json({
                                "type": "game_state",
                                "state": state,
                                "players": formatted_players,
                                "game_type": result['game_type'],
                                "chat_history": chat_history
                            })
                        else:
                            await websocket.send_json({
                                "type": "game_state",
                                "state": {},
                                "players": formatted_players,
                                "game_type": None,
                                "chat_history": chat_history
                            })
            except Exception as e:
                logger.error(f"Error processing get_state: {e}")
                raise

        elif message_type == 'chat':
            # Rate limit: 1 message per second, 30 messages per minute
            current_time = datetime.utcnow()
            cache_key = f"chat_rate_limit:{room_code}:{player_id}"
            last_message_time = request_cache.get(cache_key)
            
            if last_message_time and (current_time - last_message_time).total_seconds() < 1:
                await websocket.send_json({
                    "type": "error",
                    "message": "Please wait before sending another message"
                })
                return
                
            request_cache[cache_key] = current_time
            
            # Process and broadcast chat message
            message = data.get('message', '').strip()
            if message and player:
                # Validate message length
                if len(message) > 200:
                    await websocket.send_json({
                        "type": "error",
                        "message": "Message too long (max 200 characters)"
                    })
                    return
                    
                chat_message = {
                    "type": "chat",
                    "username": player['username'],
                    "message": message,
                    "isSystem": False,
                    "timestamp": current_time.isoformat()
                }
                await manager.store_and_broadcast_message(chat_message, room_code)
            
        elif message_type == 'leave_room':
            # Handle explicit leave room request
            if player:
                with get_db() as conn:
                    # Clear room association
                    conn.execute(
                        """
                        UPDATE players 
                        SET room_code = NULL 
                        WHERE id = ?
                        """,
                        (player_id,)
                    )
                    
                    # If player was host, check for remaining active players
                    if player['is_host']:
                        cursor = conn.execute(
                            """
                            SELECT id, username
                            FROM players
                            WHERE room_code = ? AND id != ? AND last_activity > ?
                            ORDER BY last_activity DESC
                            LIMIT 1
                            """,
                            (room_code, player_id, (datetime.utcnow() - timedelta(minutes=2)).isoformat())
                        )
                        new_host = cursor.fetchone()
                        
                        if new_host:
                            # Assign new host
                            conn.execute(
                                "UPDATE rooms SET host_id = ? WHERE code = ?",
                                (new_host['id'], room_code)
                            )
                            
                            # Add system message about new host
                            host_message = {
                                "type": "host_update",
                                "username": "System",
                                "message": f"{new_host['username']} is now the host",
                                "isSystem": True,
                                "timestamp": datetime.utcnow().isoformat(),
                                "new_host_id": new_host['id'],
                                "new_host_name": new_host['username']
                            }
                            await manager.broadcast_to_room(host_message, room_code)
                        else:
                            # No active players left, delete the room
                            conn.execute("DELETE FROM game_state WHERE room_code = ?", (room_code,))
                            conn.execute("DELETE FROM rooms WHERE code = ?", (room_code,))
                    
                    conn.commit()
                    
                    # Disconnect WebSocket
                    await manager.disconnect(websocket, room_code, player_id)
            
        else:
            logger.warning(f"Unknown message type: {message_type} from {player_info}")
            await websocket.send_json({
                "type": "error",
                "message": f"Unknown message type: {message_type}"
            })

    except Exception as e:
        logger.error(f"Error processing WebSocket message: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": "Error processing message"
            })
        except (RuntimeError, WebSocketDisconnect) as e:
            logger.error(f"Could not send error message: {e}")

# Reset database endpoint (only for testing)
@app.post("/reset-database")
@app.post(f"{settings.API_V1_STR}/reset-database")
@limiter.limit(f"{settings.RATE_LIMIT_PER_MINUTE}/minute")
async def reset_database(request: Request):
    """Reset the database - WARNING: This will delete all data!"""
    try:
        with get_db() as db:
            # Drop all tables
            db.execute("DROP TABLE IF EXISTS players")
            db.execute("DROP TABLE IF EXISTS rooms")
            db.execute("DROP TABLE IF EXISTS game_states")
            db.execute("DROP TABLE IF EXISTS leaderboard")
            
            # Reinitialize database
            init_db()
            
            return {"message": "Database reset successfully"}
    except Exception as e:
        logger.error(f"Error resetting database: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def format_player_states(player_states, players):
    formatted = []
    for player_id, state in player_states.items():
        player_info = {
            'id': player_id,
            'name': players[int(player_id)]['username'],
            'isHost': state.get('is_host', False),
            'isReady': players[int(player_id)].get('is_ready', False)
        }
        player_info.update(state)
        formatted.append(player_info)
    return formatted

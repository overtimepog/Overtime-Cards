-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- Players table must be created first since rooms references it
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    room_code TEXT,
    wins INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table depends on players
CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    host_id INTEGER NOT NULL,
    game_state TEXT,
    chat_history TEXT DEFAULT '[]',
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (host_id) REFERENCES players(id)
);

-- Drop and recreate players table with foreign key
DROP TABLE IF EXISTS players_temp;
CREATE TABLE players_temp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    room_code TEXT,
    wins INTEGER DEFAULT 0,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_code) REFERENCES rooms(code)
);
INSERT INTO players_temp SELECT id, username, room_code, wins, last_activity FROM players;
DROP TABLE players;
ALTER TABLE players_temp RENAME TO players;

-- Game state table
CREATE TABLE IF NOT EXISTS game_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    game_type TEXT NOT NULL,
    players TEXT NOT NULL,
    state TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_code) REFERENCES rooms(code)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_players_room_code ON players(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);
CREATE INDEX IF NOT EXISTS idx_game_state_room_code ON game_state(room_code);
CREATE INDEX IF NOT EXISTS idx_player_username ON players(username);
CREATE INDEX IF NOT EXISTS idx_player_composite ON players(room_code);
CREATE INDEX IF NOT EXISTS idx_player_wins ON players(wins);
CREATE INDEX IF NOT EXISTS idx_player_last_activity ON players(last_activity);
CREATE INDEX IF NOT EXISTS idx_room_last_activity ON rooms(last_activity);
CREATE INDEX IF NOT EXISTS idx_room_host ON rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_room_composite ON rooms(code, host_id, game_state);
CREATE INDEX IF NOT EXISTS idx_game_state_composite ON game_state(room_code, game_type);

# Overtime Cards API

A FastAPI-based backend for multiplayer card games with real-time WebSocket communication.

## Features

- Multiple card game implementations (Snap, Go Fish, Bluff, etc.)
- Real-time multiplayer support via WebSockets
- Room-based gameplay
- Player management and leaderboards
- Rate limiting and security features
- Production-ready configuration

## Prerequisites

- Python 3.8+
- PostgreSQL (for production)
- pip (Python package manager)

## Setup

1. Clone the repository:
```bash
git clone https://github.com/your-username/overtime-cards-api.git
cd overtime-cards-api
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Set up environment variables:
```bash
cp .env.example .env
```
Edit the `.env` file with your configuration values.

## Development

1. Start the development server:
```bash
uvicorn main:app --reload
```

2. Access the API documentation:
- Swagger UI: http://localhost:8000/api/v1/docs
- ReDoc: http://localhost:8000/api/v1/redoc

## Testing

Run the test suite:
```bash
pytest tests/
```

For test coverage report:
```bash
pytest --cov=. tests/
```

## Production Deployment

The API is configured for deployment on Render.com using the `render.yaml` configuration.

### Environment Variables

Ensure these environment variables are set in production:

- `SECRET_KEY`: Your secure secret key
- `CORS_ORIGINS`: Comma-separated list of allowed origins
- `DATABASE_URL`: PostgreSQL database URL
- `ENVIRONMENT`: Set to 'production'
- `SENTRY_DSN`: Sentry error tracking DSN
- `RATE_LIMIT_PER_MINUTE`: API rate limit per minute

### Redis Setup on Render

The application uses Redis for caching and real-time features. Redis is configured automatically through render.yaml with the following settings:

1. A Redis service is provisioned with:
   - Plan: Starter
   - Memory Policy: noeviction
   - Port: 6379
   - Internal-only access (no external connections)

2. The web service automatically receives the Redis connection URL through the `REDIS_URL` environment variable.

3. Redis Configuration Variables:
   - `REDIS_URL`: Automatically set from the Redis service
   - `REDIS_CACHE_EXPIRE`: Cache expiration time in seconds (default: 3600)

No manual Redis setup is required as the service is automatically provisioned and configured through render.yaml.

### Database Migration

For production database setup:

1. Create a PostgreSQL database
2. Set the `DATABASE_URL` environment variable
3. The tables will be automatically created on first run

## API Documentation

### Authentication

Currently using basic player authentication with usernames. Token-based authentication planned for future releases.

### Endpoints

#### Health Check
- GET `/health`
  - Returns API health status

#### Players
- POST `/api/v1/players/`
  - Create a new player
  - Body: `{"username": "string"}`

#### Rooms
- POST `/api/v1/rooms/`
  - Create a new game room
  - Body: `{"username": "string"}`

- POST `/api/v1/rooms/{room_code}/join`
  - Join an existing room
  - Body: `{"username": "string"}`

#### Games
- POST `/api/v1/start-game`
  - Start a game in a room
  - Body: `{"room_code": "string", "game_type": "string"}`

- POST `/api/v1/game-action`
  - Perform a game action
  - Body: `{"room_code": "string", "player_id": "integer", "action_type": "string", "action_data": {}}`

- GET `/api/v1/leaderboard/{room_code}`
  - Get room leaderboard

#### WebSocket
- WS `/api/v1/ws/{room_code}/{player_id}`
  - Real-time game communication

### Rate Limiting

- Default: 60 requests per minute per IP
- Configurable via environment variables

### Error Handling

- Standard HTTP status codes
- Detailed error messages in development
- Sanitized error messages in production
- Sentry integration for error tracking

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT License - see LICENSE file for details

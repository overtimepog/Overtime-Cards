# Overtime Cards

a multiplayer room based card game simulator

## Project Structure

The project is organized into two main directories:

- `frontend/`: React-based web application deployed on Vercel
- `backend/`: FastAPI-based REST API server deployed on Render

## Tech Stack

### Backend

- **Framework**: FastAPI (Python)
- **Key Dependencies**:
  - FastAPI - High-performance web framework
  - Uvicorn - ASGI server implementation
  - Pydantic - Data validation
  - WebSockets - Real-time communication
  - APScheduler - Task scheduling
  - Python-Jose - JWT token handling
  - Rate limiting and caching utilities

### Frontend

- **Framework**: React
- **Deployment**: Vercel
- **Build System**: npm

## Setup and Installation

### Backend Setup

1. Navigate to the backend directory:

   ```bash
   cd backend
   ```

2. Create a virtual environment:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

### Frontend Setup

1. Navigate to the frontend directory:

   ```bash
   cd frontend
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm start
   ```

## Development

### Backend Development

- The backend server runs on FastAPI with automatic API documentation
- Environment variables should be configured in a `.env` file
- API endpoints are RESTful with JWT authentication

### Frontend Development

- Built with modern React practices
- Configured for deployment on Vercel
- Static assets are cached and optimized for performance

## Deployment

### Backend Deployment

- Configured for deployment with gunicorn
- Includes rate limiting and security features
- Sentry integration for error tracking

### Frontend Deployment

- Automated deployment through Vercel
- Optimized static asset serving
- Configured with proper caching headers

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

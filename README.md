# Roadrage Offline

A Node.js backend application for tracking and managing ride data offline using Express and SQLite.

## Features

- ✅ RESTful API for ride management
- ✅ SQLite database for persistent storage
- ✅ Full CRUD operations for rides
- ✅ Input validation and error handling
- ✅ CORS support for frontend integration
- ✅ Offline-first design

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation and Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. The server will be running at `http://localhost:3000`

### Test the API

Health check:
```bash
curl http://localhost:3000/health
```

Create a ride:
```bash
curl -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "driver_name": "John Doe",
    "passenger_name": "Jane Smith",
    "start_location": "123 Main St",
    "end_location": "456 Oak Ave",
    "distance": 15.5,
    "duration": 25,
    "fare": 32.50
  }'
```

Get all rides:
```bash
curl http://localhost:3000/api/rides
```

## API Documentation

See [API.md](./API.md) for complete API documentation.

## Database

The application uses SQLite database (`rides.db`) with automatic table creation on first run. The database file is created automatically when the server starts.

## Project Structure

```
roadrage_offline/
├── server.js          # Main Express server
├── package.json       # Node.js dependencies
├── API.md            # API documentation
├── README.md         # This file
├── .gitignore        # Git ignore rules
└── rides.db          # SQLite database (created automatically)
```

## Development

To run in development mode:
```bash
npm run dev
```

## Contributing

This is a basic implementation. Feel free to extend with features like:
- User authentication
- Real-time updates
- Data analytics
- Frontend interface
- Mobile app integration
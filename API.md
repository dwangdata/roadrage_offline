# Roadrage Offline Backend API

A Node.js/Express backend for tracking ride data with SQLite database.

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```

The server will start on port 3000 by default.

## API Endpoints

### Health Check
**GET** `/health`

Returns server status.

**Response:**
```json
{
  "status": "OK",
  "message": "Roadrage Offline Backend is running"
}
```

### Rides

#### Get All Rides
**GET** `/api/rides`

Returns all rides ordered by timestamp (newest first).

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "driver_name": "John Doe",
      "passenger_name": "Jane Smith",
      "start_location": "123 Main St, City A",
      "end_location": "456 Oak Ave, City B",
      "distance": 15.5,
      "duration": 25,
      "fare": 32.5,
      "status": "completed",
      "timestamp": "2025-08-27 03:09:53"
    }
  ],
  "count": 1
}
```

#### Get Ride by ID
**GET** `/api/rides/:id`

Returns a specific ride by ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "driver_name": "John Doe",
    "passenger_name": "Jane Smith",
    "start_location": "123 Main St, City A",
    "end_location": "456 Oak Ave, City B",
    "distance": 15.5,
    "duration": 25,
    "fare": 32.5,
    "status": "completed",
    "timestamp": "2025-08-27 03:09:53"
  }
}
```

#### Create New Ride
**POST** `/api/rides`

Creates a new ride record.

**Required Fields:**
- `driver_name` (string): Name of the driver
- `start_location` (string): Starting location
- `end_location` (string): Destination location

**Optional Fields:**
- `passenger_name` (string): Name of the passenger
- `distance` (number): Distance in km/miles
- `duration` (number): Duration in minutes
- `fare` (number): Fare amount
- `status` (string): Ride status (default: "completed")

**Request Body:**
```json
{
  "driver_name": "John Doe",
  "passenger_name": "Jane Smith",
  "start_location": "123 Main St, City A",
  "end_location": "456 Oak Ave, City B",
  "distance": 15.5,
  "duration": 25,
  "fare": 32.50,
  "status": "completed"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Ride created successfully",
  "data": {
    "id": 1,
    "driver_name": "John Doe",
    "passenger_name": "Jane Smith",
    "start_location": "123 Main St, City A",
    "end_location": "456 Oak Ave, City B",
    "distance": 15.5,
    "duration": 25,
    "fare": 32.5,
    "status": "completed",
    "timestamp": "2025-08-27 03:09:53"
  }
}
```

#### Update Ride
**PUT** `/api/rides/:id`

Updates an existing ride record.

**Request Body:** Same as Create New Ride

#### Delete Ride
**DELETE** `/api/rides/:id`

Deletes a ride record.

**Response:**
```json
{
  "success": true,
  "message": "Ride deleted successfully"
}
```

## Database Schema

The application uses SQLite with the following table structure:

```sql
CREATE TABLE rides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  driver_name TEXT NOT NULL,
  passenger_name TEXT,
  start_location TEXT NOT NULL,
  end_location TEXT NOT NULL,
  distance REAL,
  duration INTEGER,
  fare REAL,
  status TEXT DEFAULT 'completed',
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200`: Success
- `201`: Created successfully
- `400`: Bad request (validation errors)
- `404`: Resource not found
- `500`: Internal server error

Error responses include a descriptive error message:
```json
{
  "error": "Missing required fields: driver_name, start_location, end_location"
}
```

## Examples

### Creating a Ride with curl
```bash
curl -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "driver_name": "John Doe",
    "passenger_name": "Jane Smith",
    "start_location": "123 Main St, City A",
    "end_location": "456 Oak Ave, City B",
    "distance": 15.5,
    "duration": 25,
    "fare": 32.50,
    "status": "completed"
  }'
```

### Fetching All Rides
```bash
curl http://localhost:3000/api/rides
```

### Fetching a Specific Ride
```bash
curl http://localhost:3000/api/rides/1
```
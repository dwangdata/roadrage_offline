#!/bin/bash

# Demo script for Roadrage Offline Backend
# This script demonstrates the API functionality

echo "🚗 Roadrage Offline Backend Demo"
echo "================================"

# Start the server in background
echo "Starting server..."
npm start &
SERVER_PID=$!

# Wait for server to start
sleep 3

echo ""
echo "1. Health Check:"
echo "----------------"
curl -s http://localhost:3000/health | json_pp 2>/dev/null || curl -s http://localhost:3000/health

echo ""
echo ""
echo "2. Creating Sample Rides:"
echo "------------------------"

# Create first ride
echo "Creating ride 1..."
curl -s -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "driver_name": "John Doe",
    "passenger_name": "Jane Smith",
    "start_location": "Downtown Plaza",
    "end_location": "Airport Terminal",
    "distance": 25.5,
    "duration": 35,
    "fare": 45.00,
    "status": "completed"
  }' | json_pp 2>/dev/null || curl -s -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "driver_name": "John Doe",
    "passenger_name": "Jane Smith",
    "start_location": "Downtown Plaza",
    "end_location": "Airport Terminal",
    "distance": 25.5,
    "duration": 35,
    "fare": 45.00,
    "status": "completed"
  }'

echo ""
echo ""

# Create second ride
echo "Creating ride 2..."
curl -s -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "driver_name": "Alice Johnson",
    "passenger_name": "Bob Wilson",
    "start_location": "Main Street Station",
    "end_location": "Shopping Center",
    "distance": 12.3,
    "duration": 18,
    "fare": 28.50
  }' | json_pp 2>/dev/null || curl -s -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "driver_name": "Alice Johnson",
    "passenger_name": "Bob Wilson",
    "start_location": "Main Street Station",
    "end_location": "Shopping Center",
    "distance": 12.3,
    "duration": 18,
    "fare": 28.50
  }'

echo ""
echo ""
echo "3. Retrieving All Rides:"
echo "-----------------------"
curl -s http://localhost:3000/api/rides | json_pp 2>/dev/null || curl -s http://localhost:3000/api/rides

echo ""
echo ""
echo "4. Retrieving Specific Ride (ID: 1):"
echo "------------------------------------"
curl -s http://localhost:3000/api/rides/1 | json_pp 2>/dev/null || curl -s http://localhost:3000/api/rides/1

echo ""
echo ""
echo "5. Testing Validation (missing required field):"
echo "-----------------------------------------------"
curl -s -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "driver_name": "Test Driver",
    "end_location": "Some Location"
  }' | json_pp 2>/dev/null || curl -s -X POST http://localhost:3000/api/rides \
  -H "Content-Type: application/json" \
  -d '{
    "driver_name": "Test Driver",
    "end_location": "Some Location"
  }'

echo ""
echo ""
echo "✅ Demo completed! Server is still running on port 3000"
echo "Kill the server with: kill $SERVER_PID"
echo ""
echo "📖 Check API.md for complete documentation"
echo "🚀 Use 'npm start' to run the server"
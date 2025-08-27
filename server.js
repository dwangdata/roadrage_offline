const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database setup
const dbPath = path.join(__dirname, 'rides.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    initializeDatabase();
  }
});

// Initialize database schema
function initializeDatabase() {
  const createRidesTable = `
    CREATE TABLE IF NOT EXISTS rides (
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
    )
  `;
  
  db.run(createRidesTable, (err) => {
    if (err) {
      console.error('Error creating rides table:', err.message);
    } else {
      console.log('Rides table ready.');
    }
  });
}

// Routes

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Roadrage Offline Backend is running' });
});

// Get all rides
app.get('/api/rides', (req, res) => {
  const query = `
    SELECT * FROM rides 
    ORDER BY timestamp DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching rides:', err.message);
      res.status(500).json({ error: 'Failed to fetch rides' });
    } else {
      res.json({
        success: true,
        data: rows,
        count: rows.length
      });
    }
  });
});

// Get a specific ride by ID
app.get('/api/rides/:id', (req, res) => {
  const rideId = req.params.id;
  const query = `SELECT * FROM rides WHERE id = ?`;
  
  db.get(query, [rideId], (err, row) => {
    if (err) {
      console.error('Error fetching ride:', err.message);
      res.status(500).json({ error: 'Failed to fetch ride' });
    } else if (!row) {
      res.status(404).json({ error: 'Ride not found' });
    } else {
      res.json({
        success: true,
        data: row
      });
    }
  });
});

// Create a new ride
app.post('/api/rides', (req, res) => {
  const {
    driver_name,
    passenger_name,
    start_location,
    end_location,
    distance,
    duration,
    fare,
    status = 'completed'
  } = req.body;

  // Basic validation
  if (!driver_name || !start_location || !end_location) {
    return res.status(400).json({
      error: 'Missing required fields: driver_name, start_location, end_location'
    });
  }

  const query = `
    INSERT INTO rides (driver_name, passenger_name, start_location, end_location, distance, duration, fare, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [driver_name, passenger_name, start_location, end_location, distance, duration, fare, status];
  
  db.run(query, params, function(err) {
    if (err) {
      console.error('Error creating ride:', err.message);
      res.status(500).json({ error: 'Failed to create ride' });
    } else {
      // Fetch the created ride to return it
      db.get('SELECT * FROM rides WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          console.error('Error fetching created ride:', err.message);
          res.status(500).json({ error: 'Ride created but failed to fetch' });
        } else {
          res.status(201).json({
            success: true,
            message: 'Ride created successfully',
            data: row
          });
        }
      });
    }
  });
});

// Update a ride
app.put('/api/rides/:id', (req, res) => {
  const rideId = req.params.id;
  const {
    driver_name,
    passenger_name,
    start_location,
    end_location,
    distance,
    duration,
    fare,
    status
  } = req.body;

  // Basic validation
  if (!driver_name || !start_location || !end_location) {
    return res.status(400).json({
      error: 'Missing required fields: driver_name, start_location, end_location'
    });
  }

  const query = `
    UPDATE rides 
    SET driver_name = ?, passenger_name = ?, start_location = ?, end_location = ?, 
        distance = ?, duration = ?, fare = ?, status = ?
    WHERE id = ?
  `;
  
  const params = [driver_name, passenger_name, start_location, end_location, distance, duration, fare, status, rideId];
  
  db.run(query, params, function(err) {
    if (err) {
      console.error('Error updating ride:', err.message);
      res.status(500).json({ error: 'Failed to update ride' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Ride not found' });
    } else {
      // Fetch the updated ride to return it
      db.get('SELECT * FROM rides WHERE id = ?', [rideId], (err, row) => {
        if (err) {
          console.error('Error fetching updated ride:', err.message);
          res.status(500).json({ error: 'Ride updated but failed to fetch' });
        } else {
          res.json({
            success: true,
            message: 'Ride updated successfully',
            data: row
          });
        }
      });
    }
  });
});

// Delete a ride
app.delete('/api/rides/:id', (req, res) => {
  const rideId = req.params.id;
  const query = `DELETE FROM rides WHERE id = ?`;
  
  db.run(query, [rideId], function(err) {
    if (err) {
      console.error('Error deleting ride:', err.message);
      res.status(500).json({ error: 'Failed to delete ride' });
    } else if (this.changes === 0) {
      res.status(404).json({ error: 'Ride not found' });
    } else {
      res.json({
        success: true,
        message: 'Ride deleted successfully'
      });
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed.');
    }
    process.exit(0);
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Roadrage Offline Backend server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API endpoints: http://localhost:${PORT}/api/rides`);
});

module.exports = app;
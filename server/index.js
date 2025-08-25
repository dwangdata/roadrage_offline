const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3001;

// SQLite DB setup
const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS user_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    input TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS rides (
    rideId TEXT PRIMARY KEY,
    startTime INTEGER,
    endTime INTEGER,
    duration INTEGER,
    totalDataPoints INTEGER,
    status TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS rideDataPoints (
    id TEXT PRIMARY KEY,
    rideId TEXT,
    timestamp INTEGER,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    accuracy REAL,
    roughnessValue REAL
  )`);
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../')));

// Save a ride with vibration data
app.post('/api/rides', (req, res) => {
  const { rideId, startTime, endTime, duration, totalDataPoints, status, dataPoints } = req.body;
  console.log('Received /api/rides payload:', JSON.stringify(req.body, null, 2));
  if (!rideId || !Array.isArray(dataPoints)) {
    console.error('Invalid ride data:', req.body);
    return res.status(400).json({ error: 'Invalid ride data' });
  }
  db.run('INSERT OR REPLACE INTO rides (rideId, startTime, endTime, duration, totalDataPoints, status) VALUES (?, ?, ?, ?, ?, ?)',
    [rideId, startTime, endTime, duration, totalDataPoints, status], function(err) {
      if (err) {
        console.error('Error inserting ride:', err.message);
        return res.status(500).json({ error: err.message });
      }
      // Save data points
      const stmt = db.prepare('INSERT OR REPLACE INTO rideDataPoints (id, rideId, timestamp, latitude, longitude, altitude, accuracy, roughnessValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const dp of dataPoints) {
        try {
          stmt.run([dp.id, rideId, dp.timestamp, dp.latitude, dp.longitude, dp.altitude, dp.accuracy, dp.roughnessValue]);
        } catch (e) {
          console.error('Error inserting data point:', e.message, dp);
        }
      }
      stmt.finalize();
      res.json({ rideId });
    });
});

// Get all rides
app.get('/api/rides', (req, res) => {
  db.all('SELECT * FROM rides ORDER BY startTime DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get ride data points by rideId
app.get('/api/rides/:rideId/data', (req, res) => {
  const { rideId } = req.params;
  db.all('SELECT * FROM rideDataPoints WHERE rideId = ? ORDER BY timestamp ASC', [rideId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Save user input
app.post('/api/data', (req, res) => {
  const { input } = req.body;
  if (!input) return res.status(400).json({ error: 'Input required' });
  db.run('INSERT INTO user_data (input) VALUES (?)', [input], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, input });
  });
});

// Get all user data
app.get('/api/data', (req, res) => {
  db.all('SELECT * FROM user_data ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

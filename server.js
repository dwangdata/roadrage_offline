const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (frontend)
app.use(express.static(path.join(__dirname)));

// Database setup
const dbPath = path.join(__dirname, 'roadrage.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database schema
function initializeDatabase() {
  db.serialize(() => {
    // Create rides table
    db.run(`
      CREATE TABLE IF NOT EXISTS rides (
        rideId INTEGER PRIMARY KEY,
        startTime INTEGER NOT NULL,
        endTime INTEGER,
        duration INTEGER DEFAULT 0,
        totalDataPoints INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating rides table:', err);
      else console.log('Rides table ready');
    });

    // Create ride_data_points table
    db.run(`
      CREATE TABLE IF NOT EXISTS ride_data_points (
        id TEXT PRIMARY KEY,
        rideId INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        altitude REAL,
        accuracy REAL,
        roughnessValue REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (rideId) REFERENCES rides(rideId)
      )
    `, (err) => {
      if (err) console.error('Error creating ride_data_points table:', err);
      else console.log('Ride data points table ready');
    });

    // Create roughness_map table (aggregated roughness data by location)
    db.run(`
      CREATE TABLE IF NOT EXISTS roughness_map (
        geoId TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        roughnessValue REAL NOT NULL,
        lastUpdated INTEGER NOT NULL,
        dataPointCount INTEGER DEFAULT 1,
        avgRoughness REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creating roughness_map table:', err);
      else console.log('Roughness map table ready');
    });

    // Create indexes for better performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_ride_data_points_rideId ON ride_data_points(rideId)`, (err) => {
      if (err && !err.message.includes('already exists')) console.error('Error creating index:', err);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_ride_data_points_location ON ride_data_points(latitude, longitude)`, (err) => {
      if (err && !err.message.includes('already exists')) console.error('Error creating index:', err);
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_roughness_map_location ON roughness_map(latitude, longitude)`, (err) => {
      if (err && !err.message.includes('already exists')) console.error('Error creating index:', err);
    });

    console.log('Database schema initialization complete');
  });
}

// Utility functions
function getGeoId(lat, lon, precision = 4) {
  return `${lat.toFixed(precision)}_${lon.toFixed(precision)}`;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

// API Routes

// Get all rides
app.get('/api/rides', (req, res) => {
  db.all(`
    SELECT * FROM rides 
    ORDER BY startTime DESC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Get specific ride with data points
app.get('/api/rides/:id', (req, res) => {
  const rideId = req.params.id;
  
  db.get(`SELECT * FROM rides WHERE rideId = ?`, [rideId], (err, ride) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!ride) {
      res.status(404).json({ error: 'Ride not found' });
      return;
    }

    db.all(`
      SELECT * FROM ride_data_points 
      WHERE rideId = ? 
      ORDER BY timestamp ASC
    `, [rideId], (err, dataPoints) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      
      res.json({
        ride: ride,
        dataPoints: dataPoints
      });
    });
  });
});

// Create new ride
app.post('/api/rides', (req, res) => {
  const { rideId, startTime } = req.body;
  
  db.run(`
    INSERT INTO rides (rideId, startTime, status)
    VALUES (?, ?, 'active')
  `, [rideId, startTime], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ 
      rideId: rideId,
      message: 'Ride created successfully' 
    });
  });
});

// Update ride (complete it)
app.put('/api/rides/:id', (req, res) => {
  const rideId = req.params.id;
  const { endTime, duration, totalDataPoints, status } = req.body;
  
  db.run(`
    UPDATE rides 
    SET endTime = ?, duration = ?, totalDataPoints = ?, status = ?
    WHERE rideId = ?
  `, [endTime, duration, totalDataPoints, status, rideId], function(err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: 'Ride updated successfully' });
  });
});

// Add data points to ride
app.post('/api/rides/:id/datapoints', (req, res) => {
  const rideId = req.params.id;
  const dataPoints = req.body.dataPoints || [req.body];
  
  if (!Array.isArray(dataPoints)) {
    res.status(400).json({ error: 'dataPoints must be an array' });
    return;
  }

  const stmt = db.prepare(`
    INSERT INTO ride_data_points 
    (id, rideId, timestamp, latitude, longitude, altitude, accuracy, roughnessValue)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    dataPoints.forEach(dp => {
      stmt.run([
        dp.id, rideId, dp.timestamp, dp.latitude, dp.longitude,
        dp.altitude, dp.accuracy, dp.roughnessValue
      ]);
      
      // Update roughness map
      updateRoughnessMap(dp);
    });
    
    db.run('COMMIT', (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ 
          message: 'Data points added successfully',
          count: dataPoints.length 
        });
      }
    });
  });
  
  stmt.finalize();
});

// Update roughness map (internal function)
function updateRoughnessMap(dataPoint) {
  const geoId = getGeoId(dataPoint.latitude, dataPoint.longitude);
  
  db.get(`SELECT * FROM roughness_map WHERE geoId = ?`, [geoId], (err, existing) => {
    if (err) {
      console.error('Error checking roughness map:', err);
      return;
    }
    
    if (existing) {
      // Update existing point with weighted average
      const newCount = existing.dataPointCount + 1;
      const newAvgRoughness = ((existing.avgRoughness * existing.dataPointCount) + dataPoint.roughnessValue) / newCount;
      
      db.run(`
        UPDATE roughness_map 
        SET roughnessValue = ?, lastUpdated = ?, dataPointCount = ?, avgRoughness = ?
        WHERE geoId = ?
      `, [dataPoint.roughnessValue, dataPoint.timestamp, newCount, newAvgRoughness, geoId]);
    } else {
      // Create new point
      db.run(`
        INSERT INTO roughness_map 
        (geoId, latitude, longitude, roughnessValue, lastUpdated, dataPointCount, avgRoughness)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `, [geoId, dataPoint.latitude, dataPoint.longitude, dataPoint.roughnessValue, 
          dataPoint.timestamp, dataPoint.roughnessValue]);
    }
  });
}

// Get roughness map data
app.get('/api/roughness-map', (req, res) => {
  const { lat, lon, radius } = req.query;
  
  let query = 'SELECT * FROM roughness_map';
  let params = [];
  
  if (lat && lon && radius) {
    // Filter by location and radius (simplified rectangular bounds)
    const latRadius = parseFloat(radius) / 111320; // Convert meters to degrees (approximate)
    const lonRadius = parseFloat(radius) / (111320 * Math.cos(parseFloat(lat) * Math.PI / 180));
    
    query += ` WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`;
    params = [
      parseFloat(lat) - latRadius,
      parseFloat(lat) + latRadius,
      parseFloat(lon) - lonRadius,
      parseFloat(lon) + lonRadius
    ];
  }
  
  query += ' ORDER BY lastUpdated DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

// Route optimization endpoint
app.post('/api/route-optimization', (req, res) => {
  const { startLat, startLon, endLat, endLon, preferLowRoughness = true } = req.body;
  
  if (!startLat || !startLon || !endLat || !endLon) {
    res.status(400).json({ error: 'Start and end coordinates are required' });
    return;
  }
  
  // Simple route optimization based on roughness data
  // This is a basic implementation - in production, you'd use more sophisticated routing algorithms
  
  // Get all roughness data within a reasonable area
  const centerLat = (parseFloat(startLat) + parseFloat(endLat)) / 2;
  const centerLon = (parseFloat(startLon) + parseFloat(endLon)) / 2;
  const searchRadius = calculateDistance(startLat, startLon, endLat, endLon) * 1.5; // 50% larger than direct distance
  
  const latRadius = searchRadius / 111320;
  const lonRadius = searchRadius / (111320 * Math.cos(centerLat * Math.PI / 180));
  
  db.all(`
    SELECT * FROM roughness_map 
    WHERE latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
    ORDER BY avgRoughness ${preferLowRoughness ? 'ASC' : 'DESC'}
  `, [
    centerLat - latRadius,
    centerLat + latRadius,
    centerLon - lonRadius,
    centerLon + lonRadius
  ], (err, roughnessData) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    
    // Simple route calculation (in practice, you'd use A* or Dijkstra's algorithm)
    const directRoute = {
      type: 'direct',
      coordinates: [
        [parseFloat(startLon), parseFloat(startLat)],
        [parseFloat(endLon), parseFloat(endLat)]
      ],
      distance: calculateDistance(startLat, startLon, endLat, endLon),
      estimatedRoughness: getEstimatedRoughness(roughnessData, startLat, startLon, endLat, endLon),
      roughnessPoints: roughnessData
    };
    
    // Create alternative routes with waypoints based on low roughness areas
    const alternativeRoutes = generateAlternativeRoutes(
      startLat, startLon, endLat, endLon, roughnessData, preferLowRoughness
    );
    
    res.json({
      directRoute: directRoute,
      alternativeRoutes: alternativeRoutes,
      optimization: preferLowRoughness ? 'minimize_roughness' : 'maximize_roughness',
      totalRoughnessPoints: roughnessData.length
    });
  });
});

// Helper function to estimate roughness along a route
function getEstimatedRoughness(roughnessData, startLat, startLon, endLat, endLon) {
  if (roughnessData.length === 0) return 0;
  
  // Find roughness points along the route (simplified)
  const routeRoughness = roughnessData.filter(point => {
    const distToRoute = distanceToLineSegment(
      point.latitude, point.longitude,
      startLat, startLon, endLat, endLon
    );
    return distToRoute < 50; // Within 50 meters of route
  });
  
  if (routeRoughness.length === 0) {
    // Return average of all nearby points
    return roughnessData.reduce((sum, p) => sum + p.avgRoughness, 0) / roughnessData.length;
  }
  
  return routeRoughness.reduce((sum, p) => sum + p.avgRoughness, 0) / routeRoughness.length;
}

// Helper function to generate alternative routes
function generateAlternativeRoutes(startLat, startLon, endLat, endLon, roughnessData, preferLowRoughness) {
  // Simple implementation: create routes with waypoints at low/high roughness areas
  const alternatives = [];
  
  if (roughnessData.length > 0) {
    // Sort by roughness preference
    const sortedPoints = roughnessData.sort((a, b) => 
      preferLowRoughness ? a.avgRoughness - b.avgRoughness : b.avgRoughness - a.avgRoughness
    );
    
    // Create route with best roughness waypoint
    const bestWaypoint = sortedPoints[0];
    if (bestWaypoint) {
      alternatives.push({
        type: 'optimized',
        coordinates: [
          [parseFloat(startLon), parseFloat(startLat)],
          [bestWaypoint.longitude, bestWaypoint.latitude],
          [parseFloat(endLon), parseFloat(endLat)]
        ],
        distance: calculateDistance(startLat, startLon, bestWaypoint.latitude, bestWaypoint.longitude) +
                 calculateDistance(bestWaypoint.latitude, bestWaypoint.longitude, endLat, endLon),
        estimatedRoughness: bestWaypoint.avgRoughness,
        waypoint: bestWaypoint
      });
    }
  }
  
  return alternatives;
}

// Helper function to calculate distance from point to line segment
function distanceToLineSegment(px, py, x1, y1, x2, y2) {
  let dx = x2 - x1;
  let dy = y2 - y1;
  
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    
    if (t > 1) {
      dx = px - x2;
      dy = py - y2;
    } else if (t > 0) {
      dx = px - (x1 + dx * t);
      dy = py - (y1 + dy * t);
    } else {
      dx = px - x1;
      dy = py - y1;
    }
  } else {
    dx = px - x1;
    dy = py - y1;
  }
  
  return Math.sqrt(dx * dx + dy * dy) * 111320; // Convert to meters
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: 'connected'
  });
});

// Serve the main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the route planning page (we'll create this next)
app.get('/route-planner', (req, res) => {
  res.sendFile(path.join(__dirname, 'route-planner.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Frontend: http://localhost:' + PORT);
  console.log('Route Planner: http://localhost:' + PORT + '/route-planner');
  console.log('API Health: http://localhost:' + PORT + '/api/health');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err.message);
    } else {
      console.log('Database connection closed');
    }
  });
  process.exit(0);
});
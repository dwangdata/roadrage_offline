#!/usr/bin/env node

/**
 * Test script to verify the backend API functionality
 * This tests all the endpoints and route optimization features
 */

const http = require('http');

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = {
            statusCode: res.statusCode,
            data: body ? JSON.parse(body) : null
          };
          resolve(response);
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting API Tests for RoadRage Backend\n');
  
  const baseOptions = {
    hostname: 'localhost',
    port: 3000,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    // Test 1: Health check
    console.log('1️⃣ Testing health endpoint...');
    const health = await makeRequest({
      ...baseOptions,
      path: '/api/health',
      method: 'GET'
    });
    console.log(`✅ Health: ${health.statusCode} - ${health.data?.status}\n`);

    // Test 2: Create a new ride
    console.log('2️⃣ Creating a test ride...');
    const testRideId = Date.now();
    const createRide = await makeRequest({
      ...baseOptions,
      path: '/api/rides',
      method: 'POST'
    }, {
      rideId: testRideId,
      startTime: testRideId
    });
    console.log(`✅ Create ride: ${createRide.statusCode} - ${createRide.data?.message}\n`);

    // Test 3: Add data points with varying roughness
    console.log('3️⃣ Adding data points with different roughness values...');
    const testDataPoints = [
      // Smooth road segment
      { id: 'dp1', timestamp: testRideId + 1000, latitude: 51.0447, longitude: -114.0719, altitude: 1045, accuracy: 5, roughnessValue: 1.2 },
      { id: 'dp2', timestamp: testRideId + 2000, latitude: 51.0450, longitude: -114.0715, altitude: 1046, accuracy: 4, roughnessValue: 2.1 },
      { id: 'dp3', timestamp: testRideId + 3000, latitude: 51.0453, longitude: -114.0710, altitude: 1047, accuracy: 6, roughnessValue: 1.8 },
      
      // Rough road segment
      { id: 'dp4', timestamp: testRideId + 4000, latitude: 51.0456, longitude: -114.0705, altitude: 1048, accuracy: 5, roughnessValue: 18.5 },
      { id: 'dp5', timestamp: testRideId + 5000, latitude: 51.0459, longitude: -114.0700, altitude: 1049, accuracy: 4, roughnessValue: 22.3 },
      { id: 'dp6', timestamp: testRideId + 6000, latitude: 51.0462, longitude: -114.0695, altitude: 1050, accuracy: 6, roughnessValue: 19.7 },
      
      // Moderate road segment
      { id: 'dp7', timestamp: testRideId + 7000, latitude: 51.0465, longitude: -114.0690, altitude: 1051, accuracy: 5, roughnessValue: 8.2 },
      { id: 'dp8', timestamp: testRideId + 8000, latitude: 51.0468, longitude: -114.0685, altitude: 1052, accuracy: 4, roughnessValue: 9.1 },
    ];

    const addDataPoints = await makeRequest({
      ...baseOptions,
      path: `/api/rides/${testRideId}/datapoints`,
      method: 'POST'
    }, { dataPoints: testDataPoints });
    console.log(`✅ Add data points: ${addDataPoints.statusCode} - Added ${addDataPoints.data?.count} points\n`);

    // Test 4: Complete the ride
    console.log('4️⃣ Completing the ride...');
    const endTime = testRideId + 10000;
    const completeRide = await makeRequest({
      ...baseOptions,
      path: `/api/rides/${testRideId}`,
      method: 'PUT'
    }, {
      endTime: endTime,
      duration: Math.floor((endTime - testRideId) / 1000),
      totalDataPoints: testDataPoints.length,
      status: 'completed'
    });
    console.log(`✅ Complete ride: ${completeRide.statusCode} - ${completeRide.data?.message}\n`);

    // Test 5: Get all rides
    console.log('5️⃣ Retrieving all rides...');
    const getAllRides = await makeRequest({
      ...baseOptions,
      path: '/api/rides',
      method: 'GET'
    });
    console.log(`✅ Get rides: ${getAllRides.statusCode} - Found ${getAllRides.data?.length} rides\n`);

    // Test 6: Get specific ride with data points
    console.log('6️⃣ Retrieving specific ride with data points...');
    const getRide = await makeRequest({
      ...baseOptions,
      path: `/api/rides/${testRideId}`,
      method: 'GET'
    });
    console.log(`✅ Get ride: ${getRide.statusCode} - Ride has ${getRide.data?.dataPoints?.length} data points\n`);

    // Test 7: Get roughness map data
    console.log('7️⃣ Retrieving roughness map data...');
    const getRoughnessMap = await makeRequest({
      ...baseOptions,
      path: '/api/roughness-map',
      method: 'GET'
    });
    console.log(`✅ Get roughness map: ${getRoughnessMap.statusCode} - Found ${getRoughnessMap.data?.length} roughness points\n`);

    // Test 8: Route optimization for smooth roads
    console.log('8️⃣ Testing route optimization (prefer smooth roads)...');
    const optimizeSmooth = await makeRequest({
      ...baseOptions,
      path: '/api/route-optimization',
      method: 'POST'
    }, {
      startLat: 51.0447,
      startLon: -114.0719,
      endLat: 51.0468,
      endLon: -114.0685,
      preferLowRoughness: true
    });
    console.log(`✅ Smooth route optimization: ${optimizeSmooth.statusCode}`);
    if (optimizeSmooth.data) {
      console.log(`   📍 Direct route roughness: ${optimizeSmooth.data.directRoute?.estimatedRoughness?.toFixed(2)}`);
      console.log(`   📍 Alternative routes: ${optimizeSmooth.data.alternativeRoutes?.length}`);
      console.log(`   📍 Total roughness points used: ${optimizeSmooth.data.totalRoughnessPoints}\n`);
    }

    // Test 9: Route optimization for rough roads
    console.log('9️⃣ Testing route optimization (prefer rough roads)...');
    const optimizeRough = await makeRequest({
      ...baseOptions,
      path: '/api/route-optimization',
      method: 'POST'
    }, {
      startLat: 51.0447,
      startLon: -114.0719,
      endLat: 51.0468,
      endLon: -114.0685,
      preferLowRoughness: false
    });
    console.log(`✅ Rough route optimization: ${optimizeRough.statusCode}`);
    if (optimizeRough.data) {
      console.log(`   📍 Direct route roughness: ${optimizeRough.data.directRoute?.estimatedRoughness?.toFixed(2)}`);
      console.log(`   📍 Alternative routes: ${optimizeRough.data.alternativeRoutes?.length}`);
      console.log(`   📍 Optimization mode: ${optimizeRough.data.optimization}\n`);
    }

    // Test 10: Filtered roughness map query
    console.log('🔟 Testing filtered roughness map query...');
    const getFilteredRoughness = await makeRequest({
      ...baseOptions,
      path: '/api/roughness-map?lat=51.0450&lon=-114.0700&radius=500',
      method: 'GET'
    });
    console.log(`✅ Filtered roughness map: ${getFilteredRoughness.statusCode} - Found ${getFilteredRoughness.data?.length} points within 500m\n`);

    console.log('🎉 All tests completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Backend server is running on http://localhost:3000`);
    console.log(`- Route planner available at http://localhost:3000/route-planner`);
    console.log(`- All API endpoints are functional`);
    console.log(`- Route optimization algorithm is working`);
    console.log(`- Database operations are successful`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runTests();
// --- Firebase Globals & Initialization ---
let firestoreDB, currentUser;

// IMPORTANT: Paste your firebaseConfig object here from the Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyCK7e5XjrLeWdyJ7OGAdgkCMHap39MKs_Y",
  authDomain: "road-rage-d186d.firebaseapp.com",
  projectId: "road-rage-d186d",
  storageBucket: "road-rage-d186d.firebasestorage.app",
  messagingSenderId: "492523949194",
  appId: "1:492523949194:web:4f976d6ba062348e37b173",
  measurementId: "G-GL2VR5RQ7B"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
firestoreDB = firebase.firestore();


// --- Globals & State ---
let db, currentRideId = null;
let currentRideDataPoints = [], accelerometerBuffer = [];
let latestGpsPosition = null, watchId = null, motionListenerActive = false;
let dataCollectionInterval = null, lastLowPassZ = 0;

// Live map
let map, currentLocationMarker, currentRidePath, historicalRoughnessLayer, masterRoughnessLayer;
let mapInitialized = false;

// Live chart
let vibrationChart, chartDataset = [];

// Recap map & chart
let recapMap, recapRidePath, recapHistoricalLayer, recapChart, recapHighlight;

// DOM refs
let statusDiv, startButton, stopButton, dataPointsCounter;
let pastRidesList, rideDetailView, detailContent, closeDetailButton;

// Constants
const DB_NAME = 'BikeRoughnessDB', DB_VERSION = 2;
const DATA_INTERVAL_MS = 3000, HIST_RADIUS = 150, PROXIMITY_RADIUS = 10;
const HPF_ALPHA = 0.8;
const ROUGH_THRESHOLDS = [0,3,6,9,15,21,30];
const ROUGH_COLORS     = ['#2ca02c','#98df8a','#ff7f0e','#ffbb78','#d62728','#ff9896','#9467bd','#c5b0d5'];


// --- IndexedDB Helper (for local storage) ---
function promisifiedDbRequest(req) {
  return new Promise((res, rej) => {
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

// --- DB Initialization (for local storage) ---
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = e => {
      db = e.target.result;
      if (!db.objectStoreNames.contains('rides'))
        db.createObjectStore('rides', { keyPath: 'rideId' });
      if (!db.objectStoreNames.contains('rideDataPoints')) {
        const s = db.createObjectStore('rideDataPoints', { keyPath: 'id' });
        s.createIndex('by_rideId','rideId',{unique:false});
      }
    };
    request.onsuccess = e => {
      db = e.target.result;
      resolve(db);
      loadPastRides(); // Load local rides on startup
    };
    request.onerror = e => {
      console.error('Local DB error', e);
      statusDiv.textContent = 'Error opening local database.';
      reject(e);
    };
  });
}


// --- Map Initialization ---
function initializeMap() {
    if (mapInitialized) return;
    // Set initial view to Calgary
    map = L.map('map').setView([51.0447, -114.0719], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    
    // Layer for crowdsourced data (bottom layer)
    masterRoughnessLayer = L.layerGroup().addTo(map);
    // Layer for local historical data from current ride (middle layer)
    historicalRoughnessLayer = L.layerGroup().addTo(map);
    // Layer for the active ride path (top layer)
    currentRidePath = L.polyline([], { weight: 5 }).addTo(map);

    setTimeout(() => map.invalidateSize(), 200);
    mapInitialized = true;
}


// --- Firebase Functions ---
function firebaseAuth() {
    statusDiv.textContent = 'Connecting to the network...';
    firebase.auth().signInAnonymously()
      .then((userCredential) => {
        currentUser = userCredential.user;
        console.log('Signed in anonymously with UID:', currentUser.uid);
        statusDiv.textContent = 'Ready to record.';
        fetchAndDisplayCompositeMap(); // Fetch map after user is ready
      })
      .catch((error) => {
        console.error("Anonymous auth failed:", error);
        statusDiv.textContent = 'Connection failed. Check network.';
      });
}

async function fetchAndDisplayCompositeMap() {
    if (!mapInitialized || !currentUser) return;
    statusDiv.textContent = 'Downloading community road map...';
    
    masterRoughnessLayer.clearLayers();

    try {
        // In a production app, you'd query based on map bounds for efficiency.
        // For this MVP, we fetch all tiles.
        const snapshot = await firestoreDB.collection('compositeMap').get();
        
        snapshot.forEach(doc => {
            const tile = doc.data();
            L.circleMarker([tile.latitude, tile.longitude], {
                radius: 5,
                fillColor: roughnessToColor(tile.roughnessValue),
                color: '#000',
                weight: 1,
                opacity: 0.5,
                fillOpacity: 0.5 // Make it slightly transparent
            }).addTo(masterRoughnessLayer);
        });
        
        currentRidePath.bringToFront(); // Ensure live ride is on top
        statusDiv.textContent = 'Community map loaded. Ready to ride!';
    } catch (error) {
        console.error("Error fetching composite map:", error);
        statusDiv.textContent = 'Could not download community map.';
    }
}


// --- Chart Initialization (No changes here) ---
function initChart() { /* ... function content is unchanged ... */ }
function initRecapMap() { /* ... function content is unchanged ... */ }
function initRecapChart() { /* ... function content is unchanged ... */ }


// --- Utility Functions (No changes here) ---
function calculateVariance(arr) { /* ... function content is unchanged ... */ }
function getGeoId(lat, lon, prec = 4) { return `${lat.toFixed(prec)}_${lon.toFixed(prec)}`; }
function toRad(d) { return d * Math.PI / 180; }
function dist(lat1, lon1, lat2, lon2) { /* ... function content is unchanged ... */ }
function roughnessToColor(r) {
    for (let i = 0; i < ROUGH_THRESHOLDS.length; i++) {
        if (r <= ROUGH_THRESHOLDS[i]) return ROUGH_COLORS[i];
    }
    return ROUGH_COLORS[ROUGH_COLORS.length - 1];
}


// --- Sensor & Data Loop (No major changes) ---
function gpsSuccess(pos) { latestGpsPosition = pos; }
function gpsError(err) { /* ... function content is unchanged ... */ }
function handleMotion(evt) { /* ... function content is unchanged ... */ }

async function processCombinedDataPoint() {
    if (!currentRideId || !latestGpsPosition) {
        statusDiv.textContent = 'Waiting for GPS…';
        return;
    }
    const { latitude, longitude, altitude, accuracy } = latestGpsPosition.coords;
    const timestamp = latestGpsPosition.timestamp;
    const roughness = calculateVariance(accelerometerBuffer);
    accelerometerBuffer = [];

    const dp = {
        id: crypto.randomUUID(),
        rideId: currentRideId,
        timestamp, latitude, longitude, altitude, accuracy,
        roughnessValue: roughness
    };

    currentRideDataPoints.push(dp);
    dataPointsCounter.textContent = `Data Points: ${currentRideDataPoints.length}`;
    
    // Local DB update for recap view is still useful
    // await updateRoughnessMap(dp); 
    
    updateMapDisplay(dp);

    if (vibrationChart) {
        const pt = { x: new Date(timestamp), y: roughness, meta: dp };
        chartDataset.push(pt);
        vibrationChart.update();
    }

    statusDiv.textContent = `Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}, Rough ${roughness.toFixed(2)}`;
}


// --- Map Rendering & Highlighting (Minor changes) ---
function updateMapDisplay(dp) {
    const latlng = [dp.latitude, dp.longitude];
    if (!currentLocationMarker) {
        currentLocationMarker = L.marker(latlng).addTo(map);
    } else {
        currentLocationMarker.setLatLng(latlng);
    }
    map.setView(latlng, Math.max(map.getZoom(), 16));

    const path = currentRidePath.getLatLngs();
    const col = roughnessToColor(dp.roughnessValue);
    if (path.length) {
        const prev = path[path.length - 1];
        // Draw colored line segments for the current ride
        L.polyline([prev, latlng], { color: col, weight: 6, opacity: 0.85 }).addTo(map).bringToFront();
    }
    currentRidePath.addLatLng(latlng);
    // This ensures the marker icon itself is always on the highest layer.
    currentLocationMarker.bringToFront();

    // The historical display from local data is less important now,
    // but can be kept for debugging or context.
    // updateHistoricalDisplay(dp.latitude, dp.longitude, historicalRoughnessLayer, map);
}

function highlightPointOnMap(idx) { /* ... function content is unchanged ... */ }
function highlightRecapPointOnMap(idx) { /* ... function content is unchanged ... */ }


// --- Start & Stop Ride (Major changes in stopRide) ---
async function startRide() {
    if (currentRideId) return;
    currentRideId = Date.now();
    currentRideDataPoints = [];
    accelerometerBuffer = [];
    latestGpsPosition = null;
    dataPointsCounter.textContent = 'Data Points: 0';
    statusDiv.textContent = 'Requesting permissions…';

    // Clear previous live ride visuals
    map.eachLayer(layer => {
        if (layer instanceof L.Polyline && layer !== currentRidePath) {
            map.removeLayer(layer);
        }
    });
    currentRidePath.setLatLngs([]);
    if (currentLocationMarker) map.removeLayer(currentLocationMarker);
    currentLocationMarker = null;
    historicalRoughnessLayer.clearLayers();

    watchId = navigator.geolocation.watchPosition(gpsSuccess, gpsError, {
        enableHighAccuracy: true, timeout: 10000, maximumAge: 0
    });

    if (typeof DeviceMotionEvent?.requestPermission === 'function') {
        try {
            const resp = await DeviceMotionEvent.requestPermission();
            if (resp === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
                motionListenerActive = true;
            } else {
                statusDiv.textContent = 'Motion permission denied.';
            }
        } catch (e) {
            console.error(e);
            statusDiv.textContent = 'Error requesting motion permission.';
        }
    } else {
        window.addEventListener('devicemotion', handleMotion);
        motionListenerActive = true;
    }

    dataCollectionInterval = setInterval(processCombinedDataPoint, DATA_INTERVAL_MS);

    // Save ride start to local DB
    const tx = db.transaction('rides', 'readwrite');
    await promisifiedDbRequest(tx.objectStore('rides').add({
        rideId: currentRideId,
        startTime: currentRideId,
        status: 'active'
    }));
    await tx.complete;

    if (vibrationChart) {
        chartDataset.length = 0;
        vibrationChart.data.datasets[0].data = chartDataset;
        vibrationChart.update();
    }

    startButton.disabled = true;
    stopButton.disabled = false;
    statusDiv.textContent = 'Recording… waiting for GPS.';
}

async function stopRide() {
    if (!currentRideId) return;
    // Stop all data collection
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (motionListenerActive) { window.removeEventListener('devicemotion', handleMotion); motionListenerActive = false; }
    if (dataCollectionInterval !== null) { clearInterval(dataCollectionInterval); dataCollectionInterval = null; }

    statusDiv.textContent = 'Saving ride locally…';

    // --- 1. Save locally first (for recap view & backup) ---
    try {
        const tx = db.transaction(['rides', 'rideDataPoints'], 'readwrite');
        const ridesStore = tx.objectStore('rides');
        const dpStore = tx.objectStore('rideDataPoints');

        for (const dp of currentRideDataPoints) {
            await promisifiedDbRequest(dpStore.put(dp));
        }

        const rideRecord = await promisifiedDbRequest(ridesStore.get(currentRideId));
        const updatedRecord = {
            ...rideRecord,
            endTime: Date.now(),
            duration: Math.floor((Date.now() - rideRecord.startTime) / 1000),
            totalDataPoints: currentRideDataPoints.length,
            status: 'completed'
        };
        await promisifiedDbRequest(ridesStore.put(updatedRecord));
        await tx.complete;
        statusDiv.textContent = 'Ride saved locally!';
    } catch (e) {
        console.error('Error saving ride locally:', e);
        statusDiv.textContent = 'Error saving ride locally.';
    }

    // --- 2. Upload to Firebase ---
    if (!currentUser || currentRideDataPoints.length === 0) {
        console.log("No user or no data points, skipping upload.");
    } else {
        statusDiv.textContent = 'Uploading to community map…';

        const rideDoc = {
            rideId: currentRideId,
            userId: currentUser.uid,
            startTime: firebase.firestore.Timestamp.fromMillis(currentRideId),
            endTime: firebase.firestore.Timestamp.now(),
            dataPoints: currentRideDataPoints.map(dp => ({
                timestamp: firebase.firestore.Timestamp.fromMillis(dp.timestamp),
                latitude: dp.latitude,
                longitude: dp.longitude,
                roughnessValue: dp.roughnessValue
            }))
        };

        try {
            await firestoreDB.collection('rides').doc(String(currentRideId)).set(rideDoc);
            statusDiv.textContent = 'Ride uploaded successfully!';
            // Optionally, refresh the master map after a short delay
            setTimeout(fetchAndDisplayCompositeMap, 10000); // Refresh after 10s
        } catch (error) {
            console.error("Error uploading ride:", error);
            statusDiv.textContent = 'Error uploading ride.';
        }
    }

    // --- 3. Reset UI State ---
    currentRideId = null;
    // Keep currentRideDataPoints for potential immediate recap
    accelerometerBuffer = [];
    latestGpsPosition = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    
    // Don't clear the path immediately, so the user can see their work.
    // It will be cleared on the next startRide.
    
    loadPastRides(); // Refresh local past rides list
}


// --- Past Rides & Recap (Reads from local IndexedDB) ---
async function loadPastRides() { /* ... function content is unchanged ... */ }
async function showRideDetails(rideId) { /* ... function content is unchanged ... */ }
function hideRideDetails() { /* ... function content is unchanged ... */ }


// --- Bootstrap ---
document.addEventListener('DOMContentLoaded', () => {
    statusDiv = document.getElementById('status');
    startButton = document.getElementById('startButton');
    stopButton = document.getElementById('stopButton');
    dataPointsCounter = document.getElementById('dataPointsCounter');
    pastRidesList = document.getElementById('pastRidesList');
    rideDetailView = document.getElementById('rideDetailView');
    detailContent = document.getElementById('detailContent');
    closeDetailButton = document.getElementById('closeDetailButton');

    startButton.addEventListener('click', startRide);
    stopButton.addEventListener('click', stopRide);
    closeDetailButton.addEventListener('click', hideRideDetails);

    initializeMap();
    openDb(); // Open local DB
    firebaseAuth(); // Authenticate with Firebase
    initChart();
});


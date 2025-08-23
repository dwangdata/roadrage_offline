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
const GPS_ACCURACY_THRESHOLD = 50; // Don't accept GPS points with accuracy > 50 meters


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


// --- Chart Initialization ---
function initChart() {
  const canvas = document.getElementById('vibrationChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  vibrationChart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [{ label: 'Vibration', data: chartDataset, pointRadius: 4, borderWidth: 2, tension: 0.3 }] },
    options: {
      parsing: { xAxisKey: 'x', yAxisKey: 'y' },
      scales: {
        x: { type: 'time', time: { tooltipFormat: 'HH:mm:ss' } },
        y: { beginAtZero: true }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `Roughness: ${ctx.parsed.y.toFixed(2)}`,
            afterBody: ctx => {
              const dp = chartDataset[ctx[0].dataIndex].meta;
              return `Lat: ${dp.latitude.toFixed(5)}, Lon: ${dp.longitude.toFixed(5)}`;
            }
          }
        }
      },
      onHover: (_, items) => {
        if (items.length) highlightPointOnMap(items[0].dataIndex);
      }
    }
  });
}

function initRecapMap() {
  if (recapMap) recapMap.remove();
  recapMap = L.map('recapMap').setView([51.0447, -114.0719], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(recapMap);
  setTimeout(() => recapMap.invalidateSize(), 200);
  recapHistoricalLayer = L.layerGroup().addTo(recapMap);
  recapRidePath = L.polyline([], { weight: 5 }).addTo(recapMap);
}

function initRecapChart() {
  const canvas = document.getElementById('recapChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (recapChart) recapChart.destroy();
  recapChart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [{ label: 'Vibration', data: [], pointRadius: 4, borderWidth: 2, tension: 0.3 }] },
    options: {
      parsing: { xAxisKey: 'x', yAxisKey: 'y' },
      scales: {
        x: { type: 'time', time: { tooltipFormat: 'HH:mm:ss' } },
        y: { beginAtZero: true }
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: ctx => `Roughness: ${ctx.parsed.y.toFixed(2)}`,
            afterBody: ctx => {
              const dp = recapChart.data.datasets[0].data[ctx[0].dataIndex].meta;
              return `Lat: ${dp.latitude.toFixed(5)}, Lon: ${dp.longitude.toFixed(5)}`;
            }
          }
        }
      },
      onHover: (_, items) => {
        if (items.length) highlightRecapPointOnMap(items[0].dataIndex);
      }
    }
  });
}


// --- Utility Functions (No changes needed) ---
function calculateVariance(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}
function getGeoId(lat, lon, prec = 4) { return `${lat.toFixed(prec)}_${lon.toFixed(prec)}`; }
function toRad(d) { return d * Math.PI / 180; }
function dist(lat1, lon1, lat2, lon2) {
  const R = 6371e3,
        φ1 = toRad(lat1), φ2 = toRad(lat2),
        dφ = toRad(lat2 - lat1), dλ = toRad(lon2 - lon1),
        a = Math.sin(dφ/2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function roughnessToColor(r) {
    for (let i = 0; i < ROUGH_THRESHOLDS.length; i++) {
        if (r <= ROUGH_THRESHOLDS[i]) return ROUGH_COLORS[i];
    }
    return ROUGH_COLORS[ROUGH_COLORS.length - 1];
}


// --- Sensor & Data Loop (GPS Accuracy Fix) ---
function gpsSuccess(pos) {
    const accuracy = pos.coords.accuracy;
    
    // Provide continuous feedback on GPS quality while a ride is active.
    if (currentRideId) {
        statusDiv.textContent = `Acquiring GPS signal (Accuracy: ${accuracy.toFixed(0)}m)`;
    }

    // Only accept positions that meet our accuracy threshold.
    // This prevents recording data with wildly inaccurate locations.
    if (accuracy < GPS_ACCURACY_THRESHOLD) {
        latestGpsPosition = pos;
        // The processCombinedDataPoint interval will now pick this up.
    }
}

function gpsError(err) {
  const msgs = {1:'Permission denied',2:'Unavailable',3:'Timed out'};
  statusDiv.textContent = `GPS Error: ${msgs[err.code] || 'Unknown'}.`;
  if (err.code === 1) stopRide();
}

function handleMotion(evt) {
  const z = evt.accelerationIncludingGravity?.z;
  if (typeof z === 'number') {
    lastLowPassZ = HPF_ALPHA * lastLowPassZ + (1 - HPF_ALPHA) * z;
    accelerometerBuffer.push(z - lastLowPassZ);
  }
}

async function processCombinedDataPoint() {
    // This check is crucial. It won't pass until gpsSuccess provides a good position.
    if (!currentRideId || !latestGpsPosition) {
        return; // Silently wait for a good GPS signal.
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
    
    updateMapDisplay(dp);

    if (vibrationChart) {
        const pt = { x: new Date(timestamp), y: roughness, meta: dp };
        chartDataset.push(pt);
        vibrationChart.update();
    }

    // Update status with useful info now that we are recording.
    statusDiv.textContent = `Recording | Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}, Rough ${roughness.toFixed(2)}`;
}


// --- Map Rendering & Highlighting ---
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
        // Draw colored line segments for the current ride.
        L.polyline([prev, latlng], { color: col, weight: 6, opacity: 0.85 }).addTo(map);
    }
    currentRidePath.addLatLng(latlng);
    
    // Safely bring marker to the front if it exists.
    if (currentLocationMarker && currentLocationMarker.bringToFront) {
        currentLocationMarker.bringToFront();
    }
}

function highlightPointOnMap(idx) {
  if (!chartDataset[idx]) return;
  const dp = chartDataset[idx].meta;
  if (recapHighlight) map.removeLayer(recapHighlight);
  recapHighlight = L.circleMarker([dp.latitude, dp.longitude], {
    radius: 10, color: '#f00', weight: 2, fill: false
  }).addTo(map);
  setTimeout(() => { if (map && recapHighlight) map.removeLayer(recapHighlight); }, 3000);
}

function highlightRecapPointOnMap(idx) {
  const data = recapChart?.data?.datasets[0]?.data;
  if (!data || !data[idx]) return;
  const dp = data[idx].meta;
  if (recapHighlight) recapMap.removeLayer(recapHighlight);
  recapHighlight = L.circleMarker([dp.latitude, dp.longitude], {
    radius: 10, color: '#f00', weight: 2, fill: false
  }).addTo(recapMap);
  setTimeout(() => { if (recapMap && recapHighlight) recapMap.removeLayer(recapHighlight); }, 3000);
}


// --- Start & Stop Ride ---
async function startRide() {
    if (currentRideId) return;
    currentRideId = Date.now();
    currentRideDataPoints = [];
    accelerometerBuffer = [];
    latestGpsPosition = null; // Reset position at start.
    dataPointsCounter.textContent = 'Data Points: 0';
    statusDiv.textContent = 'Requesting permissions…';

    // Clear previous live ride visuals.
    map.eachLayer(layer => {
        if (layer instanceof L.Polyline && layer !== currentRidePath) {
            map.removeLayer(layer);
        }
    });
    currentRidePath.setLatLngs([]);
    if (currentLocationMarker) {
        map.removeLayer(currentLocationMarker);
        currentLocationMarker = null;
    }
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

    // Save ride start to local DB.
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
    statusDiv.textContent = 'Recording… waiting for accurate GPS.';
}

async function stopRide() {
    if (!currentRideId) return;
    // Stop all data collection.
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
            dataPoints: currentRideDataPoints
              // Filter out any bad data points before uploading.
              .filter(dp => dp.latitude != null && dp.longitude != null && !isNaN(dp.roughnessValue))
              // Map to the correct Firestore data structure.
              .map(dp => ({
                timestamp: firebase.firestore.Timestamp.fromMillis(dp.timestamp),
                location: new firebase.firestore.GeoPoint(dp.latitude, dp.longitude),
                roughnessValue: dp.roughnessValue
              }))
        };

        try {
            await firestoreDB.collection('rides').doc(String(currentRideId)).set(rideDoc);
            statusDiv.textContent = 'Ride uploaded successfully!';
            // Refresh the master map after a short delay to see updates.
            setTimeout(fetchAndDisplayCompositeMap, 10000);
        } catch (error) {
            console.error("Error uploading ride:", error);
            statusDiv.textContent = 'Error uploading ride.';
        }
    }

    // --- 3. Reset UI State ---
    currentRideId = null;
    accelerometerBuffer = [];
    latestGpsPosition = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    
    loadPastRides(); // Refresh local past rides list.
}


// --- Past Rides & Recap (Reads from local IndexedDB) ---
async function loadPastRides() {
  pastRidesList.innerHTML = '';
  if (!db) return;
  try {
    const all = await promisifiedDbRequest(db.transaction('rides','readonly').objectStore('rides').getAll());
    if (!all.length) {
      pastRidesList.innerHTML = '<li>No past rides recorded.</li>';
      return;
    }
    all.sort((a,b)=>b.startTime - a.startTime).forEach(r => {
      const li = document.createElement('li');
      const start = new Date(r.startTime).toLocaleString();
      const m = Math.floor(r.duration/60), s = r.duration%60;
      li.innerHTML = `
        <strong>Start:</strong> ${start}<br>
        <strong>Duration:</strong> ${m}m ${s}s<br>
        <strong>Points:</strong> ${r.totalDataPoints}
      `;
      li.onclick = () => showRideDetails(r.rideId);
      pastRidesList.appendChild(li);
    });
  } catch (e) {
    console.error(e);
    statusDiv.textContent = 'Error loading past rides.';
  }
}

async function showRideDetails(rideId) {
  rideDetailView.classList.remove('hidden');
  detailContent.textContent = 'Loading…';

  initRecapMap();
  initRecapChart();

  const tx = db.transaction(['rides','rideDataPoints'],'readonly');
  const rideRec = await promisifiedDbRequest(tx.objectStore('rides').get(rideId));
  let dps = await promisifiedDbRequest(
    tx.objectStore('rideDataPoints').index('by_rideId').getAll(rideId)
  );
  await tx.complete;

  if (!rideRec || !Array.isArray(dps) || dps.length === 0) {
    detailContent.textContent = 'No data for this ride.';
    return;
  }
  
  dps.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  const chartData = dps.map(dp => ({
    x: new Date(dp.timestamp),
    y: dp.roughnessValue,
    meta: dp
  }));
  
  if (recapChart) {
    recapChart.data.datasets[0].data = chartData;
    recapChart.update();
  }

  recapRidePath.setLatLngs([]);
  recapHistoricalLayer.clearLayers();
  dps.forEach(dp => {
    const latlng = [dp.latitude, dp.longitude];
    const pts = recapRidePath.getLatLngs();
    const col = roughnessToColor(dp.roughnessValue);
    if (pts.length) {
      const prev = pts[pts.length - 1];
      L.polyline([prev, latlng], { color: col, weight: 5 }).addTo(recapMap);
    }
    recapRidePath.addLatLng(latlng);
  });

  if (dps.length > 0) {
    const bounds = L.latLngBounds(dps.map(dp => [dp.latitude, dp.longitude]));
    recapMap.fitBounds(bounds);
  }

  let txt = `Ride ID: ${rideRec.rideId}\n` +
            `Start: ${new Date(rideRec.startTime).toLocaleString()}\n` +
            `End: ${new Date(rideRec.endTime).toLocaleString()}\n` +
            `Duration: ${Math.floor(rideRec.duration/60)}m ${rideRec.duration%60}s\n` +
            `Points: ${rideRec.totalDataPoints}\n\n— Data Points —\n`;
  dps.forEach(dp => {
    txt += `${new Date(dp.timestamp).toLocaleTimeString()} | ` +
           `Lat ${dp.latitude.toFixed(5)}, Lon ${dp.longitude.toFixed(5)} | ` +
           `Rough ${dp.roughnessValue.toFixed(3)}\n`;
  });
  detailContent.textContent = txt;
}

function hideRideDetails() {
  rideDetailView.classList.add('hidden');
  detailContent.textContent = '';
}


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

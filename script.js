// --- Globals & State ---
let db, currentRideId = null;
let currentRideDataPoints = [], accelerometerBuffer = [];
let latestGpsPosition = null, watchId = null, motionListenerActive = false;
let dataCollectionInterval = null, lastLowPassZ = 0;

// Visible Leaflet map (full UI)
let map, currentLocationMarker, currentRidePath, historicalRoughnessLayer;
let mapInitialized = false;

// Live chart
let vibrationChart, chartDataset = [];

// Recap map & chart
let recapMap, recapRidePath, recapHistoricalLayer, recapChart, recapHighlight;

// DOM refs
let statusDiv, startButton, stopButton, dataPointsCounter, deleteDataButton, bellButton;
let pastRidesList, rideDetailView, detailContent, closeDetailButton;

// Audio (recorded UI sounds)
let bellSound, voiceSound;

// Constants
const DB_NAME = 'BikeRoughnessDB', DB_VERSION = 2;
const DATA_INTERVAL_MS = 3000, HIST_RADIUS = 150;
const HPF_ALPHA = 0.8;
const ROUGH_THRESHOLDS = [0,3,6,9,15,21,30];
const ROUGH_COLORS     = ['#ffffff','#dddddd','#bbbbbb','#999999','#777777','#555555','#333333','#000000'];

// --- Media / Recording Globals ---
let viewfinderEl, viewfinderContainer, viewfinderToggleButton, recIndicator, downloadRow, lastRecordingLink;
let cameraStream = null;     // rear camera (video-only)
let displayStream = null;    // screen/tab capture (video-only)  [desktop path]
let micStream = null;        // microphone (audio-only)
let recorder = null;         // MediaRecorder
let recordedChunks = [];
let recordingMime = '';
let viewfinderActive = false;

// Android fallback (Leaflet offscreen → compositor)
let compositorCanvas, compositorCtx, compositorRAF = 0; // hidden canvas for recording
let offMapDiv = null, offMap = null, offRenderer = null;
let offRidePath = null, offHistoricalLayer = null, offCurrentMarker = null, offTileLayer = null;

// Tile source for offscreen map (must allow CORS)
const TILES_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
// If your network blocks OSM CORS, use MapTiler raster tiles (requires key):
// const TILES_URL = 'https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=YOUR_KEY';

// Capability detection
const isScreenCaptureSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
const isAndroid = /Android/i.test(navigator.userAgent);

// --- IndexedDB Helper ---
function promisifiedDbRequest(req) {
  return new Promise((res, rej) => {
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

// --- Utility Functions ---
function calculateVariance(arr) { if (!arr.length) return 0; const m = arr.reduce((s,v)=>s+v,0)/arr.length; return arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length; }
function getGeoId(lat, lon, prec = 4) { return `${lat.toFixed(prec)}_${lon.toFixed(prec)}`; }
function toRad(d) { return d * Math.PI / 180; }
function dist(lat1, lon1, lat2, lon2) {
  const R = 6371e3, φ1 = toRad(lat1), φ2 = toRad(lat2), dφ = toRad(lat2-lat1), dλ = toRad(lon2-lon1);
  const a = Math.sin(dφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(dλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function roughnessToColor(r) {
  for (let i = 0; i < ROUGH_THRESHOLDS.length; i++) if (r <= ROUGH_THRESHOLDS[i]) return ROUGH_COLORS[i];
  return ROUGH_COLORS[ROUGH_COLORS.length - 1];
}

// --- DB Initialization ---
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
      if (!db.objectStoreNames.contains('RoughnessMap'))
        db.createObjectStore('RoughnessMap',{keyPath:'geoId'});
    };
    request.onsuccess = e => { db = e.target.result; resolve(db); loadPastRides(); showAllHistoricalData(); };
    request.onerror = e => { statusDiv && (statusDiv.textContent = 'Error opening database.'); reject(e); };
  });
}

// --- Visible Map Initialization (Leaflet) ---
function initializeMap() {
  if (mapInitialized) return;
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  map = L.map('map').setView([51.0447, -114.0719], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  setTimeout(() => map.invalidateSize(), 200);
  historicalRoughnessLayer = L.layerGroup().addTo(map);
  currentRidePath = L.polyline([], { weight: 5 }).addTo(map);
  mapInitialized = true;
}

// --- Live Chart ---
function initChart() {
  const canvas = document.getElementById('vibrationChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  vibrationChart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [{ label: 'Vibration', data: chartDataset, pointRadius: 4, borderWidth: 2, tension: 0.3 }] },
    options: {
      parsing: { xAxisKey: 'x', yAxisKey: 'y' },
      scales: { x: { type: 'time', time: { tooltipFormat: 'HH:mm:ss' } }, y: { beginAtZero: true } },
      plugins: { tooltip: { callbacks: {
        label: c => `Roughness: ${c.parsed.y.toFixed(2)}`,
        afterBody: c => { const dp = chartDataset[c[0].dataIndex].meta; return `Lat: ${dp.latitude.toFixed(5)}, Lon: ${dp.longitude.toFixed(5)}`; }
      } } },
      onHover: (_, items) => { if (items.length) highlightPointOnMap(items[0].dataIndex); }
    }
  });
}

// --- Recap Map & Chart ---
function initRecapMap() {
  if (recapMap) recapMap.remove();
  const recapEl = document.getElementById('recapMap'); if (!recapEl) return;
  recapMap = L.map('recapMap').setView([51.0447, -114.0719], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(recapMap);
  setTimeout(() => recapMap.invalidateSize(), 200);
  recapHistoricalLayer = L.layerGroup().addTo(recapMap);
  recapRidePath = L.polyline([], { weight: 5 }).addTo(recapMap);
}
function initRecapChart() {
  const canvas = document.getElementById('recapChart'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (recapChart) recapChart.destroy();
  recapChart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [{ label: 'Vibration', data: [], pointRadius: 4, borderWidth: 2, tension: 0.3 }] },
    options: {
      parsing: { xAxisKey: 'x', yAxisKey: 'y' },
      scales: { x: { type: 'time', time: { tooltipFormat: 'HH:mm:ss' } }, y: { beginAtZero: true } },
      plugins: { tooltip: { callbacks: {
        label: c => `Roughness: ${c.parsed.y.toFixed(2)}`,
        afterBody: c => { const dp = recapChart.data.datasets[0].data[c[0].dataIndex].meta; return `Lat: ${dp.latitude.toFixed(5)}, Lon: ${dp.longitude.toFixed(5)}`; }
      } } },
      onHover: (_, items) => { if (items.length) highlightRecapPointOnMap(items[0].dataIndex); }
    }
  });
}

// --- Historical overlay (visible map) ---
async function updateHistoricalDisplay(lat, lon, layerGroup) {
  if (!db || !layerGroup) return;
  layerGroup.clearLayers();
  const tx = db.transaction('RoughnessMap', 'readonly');
  const all = await promisifiedDbRequest(tx.objectStore('RoughnessMap').getAll());
  all.forEach(pt => {
    if (dist(lat, lon, pt.latitude, pt.longitude) <= HIST_RADIUS) {
      L.circleMarker([pt.latitude, pt.longitude], {
        radius: 4, fillColor: roughnessToColor(pt.roughnessValue),
        color: '#000', weight: 1, opacity: 0.7, fillOpacity: 0.7
      }).bindPopup(`Roughness: ${pt.roughnessValue.toFixed(2)}<br>Updated: ${new Date(pt.lastUpdated).toLocaleDateString()}`)
       .addTo(layerGroup);
    }
  });
  await tx.complete;
}
async function showAllHistoricalData() {
  if (!db || !historicalRoughnessLayer) return;
  historicalRoughnessLayer.clearLayers();
  const tx = db.transaction('RoughnessMap', 'readonly');
  const all = await promisifiedDbRequest(tx.objectStore('RoughnessMap').getAll());
  all.forEach(pt => {
    L.circleMarker([pt.latitude, pt.longitude], {
      radius: 4, fillColor: roughnessToColor(pt.roughnessValue),
      color: '#000', weight: 1, opacity: 0.7, fillOpacity: 0.7
    }).bindPopup(`Roughness: ${pt.roughnessValue.toFixed(2)}<br>Updated: ${new Date(pt.lastUpdated).toLocaleDateString()}`)
     .addTo(historicalRoughnessLayer);
  });
  await tx.complete;
}

// --- Hover highlights (visible/recap) ---
function highlightPointOnMap(idx) {
  if (!chartDataset[idx] || !map) return;
  const dp = chartDataset[idx].meta;
  if (recapHighlight) map.removeLayer(recapHighlight);
  recapHighlight = L.circleMarker([dp.latitude, dp.longitude], { radius: 10, color: '#f00', weight: 2, fill: false }).addTo(map);
  setTimeout(() => { if (recapHighlight && map) map.removeLayer(recapHighlight); }, 3000);
}
function highlightRecapPointOnMap(idx) {
  const data = recapChart?.data?.datasets[0]?.data;
  if (!data || !data[idx] || !recapMap) return;
  const dp = data[idx].meta;
  if (recapHighlight) recapMap.removeLayer(recapHighlight);
  recapHighlight = L.circleMarker([dp.latitude, dp.longitude], { radius: 10, color: '#f00', weight: 2, fill: false }).addTo(recapMap);
  setTimeout(() => { if (recapHighlight && recapMap) recapMap.removeLayer(recapHighlight); }, 3000);
}

// --- Sensors ---
function gpsSuccess(pos) { latestGpsPosition = pos; }
function gpsError(err) { const msgs = {1:'Permission denied',2:'Unavailable',3:'Timed out'}; statusDiv && (statusDiv.textContent = msgs[err.code] || 'GPS error'); if (err.code === 1) stopRide(); }
function handleMotion(evt) {
  const z = evt.accelerationIncludingGravity?.z;
  if (typeof z === 'number') { lastLowPassZ = HPF_ALPHA * lastLowPassZ + (1 - HPF_ALPHA) * z; accelerometerBuffer.push(z - lastLowPassZ); }
}

// --- Core Data Loop ---
async function processCombinedDataPoint() {
  if (!currentRideId || !latestGpsPosition) { statusDiv && (statusDiv.textContent = 'Waiting for GPS…'); return; }
  const { latitude, longitude, altitude, accuracy } = latestGpsPosition.coords;
  const timestamp = latestGpsPosition.timestamp;
  const roughness = calculateVariance(accelerometerBuffer);
  accelerometerBuffer = [];

  const dp = { id: crypto.randomUUID(), rideId: currentRideId, timestamp, latitude, longitude, altitude, accuracy, roughnessValue: roughness };

  currentRideDataPoints.push(dp);
  dataPointsCounter && (dataPointsCounter.textContent = `Data Points: ${currentRideDataPoints.length}`);
  await updateRoughnessMap(dp);
  updateMapDisplay(dp);
  updateOffscreenMapDisplay(dp); // keep the offscreen Leaflet in sync

  if (vibrationChart) { chartDataset.push({ x: new Date(timestamp), y: roughness, meta: dp }); vibrationChart.update(); }

  statusDiv && (statusDiv.textContent = `Lat ${latitude.toFixed(4)}, Lon ${longitude.toFixed(4)}, Rough ${roughness.toFixed(2)}`);
}

// --- RoughnessMap (DB) ---
async function updateRoughnessMap(dp) {
  const geoId = getGeoId(dp.latitude, dp.longitude);
  const tx = db.transaction('RoughnessMap', 'readwrite');
  const store = tx.objectStore('RoughnessMap');
  const existing = await promisifiedDbRequest(store.get(geoId));
  if (existing) await promisifiedDbRequest(store.put({ ...existing, roughnessValue: dp.roughnessValue, lastUpdated: dp.timestamp }));
  else await promisifiedDbRequest(store.add({ geoId, latitude: dp.latitude, longitude: dp.longitude, roughnessValue: dp.roughnessValue, lastUpdated: dp.timestamp }));
  await tx.complete;
}

// --- Live Map (visible) ---
function updateMapDisplay(dp) {
  if (!mapInitialized || !map) return;
  const latlng = [dp.latitude, dp.longitude];
  if (!currentLocationMarker) currentLocationMarker = L.marker(latlng).addTo(map);
  else currentLocationMarker.setLatLng(latlng);
  map.setView(latlng, Math.max(map.getZoom(), 15));

  const path = currentRidePath.getLatLngs();
  const col  = roughnessToColor(dp.roughnessValue);
  if (path.length) { const prev = path[path.length - 1]; L.polyline([prev, latlng], { color: col, weight: 5 }).addTo(map); }
  currentRidePath.addLatLng(latlng);

  updateHistoricalDisplay(dp.latitude, dp.longitude, historicalRoughnessLayer);
}

// =======================
// ANDROID FALLBACK: Offscreen Leaflet (tiles + vectors) → hidden compositor
// =======================

function ensureOffscreenLeaflet() {
  if (offMap) return;

  // Offscreen container
  offMapDiv = document.createElement('div');
  offMapDiv.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:600px;height:350px;';
  document.body.appendChild(offMapDiv);

  // Canvas renderer for vector overlays
  offRenderer = L.canvas({ padding: 0.5 });

  // Offscreen Leaflet map
  offMap = L.map(offMapDiv, { zoomControl: false, attributionControl: false, preferCanvas: true })
           .setView([51.0447, -114.0719], 13);

  // **Tiles with CORS** so we can draw them to canvas
  offTileLayer = L.tileLayer(TILES_URL, {
    crossOrigin: true, // IMPORTANT: allows drawImage without tainting
    tileSize: 256
  }).addTo(offMap);

  // Vector overlays
  offHistoricalLayer = L.layerGroup(undefined, { renderer: offRenderer }).addTo(offMap);
  offRidePath = L.polyline([], { weight: 5, renderer: offRenderer }).addTo(offMap);
  offCurrentMarker = L.circleMarker([51.0447, -114.0719], {
    radius: 6, color: '#007bff', weight: 2, fillColor: '#cce1ff', fillOpacity: 0.9, renderer: offRenderer
  }).addTo(offMap);

  populateOffscreenHistorical();
  setTimeout(()=> offMap && offMap.invalidateSize(), 50);
}

async function populateOffscreenHistorical() {
  if (!db || !offHistoricalLayer) return;
  offHistoricalLayer.clearLayers();
  const tx = db.transaction('RoughnessMap', 'readonly');
  const allPoints = await promisifiedDbRequest(tx.objectStore('RoughnessMap').getAll());
  allPoints.forEach(pt => {
    L.circleMarker([pt.latitude, pt.longitude], {
      radius: 4, fillColor: roughnessToColor(pt.roughnessValue),
      color: '#000', weight: 1, opacity: 0.7, fillOpacity: 0.7,
      renderer: offRenderer
    }).addTo(offHistoricalLayer);
  });
  await tx.complete;
}

// Sync offscreen overlays to live data
function updateOffscreenMapDisplay(dp) {
  if (!offMap) return;
  const latlng = [dp.latitude, dp.longitude];

  offCurrentMarker.setLatLng(latlng);

  const pts = offRidePath.getLatLngs();
  const col = roughnessToColor(dp.roughnessValue);
  if (pts.length) { const prev = pts[pts.length - 1]; L.polyline([prev, latlng], { color: col, weight: 5, renderer: offRenderer }).addTo(offMap); }
  offRidePath.addLatLng(latlng);

  offMap.setView(latlng, Math.max(offMap.getZoom(), 15));
}

// Hidden compositor canvas
function ensureCompositorCanvas() {
  if (compositorCanvas) return;
  compositorCanvas = document.createElement('canvas'); // stays hidden
  compositorCanvas.width = 1280;
  compositorCanvas.height = 720;
  compositorCtx = compositorCanvas.getContext('2d');
}

// Helper: draw offscreen tile images onto our compositor
function drawOffscreenTiles(ctx, W, H) {
  if (!offTileLayer || !offMapDiv) return;
  const mapRect = offMapDiv.getBoundingClientRect();
  const sx = W / mapRect.width;
  const sy = H / mapRect.height;
  // All tile <img> nodes under the offscreen tile pane
  const imgs = offMapDiv.querySelectorAll('.leaflet-tile-pane img.leaflet-tile');
  imgs.forEach(img => {
    // Only draw tiles that finished loading and are visible
    if (!img.complete || img.naturalWidth === 0 || img.style.display === 'none') return;
    const r = img.getBoundingClientRect();
    const x = (r.left - mapRect.left) * sx;
    const y = (r.top  - mapRect.top)  * sy;
    const w = r.width  * sx;
    const h = r.height * sy;
    try { ctx.drawImage(img, x, y, w, h); } catch {}
  });
}

// =======================
// Recording (2 paths)
// =======================

function pickBestMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4'
  ];
  for (const t of candidates) if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}
function stopTracks(stream) { try { stream?.getTracks().forEach(t => t.stop()); } catch {} }
function setRecordingUI(active) {
  // Visible map always stays on screen.
  viewfinderContainer?.classList.toggle('hidden', !active);
  document.body.classList.toggle('with-viewfinder', active);
  recIndicator?.classList.toggle('hidden', !active);
  if (viewfinderToggleButton) viewfinderToggleButton.textContent = active ? '■ Stop & Save' : '▶︎ Viewfinder + Record';
}

// Desktop: tab/screen + mic
async function startDesktopRecording() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    viewfinderEl.srcObject = cameraStream; try { await viewfinderEl.play(); } catch {}
  } catch { statusDiv && (statusDiv.textContent = 'Unable to access rear camera.'); return; }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  } catch { statusDiv && (statusDiv.textContent = 'Unable to access microphone.'); stopTracks(cameraStream); return; }

  let disp;
  try {
    disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30, displaySurface: 'browser', preferCurrentTab: true }, audio: false });
  } catch { statusDiv && (statusDiv.textContent = 'Screen capture was not started.'); stopTracks(cameraStream); stopTracks(micStream); return; }
  displayStream = disp;
  displayStream.getVideoTracks()[0].addEventListener('ended', () => { if (viewfinderActive) stopViewfinderAndRecording(); });

  const combined = new MediaStream([ ...displayStream.getVideoTracks(), ...micStream.getAudioTracks() ]);
  await startMediaRecorder(combined);
  setRecordingUI(true);
  statusDiv && (statusDiv.textContent = 'Recording screen + mic. Viewfinder active.');
}

// Android: hidden compositor (tiles + vectors) + mic + PIP
async function startAndroidCompositorRecording() {
  ensureOffscreenLeaflet();
  ensureCompositorCanvas();

  // camera (also show in on-screen viewfinder)
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    viewfinderEl.srcObject = cameraStream; try { await viewfinderEl.play(); } catch {}
  } catch { statusDiv && (statusDiv.textContent = 'Unable to access rear camera.'); return; }

  // mic
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
  } catch { statusDiv && (statusDiv.textContent = 'Unable to access microphone.'); stopTracks(cameraStream); return; }

  // local <video> for PIP drawing
  const vid = document.createElement('video');
  vid.srcObject = cameraStream; vid.muted = true; vid.playsInline = true;
  try { await vid.play(); } catch {}

  // Draw loop: tiles → vector canvas → PIP → HUD
  const draw = () => {
    const cvs = compositorCanvas, ctx = compositorCtx;
    const W = cvs.width, H = cvs.height;
    ctx.clearRect(0,0,W,H);

    // 1) Tiles (raster) from offscreen map
    drawOffscreenTiles(ctx, W, H);

    // 2) Vector overlays: draw Leaflet canvas renderer atop tiles
    const offCanvas = offRenderer && offRenderer._container ? offRenderer._container : null;
    if (offCanvas) {
      // scale vector canvas to full frame
      const mapRect = offMapDiv.getBoundingClientRect();
      const sx = W / mapRect.width;
      const sy = H / mapRect.height;
      const r = offCanvas.getBoundingClientRect();
      const x = (r.left - mapRect.left) * sx;
      const y = (r.top  - mapRect.top)  * sy;
      const w = r.width  * sx;
      const h = r.height * sy;
      try { ctx.drawImage(offCanvas, x, y, w, h); } catch {}
    }

    // 3) PIP (camera) bottom-right
    const pipW = Math.floor(W * 0.38);
    const pipH = Math.floor(pipW * 9/16);
    const pad = 24;
    ctx.save();
    const x = W - pipW - pad, y = H - pipH - pad, r2 = 18;
    ctx.beginPath();
    ctx.moveTo(x+r2, y);
    ctx.arcTo(x+pipW, y, x+pipW, y+pipH, r2);
    ctx.arcTo(x+pipW, y+pipH, x, y+pipH, r2);
    ctx.arcTo(x, y+pipH, x, y, r2);
    ctx.arcTo(x, y, x+pipW, y, r2);
    ctx.closePath();
    ctx.clip();
    try { ctx.drawImage(vid, x, y, pipW, pipH); } catch {}
    ctx.restore();

    // 4) HUD REC dot
    ctx.fillStyle = '#e10600';
    ctx.beginPath();
    ctx.arc(20, 20, 8, 0, Math.PI*2);
    ctx.fill();

    compositorRAF = requestAnimationFrame(draw);
  };
  compositorRAF = requestAnimationFrame(draw);

  // Recorder from hidden canvas + mic
  const canvasStream = compositorCanvas.captureStream(30);
  const combined = new MediaStream([ ...canvasStream.getVideoTracks(), ...micStream.getAudioTracks() ]);
  await startMediaRecorder(combined);

  // Center when GPS already known
  if (latestGpsPosition?.coords) {
    const { latitude, longitude } = latestGpsPosition.coords;
    offMap.setView([latitude, longitude], 15);
  }

  setRecordingUI(true);
  statusDiv && (statusDiv.textContent = 'Recording: tiles + overlays + camera + mic (live map stays visible).');
}

async function startMediaRecorder(stream) {
  recordedChunks = [];
  recordingMime = pickBestMime();
  try {
    recorder = new MediaRecorder(stream, recordingMime ? { mimeType: recordingMime } : undefined);
  } catch (e) {
    statusDiv && (statusDiv.textContent = 'Recording not supported on this browser.');
    stopTracks(stream); stopTracks(micStream); stopTracks(cameraStream); return;
  }
  recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) recordedChunks.push(ev.data); };
  recorder.onstop = () => saveRecording();
  viewfinderActive = true;
  try { recorder.start(1000); } catch {}
}

async function startViewfinderAndRecording() {
  if (viewfinderActive) return;
  if (isScreenCaptureSupported && !isAndroid) {
    viewfinderContainer?.classList.remove('hidden');
    await startDesktopRecording();
  } else {
    await startAndroidCompositorRecording();
  }
}

function stopViewfinderAndRecording() {
  if (!viewfinderActive) return;
  try { recorder?.stop(); } catch {}
  stopTracks(displayStream); displayStream = null;
  stopTracks(micStream); micStream = null;
  if (compositorRAF) cancelAnimationFrame(compositorRAF), compositorRAF = 0;
  setRecordingUI(false);
  statusDiv && (statusDiv.textContent = 'Finalizing recording…');
}

function saveRecording() {
  stopTracks(cameraStream); cameraStream = null;

  const mime = recordingMime || (recordedChunks[0]?.type) || 'video/webm';
  const ext = mime.includes('mp4') ? 'mp4' : 'webm';
  const blob = new Blob(recordedChunks, { type: mime });
  const url = URL.createObjectURL(blob);

  if (lastRecordingLink && downloadRow) {
    const name = currentRideId ? `ride-${currentRideId}.${ext}` : `roughness-${Date.now()}.${ext}`;
    lastRecordingLink.href = url;
    lastRecordingLink.download = name;
    downloadRow.classList.remove('hidden');
  }

  viewfinderContainer?.classList.add('hidden');
  viewfinderActive = false;
  statusDiv && (statusDiv.textContent = 'Recording saved. You can download it above.');
}

// --- App Controls ---
async function startRide() {
  if (currentRideId) return;
  currentRideId = Date.now();
  currentRideDataPoints = [];
  accelerometerBuffer = [];
  latestGpsPosition = null;
  dataPointsCounter && (dataPointsCounter.textContent = 'Data Points: 0');
  statusDiv && (statusDiv.textContent = 'Requesting permissions…');

  if (currentRidePath && map) map.removeLayer(currentRidePath);
  if (map) currentRidePath = L.polyline([], { weight: 5 }).addTo(map);
  if (currentLocationMarker && map) map.removeLayer(currentLocationMarker);
  if (historicalRoughnessLayer) historicalRoughnessLayer.clearLayers();

  watchId = navigator.geolocation.watchPosition(gpsSuccess, gpsError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });

  if (typeof DeviceMotionEvent?.requestPermission === 'function') {
    try {
      const resp = await DeviceMotionEvent.requestPermission();
      if (resp === 'granted') { window.addEventListener('devicemotion', handleMotion); motionListenerActive = true; }
      else { statusDiv && (statusDiv.textContent = 'Motion permission denied.'); }
    } catch { statusDiv && (statusDiv.textContent = 'Error requesting motion permission.'); }
  } else {
    window.addEventListener('devicemotion', handleMotion);
    motionListenerActive = true;
  }

  dataCollectionInterval = setInterval(processCombinedDataPoint, DATA_INTERVAL_MS);

  const tx = db.transaction('rides', 'readwrite');
  await promisifiedDbRequest(tx.objectStore('rides').add({
    rideId: currentRideId, startTime: currentRideId, endTime: null,
    duration: 0, totalDataPoints: 0, status: 'active'
  }));
  await tx.complete;

  if (vibrationChart) { chartDataset.length = 0; vibrationChart.data.datasets[0].data = chartDataset; vibrationChart.update(); }

  startButton && (startButton.disabled = true);
  stopButton  && (stopButton.disabled = false);
  statusDiv && (statusDiv.textContent = 'Recording… waiting for GPS.');
}

async function stopRide() {
  if (!currentRideId) return;
  if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
  if (motionListenerActive) { window.removeEventListener('devicemotion', handleMotion); motionListenerActive = false; }
  if (dataCollectionInterval !== null) { clearInterval(dataCollectionInterval); dataCollectionInterval = null; }

  statusDiv && (statusDiv.textContent = 'Saving ride…');

  try {
    const tx = db.transaction(['rides','rideDataPoints'], 'readwrite');
    const ridesStore = tx.objectStore('rides');
    const dpStore    = tx.objectStore('rideDataPoints');
    for (const dp of currentRideDataPoints) await promisifiedDbRequest(dpStore.put(dp));
    const rr = await promisifiedDbRequest(ridesStore.get(currentRideId));
    const upd = { ...rr, endTime: Date.now(), duration: Math.floor((Date.now() - rr.startTime)/1000), totalDataPoints: currentRideDataPoints.length, status: 'completed' };
    await promisifiedDbRequest(ridesStore.put(upd));
    await tx.complete;
    statusDiv && (statusDiv.textContent = 'Ride saved!');
  } catch { statusDiv && (statusDiv.textContent = 'Error saving ride.'); }

  currentRideId = null;
  currentRideDataPoints = [];
  accelerometerBuffer = [];
  latestGpsPosition = null;
  startButton && (startButton.disabled = false);
  stopButton  && (stopButton.disabled = true);
  dataPointsCounter && (dataPointsCounter.textContent = 'Data Points: 0');
  if (currentRidePath) currentRidePath.setLatLngs([]);
  if (currentLocationMarker && map) map.removeLayer(currentLocationMarker);

  showAllHistoricalData();
  loadPastRides();
}

function deleteDatabase() {
  if (!confirm("⚠️ Delete all ride data? This cannot be undone.")) return;
  statusDiv && (statusDiv.textContent = 'Deleting database...');
  const del = indexedDB.deleteDatabase(DB_NAME);
  del.onsuccess = () => { window.location.reload(); };
  del.onerror = () => { statusDiv && (statusDiv.textContent = 'Error deleting database.'); };
  del.onblocked = () => { statusDiv && (statusDiv.textContent = "Couldn't delete database. Close other tabs and retry."); };
}

// --- Past Rides & Recap ---
async function loadPastRides() {
  pastRidesList && (pastRidesList.innerHTML = '');
  if (!db) return;
  try {
    const all = await promisifiedDbRequest(db.transaction('rides','readonly').objectStore('rides').getAll());
    if (!all.length) { pastRidesList && (pastRidesList.innerHTML = '<li>No past rides recorded.</li>'); return; }
    all.sort((a,b)=>b.startTime - a.startTime).forEach(r => {
      const li = document.createElement('li');
      const start = new Date(r.startTime).toLocaleString();
      const m = Math.floor(r.duration/60), s = r.duration%60;
      li.innerHTML = `<strong>Start:</strong> ${start}<br><strong>Duration:</strong> ${m}m ${s}s<br><strong>Points:</strong> ${r.totalDataPoints}`;
      li.onclick = () => showRideDetails(r.rideId);
      pastRidesList && pastRidesList.appendChild(li);
    });
  } catch { statusDiv && (statusDiv.textContent = 'Error loading past rides.'); }
}

async function showRideDetails(rideId) {
  rideDetailView && rideDetailView.classList.remove('hidden');
  detailContent && (detailContent.textContent = 'Loading…');
  initRecapMap(); initRecapChart();

  const tx = db.transaction(['rides','rideDataPoints'],'readonly');
  const rideRec = await promisifiedDbRequest(tx.objectStore('rides').get(rideId));
  let dps = await promisifiedDbRequest(tx.objectStore('rideDataPoints').index('by_rideId').getAll(rideId));
  await tx.complete;

  if (!rideRec || !Array.isArray(dps) || dps.length === 0) { detailContent && (detailContent.textContent = 'No data for this ride.'); return; }

  dps.sort((a,b)=>a.timestamp - b.timestamp);
  const chartData = dps.map(dp => ({ x: new Date(dp.timestamp), y: dp.roughnessValue, meta: dp }));
  recapChart && (recapChart.data.datasets[0].data = chartData, recapChart.update());

  recapRidePath && recapRidePath.setLatLngs([]);
  recapHistoricalLayer && recapHistoricalLayer.clearLayers();
  dps.forEach(dp => {
    const latlng = [dp.latitude, dp.longitude];
    const pts = recapRidePath.getLatLngs();
    const col = roughnessToColor(dp.roughnessValue);
    if (pts.length) { const prev = pts[pts.length - 1]; recapMap && L.polyline([prev, latlng], { color: col, weight: 5 }).addTo(recapMap); }
    recapRidePath.addLatLng(latlng);
  });
  if (dps.length > 0) {
    const last = dps[dps.length - 1];
    updateHistoricalDisplay(last.latitude, last.longitude, recapHistoricalLayer);
  }

  let txt = `Ride ID: ${rideRec.rideId}\nStart: ${new Date(rideRec.startTime).toLocaleString()}\nEnd: ${new Date(rideRec.endTime).toLocaleString()}\nDuration: ${Math.floor(rideRec.duration/60)}m ${rideRec.duration%60}s\nPoints: ${rideRec.totalDataPoints}\n\n— Data Points —\n`;
  dps.forEach(dp => { txt += `${new Date(dp.timestamp).toLocaleTimeString()} | Lat ${dp.latitude.toFixed(5)}, Lon ${dp.longitude.toFixed(5)} | Rough ${dp.roughnessValue.toFixed(3)}\n`; });
  detailContent && (detailContent.textContent = txt);
}
function hideRideDetails() { rideDetailView && rideDetailView.classList.add('hidden'); detailContent && (detailContent.textContent = ''); }

// --- Bell ---
function playBell() {
  if (!bellSound || !voiceSound) { console.warn('Bell audio not loaded'); return; }
  try { bellSound.currentTime = 0; bellSound.play(); } catch {}
  try { voiceSound.currentTime = 0; voiceSound.play().catch(()=>{}); } catch {}
  if (navigator.vibrate) navigator.vibrate([40, 80, 40]);
}
window.playBell = playBell;

// --- Bootstrap ---
document.addEventListener('DOMContentLoaded', () => {
  // Refs
  statusDiv         = document.getElementById('status');
  startButton       = document.getElementById('startButton');
  stopButton        = document.getElementById('stopButton');
  deleteDataButton  = document.getElementById('deleteDataButton');
  bellButton        = document.getElementById('bellButton');
  dataPointsCounter = document.getElementById('dataPointsCounter');
  pastRidesList     = document.getElementById('pastRidesList');
  rideDetailView    = document.getElementById('rideDetailView');
  detailContent     = document.getElementById('detailContent');
  closeDetailButton = document.getElementById('closeDetailButton');

  // Recording UI
  viewfinderEl          = document.getElementById('viewfinder');
  viewfinderContainer   = document.getElementById('viewfinderContainer');
  viewfinderToggleButton= document.getElementById('viewfinderToggle');
  recIndicator          = document.getElementById('recIndicator');
  downloadRow           = document.getElementById('downloadRow');
  lastRecordingLink     = document.getElementById('lastRecordingLink');

  // Init core systems
  initializeMap();
  initChart();
  openDb();

  // Preload audio (recorded)
  bellSound = new Audio('sounds/Bicycle-bell-1.wav');
  voiceSound = new Audio('sounds/voice.mp3');
  bellSound.volume = 1.0;
  voiceSound.volume = 1.0;

  // Listeners
  startButton && startButton.addEventListener('click', startRide);
  stopButton && stopButton.addEventListener('click', stopRide);
  deleteDataButton && deleteDataButton.addEventListener('click', deleteDatabase);
  closeDetailButton && closeDetailButton.addEventListener('click', hideRideDetails);
  bellButton && bellButton.addEventListener('click', window.playBell);

  // Toggle recording
  viewfinderToggleButton && viewfinderToggleButton.addEventListener('click', async () => {
    if (viewfinderActive) stopViewfinderAndRecording();
    else await startViewfinderAndRecording();
  });
});

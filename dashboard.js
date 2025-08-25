// Dashboard logic for ride selection and display
let dashboardMap, dashboardRidePath, dashboardChart;

async function fetchRides() {
  const res = await fetch('/api/rides');
  return res.ok ? await res.json() : [];
}

async function fetchRideData(rideId) {
  const res = await fetch(`/api/rides/${rideId}/data`);
  return res.ok ? await res.json() : [];
}

function initMap() {
  dashboardMap = L.map('dashboardMap').setView([51.0447, -114.0719], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(dashboardMap);
  dashboardRidePath = L.polyline([], { weight: 5 }).addTo(dashboardMap);
}

function initChart() {
  const canvas = document.getElementById('dashboardChart');
  const ctx = canvas.getContext('2d');
  dashboardChart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [{ label: 'Vibration', data: [], pointRadius: 4, borderWidth: 2, tension: 0.3 }] },
    options: {
      parsing: { xAxisKey: 'x', yAxisKey: 'y' },
      scales: {
        x: { type: 'time', time: { tooltipFormat: 'HH:mm:ss' } },
        y: { beginAtZero: true }
      }
    }
  });
}

function showRideInfo(ride, dataPoints) {
  const infoDiv = document.getElementById('rideInfo');
  infoDiv.innerHTML = `
    <strong>Ride ID:</strong> ${ride.rideId}<br>
    <strong>Start:</strong> ${new Date(ride.startTime).toLocaleString()}<br>
    <strong>End:</strong> ${new Date(ride.endTime).toLocaleString()}<br>
    <strong>Duration:</strong> ${Math.floor(ride.duration/60)}m ${ride.duration%60}s<br>
    <strong>Points:</strong> ${ride.totalDataPoints}
  `;
}

function showRideOnMap(dataPoints) {
  dashboardRidePath.setLatLngs([]);
  if (!dataPoints.length) return;
  dataPoints.forEach(dp => {
    const latlng = [dp.latitude, dp.longitude];
    const pts = dashboardRidePath.getLatLngs();
    if (pts.length) {
      const prev = pts[pts.length - 1];
      L.polyline([prev, latlng], { color: '#007bff', weight: 5 }).addTo(dashboardMap);
    }
    dashboardRidePath.addLatLng(latlng);
  });
  dashboardMap.setView([dataPoints[0].latitude, dataPoints[0].longitude], 15);
}

function showRideChart(dataPoints) {
  const chartData = dataPoints.map(dp => ({
    x: new Date(dp.timestamp),
    y: dp.roughnessValue
  }));
  dashboardChart.data.datasets[0].data = chartData;
  dashboardChart.update();
}

async function onRideSelectChange() {
  const rideId = document.getElementById('rideSelect').value;
  if (!rideId) return;
  const rides = await fetchRides();
  const ride = rides.find(r => r.rideId == rideId);
  const dataPoints = await fetchRideData(rideId);
  showRideInfo(ride, dataPoints);
  showRideOnMap(dataPoints);
  showRideChart(dataPoints);
}

window.addEventListener('DOMContentLoaded', async () => {
  initMap();
  initChart();
  const rideSelect = document.getElementById('rideSelect');
  const rides = await fetchRides();
  rideSelect.innerHTML = '<option value="">-- Select a ride --</option>' +
    rides.map(r => `<option value="${r.rideId}">${new Date(r.startTime).toLocaleString()} (${r.totalDataPoints} pts)</option>`).join('');
  rideSelect.addEventListener('change', onRideSelectChange);
});

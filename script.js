let map;
let userMarker;
let trainData = [];
let stationNames = [];
let routeLine;
let trainMarkers = [];

window.addEventListener('load', async () => {
  try {
    const res = await fetch('Train_details_22122017.csv');
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    lines.shift();
    trainData = lines.map(line => {
      const cols = line.split(',');
      return {
        trainNo: cols[0]?.trim(),
        trainName: cols[1]?.trim(),
        fromShort: cols[3]?.trim(),
        fromFull: cols[4]?.trim(),
        fromFullLower: cols[4]?.trim().toLowerCase(),
        startTime: cols[5]?.trim(),
        endTime: cols[6]?.trim(),
        toShort: cols[8]?.trim(),
        toFull: cols[9]?.trim(),
        toFullLower: cols[9]?.trim().toLowerCase(),
        nextToShort: cols[10]?.trim(),
        nextToFull: cols[11]?.trim(),
        nextToFullLower: cols[11]?.trim().toLowerCase()
      };
    });
    const nameSet = new Set();
    trainData.forEach(t => {
      if (t.fromFull) nameSet.add(t.fromFull);
      if (t.toFull) nameSet.add(t.toFull);
      if (t.nextToFull) nameSet.add(t.nextToFull);
    });
    stationNames = Array.from(nameSet);
    setupAutoSuggest('fromStation', 'fromSuggestions');
    setupAutoSuggest('toStation', 'toSuggestions');

    document.getElementById('fromStation').addEventListener('keydown', e => { if(e.key === 'Enter') findTrains(); });
    document.getElementById('toStation').addEventListener('keydown', e => { if(e.key === 'Enter') findTrains(); });

  } catch (e) {
    console.error(e);
  }
});

document.getElementById('themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const btn = document.getElementById('themeToggle');
  btn.textContent = document.body.classList.contains('dark') ? '☀️ Light Mode' : '🌙 Dark Mode';
});

// Example train data
const trainData0 = [
  { trainNo: '30313', trainName: 'MJT-BT LOCAL', from: 'MAJERHAT', to: 'BARASAT JN.', next: 'Next Station', start: '21:10', end: '21:11' },
  { trainNo: '30312', trainName: 'BT-PPGT LOC', from: 'BARASAT JN.', to: 'MAJERHAT', next: 'Next Station', start: '15:50', end: '15:50' }
];

// Example: populate table on load
document.addEventListener('DOMContentLoaded', () => {
  const tbody = document.querySelector('#trainResults tbody');
  trainData.forEach(t => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.trainNo}</td>
      <td>${t.trainName}</td>
      <td>${t.from} → ${t.to}</td>
      <td>${t.next}</td>
      <td>${t.start} → ${t.end}</td>
    `;
    tbody.appendChild(tr);
  });
});

// add other logic like getLocation(), auto-suggest, etc.





let watchId;

async function getLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported.");
    return;
  }
  watchId = navigator.geolocation.watchPosition(async pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    if (!map) {
      initMap(lat, lon);
    } else {
      userMarker.setLatLng([lat, lon]);
    }
    document.getElementById('locationOutput').textContent = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
    await reverseGeocode(lat, lon);
    await fetchNearbyStations(lat, lon);
    simulateLiveTrains(lat, lon);
  }, err => {
    console.error(err);
    alert("Could not get location.");
  }, { enableHighAccuracy: true });
}

function initMap(lat, lon) {
  const userIcon = L.icon({ iconUrl: 'user-icon.png', iconSize: [32, 32], iconAnchor: [16, 16] });
  map = L.map('map').setView([lat, lon], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  userMarker = L.marker([lat, lon], { icon: userIcon }).addTo(map).bindPopup("You are here").openPopup();
}

async function reverseGeocode(lat, lon) {
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
  const data = await res.json();
  document.getElementById('addressOutput').textContent = data.display_name || 'Address not found';
}

async function fetchNearbyStations(lat, lon) {
  const query = `[out:json];node["railway"="station"](around:3000,${lat},${lon});out;`;
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: query
  });
  const data = await res.json();
  data.elements.forEach(e => {
    if (e.lat && e.lon && e.tags?.name) {
      const marker = L.marker([e.lat, e.lon]).addTo(map).bindPopup(e.tags.name);
      marker.on('click', () => {
        drawRoute(lat, lon, e.lat, e.lon);
        showToast(`Drawing route to ${e.tags.name}`);
      });
    }
  });
}

function findTrains() {
  const from = document.getElementById('fromStation').value.trim().toLowerCase();
  const to = document.getElementById('toStation').value.trim().toLowerCase();

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const found = trainData.filter(t =>
    t.fromFullLower === from && (t.toFullLower === to || t.nextToFullLower === to)
  );

  const upcoming = [];
  const earlier = [];

  found.forEach(t => {
    if (t.startTime && t.startTime !== "00:00:00") {
      const [h, m] = t.startTime.split(':').map(Number);
      const trainMinutes = h * 60 + m;
      if (trainMinutes >= nowMinutes) {
        upcoming.push(t);
      } else {
        earlier.push(t);
      }
    } else {
      earlier.push(t);
    }
  });

  const upcomingBody = document.querySelector('#upcomingTable tbody');
  const earlierBody = document.querySelector('#earlierTable tbody');
  upcomingBody.innerHTML = '';
  earlierBody.innerHTML = '';

  if (upcoming.length === 0) {
    upcomingBody.innerHTML = '<tr><td colspan="5">No upcoming trains found.</td></tr>';
  } else {
    upcoming.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.trainNo}</td>
        <td>${t.trainName}</td>
        <td>${t.fromShort} (${t.fromFull}) → ${t.toShort} (${t.toFull})</td>
        <td>${t.nextToShort} (${t.nextToFull})</td>
        <td>${t.startTime} → ${t.endTime}</td>
      `;
      upcomingBody.appendChild(tr);
    });
  }

  if (earlier.length === 0) {
    earlierBody.innerHTML = '<tr><td colspan="5">No earlier trains found.</td></tr>';
  } else {
    earlier.forEach(t => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.trainNo}</td>
        <td>${t.trainName}</td>
        <td>${t.fromShort} (${t.fromFull}) → ${t.toShort} (${t.toFull})</td>
        <td>${t.nextToShort} (${t.nextToFull})</td>
        <td>${t.startTime} → ${t.endTime}</td>
      `;
      earlierBody.appendChild(tr);
    });
  }
}


  function addHeading(title) {
    const heading = document.createElement('li');
    heading.innerHTML = `<strong>${title}</strong>`;
    heading.style.background = '#003366';
    heading.style.color = '#fff';
    heading.style.padding = '4px';
    list.appendChild(heading);
    const columns = document.createElement('li');
    columns.innerHTML = `<strong>No</strong> | <strong>Name</strong> | <strong>From</strong> → <strong>To</strong> | Next | Start → End`;
    list.appendChild(columns);
  }
  function addTrains(trains) {
    trains.forEach(t => {
      const li = document.createElement('li');
      li.innerHTML = `${t.trainNo} - ${t.trainName} | ${t.fromShort} (${t.fromFull}) → ${t.toShort} (${t.toFull}) | Next: ${t.nextToShort} (${t.nextToFull}) | ${t.startTime} → ${t.endTime}`;
      li.style.padding = '4px 0';
      list.appendChild(li);
    });
  }
  if (upcoming.length) { addHeading('Upcoming Trains'); addTrains(upcoming); }
  if (earlier.length) { addHeading('Earlier Trains'); addTrains(earlier); }


function setupAutoSuggest(inputId, suggestionsId) {
  const input = document.getElementById(inputId);
  const suggestions = document.getElementById(suggestionsId);
  input.addEventListener('input', () => {
    const value = input.value.toLowerCase();
    suggestions.innerHTML = '';
    if (!value) return;
    const matches = stationNames.filter(name => name.toLowerCase().includes(value));
    matches.forEach(name => {
      const li = document.createElement('li');
      li.textContent = name;
      li.addEventListener('mousedown', () => {
        input.value = name;
        suggestions.innerHTML = '';
      });
      suggestions.appendChild(li);
    });
  });
  input.addEventListener('blur', () => setTimeout(() => suggestions.innerHTML = '', 200));
}

async function drawRoute(fromLat, fromLon, toLat, toLon) {
  const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`);
  const data = await res.json();
  if (data.routes.length > 0) {
    const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.polyline(coords, { color: 'blue' }).addTo(map);
    map.fitBounds(routeLine.getBounds());
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show';
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function simulateLiveTrains(lat, lon) {
  trainMarkers.forEach(m => map.removeLayer(m));
  trainMarkers = [];
  for (let i = 0; i < 3; i++) {
    const rLat = lat + (Math.random() - 0.5) * 0.02;
    const rLon = lon + (Math.random() - 0.5) * 0.02;
    const icon = L.icon({ iconUrl: 'train-icon.png', iconSize: [24, 24], iconAnchor: [12, 12] });
    const m = L.marker([rLat, rLon], { icon }).addTo(map).bindPopup(`Train ${i+1}`);
    trainMarkers.push(m);
  }
}

let map;
let userMarker;
let trainData = [];
let stationNames = [];

// Load CSV on page load
window.addEventListener('load', async () => {
  try {
    console.log("Loading CSV file...");
    const res = await fetch('Train_details_22122017.csv');
    if (!res.ok) throw new Error(`HTTP error! Status: ${res.status}`);
    const csv = await res.text();
    console.log("CSV loaded, sample:", csv.slice(0, 100));

    const lines = csv.trim().split('\n');
    lines.shift(); // remove header if present

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

    console.log("Parsed train data sample:", trainData.slice(0, 5));

    // Build unique station names for suggestions
    const nameSet = new Set();
    trainData.forEach(t => {
      if (t.fromFull) nameSet.add(t.fromFull);
      if (t.toFull) nameSet.add(t.toFull);
      if (t.nextToFull) nameSet.add(t.nextToFull);
    });
    stationNames = Array.from(nameSet);
    setupAutoSuggest('fromStation', 'fromSuggestions');
    setupAutoSuggest('toStation', 'toSuggestions');

  } catch (e) {
    console.error('Error loading CSV:', e);
  }
});

// Show user location on map
async function getLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported by this browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    document.getElementById('locationOutput').textContent = `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
    initMap(lat, lon);
    await reverseGeocode(lat, lon);
    await fetchNearbyStations(lat, lon);
  }, () => {
    alert("Could not get your location.");
  });
}

// Initialize or update map
function initMap(lat, lon) {
  if (!map) {
    map = L.map('map').setView([lat, lon], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    userMarker = L.marker([lat, lon]).addTo(map).bindPopup("You are here").openPopup();
  } else {
    map.setView([lat, lon], 13);
    userMarker.setLatLng([lat, lon]);
  }
}

// Reverse geocode
async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
    const data = await res.json();
    document.getElementById('addressOutput').textContent = data.display_name || 'Address not found';
  } catch (e) {
    console.error('Reverse geocode error:', e);
  }
}

// Fetch nearby railway stations
async function fetchNearbyStations(lat, lon) {
  const query = `
    [out:json];
    node["railway"="station"](around:3000,${lat},${lon});
    out;
  `;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query
    });
    const data = await res.json();
    data.elements.forEach(e => {
      if (e.lat && e.lon && e.tags?.name) {
        L.marker([e.lat, e.lon]).addTo(map).bindPopup(e.tags.name);
      }
    });
  } catch (e) {
    console.error('Overpass API error:', e);
  }
}

// Find trains
function findTrains() {
  const from = document.getElementById('fromStation').value.trim().toLowerCase();
  const to = document.getElementById('toStation').value.trim().toLowerCase();

  const found = trainData.filter(t =>
    t.fromFullLower === from && (t.toFullLower === to || t.nextToFullLower === to)
  );

  const list = document.getElementById('trainResults');
  list.innerHTML = '';

  if (found.length === 0) {
    list.innerHTML = '<li>No trains found.</li>';
  } else {
    found.forEach(t => {
      const li = document.createElement('li');
      li.textContent = `${t.trainNo} - ${t.trainName} | ${t.fromShort} (${t.fromFull}) → ${t.toShort} (${t.toFull}) | Next: ${t.nextToShort} (${t.nextToFull}) | Start: ${t.startTime} | End: ${t.endTime}`;
      list.appendChild(li);
    });
  }
}

// Autocomplete suggestions
// Autocomplete suggestions
function setupAutoSuggest(inputId, suggestionsId) {
  const input = document.getElementById(inputId);
  const suggestions = document.getElementById(suggestionsId);

  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
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

  input.addEventListener('blur', () => {
    setTimeout(() => suggestions.innerHTML = '', 200);
  });
}


const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 4070;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Geocoding via Nominatim (no key required)
app.get('/api/geocode', async (req, res) => {
  try {
    const q = req.query.q || '';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&countrycodes=au`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'WATruckNavigator/1.0 (vibekit.bot)' }
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Truck routing via OSRM public instance (no key required)
// Note: OSRM driving profile is used — no truck-specific restrictions on public instance
app.post('/api/route', async (req, res) => {
  try {
    const { start, end } = req.body;
    // OSRM expects lon,lat in URL: /route/v1/driving/lon1,lat1;lon2,lat2
    const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&annotations=false`;

    const vRes = await fetch(url, {
      headers: { 'User-Agent': 'WATruckNavigator/1.0 (vibekit.bot)' }
    });

    if (!vRes.ok) {
      const err = await vRes.text();
      return res.status(vRes.status).json({ error: err });
    }

    const data = await vRes.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WA Truck Navigator running on port ${PORT}`);
});

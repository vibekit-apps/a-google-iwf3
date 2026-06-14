const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4070;



// ---- Middleware ----
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Health ----
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---- Geocoding ----
app.get('/api/geocode', async (req, res) => {
  try {
    const q = req.query.q || '';
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&countrycodes=au`;
    const r = await fetch(url, { headers: { 'User-Agent': 'WATruckNavigator/1.0 (vibekit.bot)' } });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Routing ----
app.post('/api/route', async (req, res) => {
  const { start, end, restrictions } = req.body;

  try {
    const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&annotations=false`;
    const vRes = await fetch(url, { headers: { 'User-Agent': 'WATruckNavigator/1.0 (vibekit.bot)' } });
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

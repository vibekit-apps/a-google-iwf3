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

// Truck routing via Valhalla public instance (no key required)
app.post('/api/route', async (req, res) => {
  try {
    const { start, end, restrictions } = req.body;
    // Valhalla expects [lon, lat]
    const body = {
      locations: [
        { lon: start[0], lat: start[1] },
        { lon: end[0],   lat: end[1] }
      ],
      costing: 'truck',
      costing_options: {
        truck: {
          width:     restrictions.width     || 2.5,
          height:    restrictions.height    || 4.3,
          length:    restrictions.length    || 19.0,
          weight:    restrictions.weight    || 40.0,
          axle_load: restrictions.axleload  || 9.5
        }
      },
      directions_options: { units: 'kilometres', language: 'en-AU' }
    };

    const url = 'https://valhalla.openstreetmap.de/route';
    const vRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
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

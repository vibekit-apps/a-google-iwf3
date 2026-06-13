const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 4070;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Proxy ORS routing to avoid CORS + keep API key server-side
app.post('/api/route', async (req, res) => {
  try {
    const { start, end, profile, restrictions } = req.body;
    // Use ORS free HGV profile
    const orsProfile = 'driving-hgv';
    const body = {
      coordinates: [start, end],
      profile: orsProfile,
      format: 'geojson',
      options: {
        vehicle_type: 'hgv',
        profile_params: {
          restrictions: {
            width: restrictions.width || 2.5,
            height: restrictions.height || 4.0,
            length: restrictions.length || 19.0,
            axleload: restrictions.axleload || 9.5,
            weight: restrictions.weight || 40.0
          }
        }
      },
      instructions: true,
      language: 'en'
    };

    const apiKey = process.env.ORS_API_KEY || '';
    const url = `https://api.openrouteservice.org/v2/directions/${orsProfile}/geojson`;

    const orsRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify(body)
    });

    if (!orsRes.ok) {
      const err = await orsRes.text();
      return res.status(orsRes.status).json({ error: err });
    }

    const data = await orsRes.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Geocoding proxy
app.get('/api/geocode', async (req, res) => {
  try {
    const q = encodeURIComponent(req.query.q);
    const apiKey = process.env.ORS_API_KEY || '';
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${apiKey}&text=${q}&boundary.country=AU&size=5`;
    const r = await fetch(url);
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Truck Navigator running on port ${PORT}`);
});

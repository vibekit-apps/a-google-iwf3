const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 4070;

// ---- Stripe setup (optional — set STRIPE_SECRET_KEY + STRIPE_PRICE_ID env vars) ----
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PRICE_ID   = process.env.STRIPE_PRICE_ID   || '';        // $10/month recurring price id
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://a-google-iwf3.vibekit.bot';

let stripe = null;
if (STRIPE_SECRET_KEY) {
  stripe = require('stripe')(STRIPE_SECRET_KEY);
}

// ---- Simple file-based user DB (no external DB needed) ----
const DB_PATH = path.join(__dirname, 'data', 'users.json');

function loadDB() {
  try {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '{}');
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch { return {}; }
}

function saveDB(db) {
  try {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch(e) { console.error('DB save error', e.message); }
}

// ---- Subscription helpers ----
const FREE_TRIAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getUser(email) {
  const db = loadDB();
  return db[email.toLowerCase()] || null;
}

function ensureUser(email) {
  const db = loadDB();
  const key = email.toLowerCase();
  if (!db[key]) {
    db[key] = {
      email: key,
      createdAt: Date.now(),
      trialEnds: Date.now() + FREE_TRIAL_MS,
      status: 'trial',            // trial | active | expired
      stripeCustomerId: null,
      stripeSubscriptionId: null
    };
    saveDB(db);
  }
  return db[key];
}

function updateUser(email, patch) {
  const db = loadDB();
  const key = email.toLowerCase();
  if (!db[key]) return null;
  db[key] = { ...db[key], ...patch };
  saveDB(db);
  return db[key];
}

function checkAccess(user) {
  if (!user) return { allowed: false, reason: 'not_registered' };
  const now = Date.now();

  if (user.status === 'active') return { allowed: true, reason: 'subscribed' };

  if (user.status === 'trial' && now < user.trialEnds) {
    const daysLeft = Math.ceil((user.trialEnds - now) / (24 * 60 * 60 * 1000));
    return { allowed: true, reason: 'trial', daysLeft };
  }

  return { allowed: false, reason: 'expired' };
}

// ---- Middleware ----
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Health ----
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ---- Auth: register / check status ----
app.post('/api/auth/register', (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  const user = ensureUser(email);
  const access = checkAccess(user);
  res.json({
    email: user.email,
    status: user.status,
    trialEnds: user.trialEnds,
    access
  });
});

app.post('/api/auth/check', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const user = getUser(email);
  if (!user) return res.json({ allowed: false, reason: 'not_registered' });
  const access = checkAccess(user);
  res.json({ ...access, status: user.status, trialEnds: user.trialEnds });
});

// ---- Stripe: create checkout session ----
app.post('/api/subscribe/checkout', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Payments not configured yet. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID.' });
  if (!STRIPE_PRICE_ID) return res.status(503).json({ error: 'STRIPE_PRICE_ID not set.' });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const user = ensureUser(email);

  try {
    // Reuse or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email });
      customerId = customer.id;
      updateUser(email, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      mode: 'subscription',
      success_url: `${APP_URL}/?payment=success&email=${encodeURIComponent(email)}`,
      cancel_url:  `${APP_URL}/?payment=cancelled`,
      customer_email: customerId ? undefined : email,
    });

    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Stripe webhook (raw body needed) ----
app.post('/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) return res.status(200).send('ok');

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
    } catch (e) {
      return res.status(400).send(`Webhook error: ${e.message}`);
    }

    const db = loadDB();

    if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      const custId = sub.customer;
      const userEntry = Object.values(db).find(u => u.stripeCustomerId === custId);
      if (userEntry) {
        const patch = {
          stripeSubscriptionId: sub.id,
          status: sub.status === 'active' ? 'active' : userEntry.status
        };
        updateUser(userEntry.email, patch);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const custId = sub.customer;
      const userEntry = Object.values(db).find(u => u.stripeCustomerId === custId);
      if (userEntry) {
        updateUser(userEntry.email, { status: 'expired', stripeSubscriptionId: null });
      }
    }

    res.json({ received: true });
  }
);

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

// ---- Routing (guarded) ----
app.post('/api/route', async (req, res) => {
  const { start, end, email, restrictions } = req.body;

  // Access check
  const user = email ? getUser(email) : null;
  const access = checkAccess(user);
  if (!access.allowed) {
    return res.status(403).json({ error: 'access_denied', reason: access.reason });
  }

  try {
    const coords = `${start[0]},${start[1]};${end[0]},${end[1]}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&annotations=false`;
    const vRes = await fetch(url, { headers: { 'User-Agent': 'WATruckNavigator/1.0 (vibekit.bot)' } });
    if (!vRes.ok) {
      const err = await vRes.text();
      return res.status(vRes.status).json({ error: err });
    }
    const data = await vRes.json();
    res.json({ ...data, accessInfo: access });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`WA Truck Navigator running on port ${PORT}`);
});

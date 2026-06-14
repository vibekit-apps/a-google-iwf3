# MEMORY.md

## App Info
- Subdomain: a-google-iwf3
- Repo: template/blank
- Created: 2026-06-13T13:42:23.656Z

## Architecture
(document key decisions here as you build)

## Known Issues
(none yet)

## Decisions
- Subscription: 30-day free trial (email-based), then $10/month via Stripe
- User DB: file-based JSON at ./data/users.json (no external DB)
- Stripe needs 3 env vars: STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET
- Webhook endpoint: POST /api/stripe/webhook (raw body, Stripe-Signature verified)
- Route API (/api/route) now requires email + enforces access gate server-side

## How to Use Memory
- Update this file with important decisions, architecture choices, and lessons
- Daily logs go in `memory/2026-06-13.md` (create memory/ dir if needed)
- Use /compact if context gets long during a session

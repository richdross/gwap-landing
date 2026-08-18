# GWAP CLOUDFLARE CORE V1 — BINDINGS + LAUNCH GATES

## Production rule
Do not merge or route `gwapgang.com` to this Worker until the preview passes every Gate 1 check.

## Required bindings
Configure these as Cloudflare Worker secrets/variables. Never commit secret values.

### Gate 1 — no secrets required
- `ENVIRONMENT=preview`
- Static Assets binding: `ASSETS` (defined in `wrangler.jsonc`)

Expected endpoints:
- `GET /api/health`
- `GET /api/config`
- `POST /api/scanner`
- `POST /api/events`
- `POST /api/checkout`

The scanner works before Supabase/Stripe/Turnstile are configured. Event persistence and checkout remain dormant.

## Gate 2 — conversion/data bindings
### Supabase
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (secret)

Before enabling, apply:
- `supabase/001_gwap_conversion_schema.sql`

Tables:
- `gwap_scanner_runs`
- `gwap_events`

### Stripe
- `STRIPE_SECRET_KEY` (secret)
- `STRIPE_PRICE_ID`

Important: use only an explicitly approved live GWAP offer/price. Do not resurrect historical proof-test pricing automatically.

### Turnstile
- `TURNSTILE_SECRET_KEY` (secret)
- public site key will be added to the frontend when the widget is enabled.

## Gate 3 — intelligence bindings
Do not activate until the public scanner + conversion rail is verified.

Planned:
- AI Gateway
- Workers AI
- R2
- Queues
- Browser Run

Later only if evidence requires them:
- Vectorize
- Workflows
- Durable Objects / Agents

## Gate 1 verification
- [ ] Worker preview deploy succeeds
- [ ] `/` returns 200
- [ ] `/api/health` returns `{ ok: true }`
- [ ] `/api/config` reports scanner API enabled
- [ ] Scanner completes all 3 questions
- [ ] Scanner result is returned from `/api/scanner`, not browser-only logic
- [ ] `BUILD MY GREENPRINT` fails safely with `checkout_not_configured`
- [ ] No browser console errors
- [ ] Mobile layout usable
- [ ] Existing `gwapgang.com` remains unchanged

## Gate 2 verification
- [ ] Supabase schema applied
- [ ] scanner run persists
- [ ] funnel events persist
- [ ] Turnstile rejects invalid/missing token once enabled
- [ ] approved Stripe Checkout Session is created server-side
- [ ] checkout cancellation returns safely
- [ ] successful payment is independently verified before entitlement/fulfillment

## Funnel events
Canonical V1 funnel:

`landing_view -> scanner_start -> scanner_complete -> greenprint_view -> build_click -> checkout_start -> checkout_success`

## Rollback
Production remains on current `main` / Pages until explicit approval. If a future Worker cutover fails, restore the previous Cloudflare route/deployment to the known-good Pages front door.

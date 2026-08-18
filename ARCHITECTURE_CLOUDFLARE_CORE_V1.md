# GWAP Cloudflare Core V1

## Decision

GWAP core architecture:

**AI / Agents -> GitHub -> Cloudflare -> Supabase + Stripe**

Webstudio and Vercel are optional tools, not core dependencies.

## Migration rule

Do not cut production traffic until the Workers replacement is deployed to a preview URL and verified.

Current production Pages deployment remains untouched during this phase.

## V1 scope

Implemented on this branch:

- Cloudflare Workers runtime configuration
- Workers Static Assets configuration
- `/api/health`
- `/api/config`
- Cloudflare observability enabled
- Workers-ready public GWAP front door
- 3-input Opportunity Scanner shell

## Next bindings

Add only after the Workers preview is healthy:

1. Turnstile — protect public scanner/API entry points
2. Supabase — customer, outcome, and application data
3. Stripe webhooks — payment state and fulfillment triggers
4. AI Gateway — central model routing/logging/cost control
5. R2 — GWAP artifact/evidence storage
6. Queues — asynchronous signal processing
7. Workflows — durable multi-step missions

## Verification gate before production cutover

- `wrangler deploy --dry-run` passes
- preview deployment returns HTTP 200
- `/api/health` returns `{ ok: true }`
- static front door loads on desktop/mobile
- scanner completes all 3 steps
- existing production `gwapgang.com` remains unchanged
- rollback path is documented

## Rollback

Until DNS/custom-domain cutover, rollback is automatic: production stays on the existing Pages project.

After any future cutover, restore the previous production route/domain assignment to the Pages project if the Worker fails verification.

## Source of truth

GitHub repository: `richdross/gwap-landing`

Migration branch: `architecture/cloudflare-core-v1`

# GWAP PLATFORM V1

## Mission
Create one minimal platform with three planes, with GitHub as provenance and zero incremental infrastructure cost as a hard constraint.

## Plane 1 — Public
One Cloudflare Worker/public gateway should front these hostnames:

- gwapgang.com — primary public front door
- labs.gwapgang.com — experiments, research, build logs
- scanner.gwapgang.com — Opportunity Scanner / Greenprint experience
- api.gwapgang.com — public API boundary
- products.gwapgang.com — product catalog and conversion surfaces

V1 does not require five separate repositories or five separate runtimes. Hostname-based routing can send traffic to the correct surface while sharing one verified deployment contract.

## Plane 2 — Business
Supabase + Stripe own commercial state.

Canonical Supabase tables:
- gwap_customers
- gwap_products
- gwap_orders
- gwap_subscriptions
- gwap_entitlements
- gwap_missions
- gwap_results
- gwap_scanner_runs
- gwap_events

Stripe owns:
- customers where payment identity is needed
- checkout sessions
- payment intents
- subscriptions
- price/product billing configuration

Supabase records normalized business state after verified Stripe events.

## Plane 3 — Intelligence
Cloudflare intelligence capabilities are layered behind explicit flags and are OFF by default in V1:

- Browser Run
- Workers AI
- AI Gateway
- Vectorize
- Queues
- Workflows
- Agents / Durable Objects

Initial persistence remains Supabase so R2 does not need to be activated merely to complete V1.

Canonical intelligence tables:
- gwap_signals
- gwap_evidence
- gwap_opportunities
- gwap_opportunity_signals
- gwap_intelligence_runs

## Provenance layer
GitHub is the source of truth for:
- application code
- Worker configuration
- database migrations
- platform contracts
- deployment workflows
- verification evidence
- change history

## Hard cost policy
GWAP Platform V1 operates in ZERO-INCREMENTAL-COST mode.

Rules:
1. Do not activate a paid plan merely to satisfy architecture.
2. Do not enable metered AI/storage/browser capacity without an explicit approval event.
3. All optional intelligence capabilities default OFF.
4. If a free allocation is exhausted, fail closed rather than automatically purchasing overage.
5. Existing Supabase/Stripe accounts may be used only within the user's already-approved account arrangement.

## Deployment gates

### Gate A — isolated public preview
- Worker preview URL exists
- /api/health PASS
- /api/config PASS
- scanner API PASS
- no production hostname changed

### Gate B — business persistence
- Supabase migrations reviewed/applied
- events persist
- scanner runs persist
- Stripe Checkout connected only to approved price
- webhook fulfillment verified

### Gate C — intelligence ingestion
- /signals accepts and persists evidence
- optional queue processing can be enabled within safe limits
- AI remains disabled until model + free-tier guardrail are explicitly approved

### Gate D — public hostname rollout
Promote hostnames one at a time. `gwapgang.com` is last, not first.

Suggested order:
1. api.gwapgang.com
2. scanner.gwapgang.com
3. labs.gwapgang.com
4. products.gwapgang.com
5. gwapgang.com

Rollback is always DNS/route removal plus preservation of the prior verified production deployment.

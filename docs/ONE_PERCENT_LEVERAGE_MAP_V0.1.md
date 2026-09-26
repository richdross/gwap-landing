# Gwap Gang 1% Personal Leverage Map V0.1

## Product contract

**Offer:** The 1% Personal Leverage Map  
**Price:** $49 one-time  
**Audience:** ambitious creators, founders, freelancers, AI power users, technical workers, side-hustlers, and people with unfinished or under-monetized assets  
**Promise:** identify the three strongest leverage opportunities already latent in the buyer's skills, tools, projects, experience, audience, access, and constraints  
**Delivery target:** 3 business days after a complete verified intake  
**Core output:** personalized decision file, not a generic idea list

## Funnel

```
1% Playbook YouTube / Shorts / Articles / Leverage Brief
                         |
                         v
          /1percent/leverage-map/
                         |
                  $49 STRIPE CHECKOUT
                         |
      success_url includes {CHECKOUT_SESSION_ID}
                         |
                         v
     /1percent/leverage-map/intake/?session_id=...
                         |
                  paid intake validation
                         |
                         v
            LEVERAGE_MAP_V0_1 mission
                         |
             structured report schema
                         |
                    human QA gate
                         |
                 customer delivery
                         |
             +-----------+-----------+
             |                       |
             v                       v
 $149 Execution Blueprint      $299 Revenue Rescue
 (individual opportunity)      (operating businesses)
```

## Landing-page integration

The page is intentionally separate from the main editorial homepage but uses the same Gwap Gang black, paper, muted gray, and acid-green visual language.

Traffic enters from four places:

1. **1% Playbook content:** the natural primary acquisition source.
2. **Gwap Intelligence Graph:** the offer is registered in `_data/opportunities.json`, allowing content-to-offer matching.
3. **Homepage identity links:** a lightweight `1% Playbook` route, without rebuilding the screenshot-based hero.
4. **Revenue/Intelligence pages:** cross-links for visitors whose problem is personal leverage rather than business revenue leakage.

## Intake design

The intake captures six decision domains:

1. Identity + objective
2. Skills + experience
3. Existing assets + unfinished projects
4. Access + distribution
5. Real constraints
6. Existing evidence + traction

The canonical contract is `schemas/one-percent-leverage-map-intake.schema.json`.

### Security rule

Never collect passwords, API keys, card details, private credentials, SSNs, or unnecessary sensitive personal data in the intake.

## Report design

The report must produce:

- executive summary
- asset inventory
- six leverage scores
- exactly three top leverage plays
- evidence for each play
- buyer / value-capture mechanism
- fastest validation test
- most defensible play
- AI multiplier
- distribution route
- first-customer profile
- do-not-do list
- four-week plan
- optional next-offer fit

The canonical output contract is `schemas/one-percent-leverage-map-report.schema.json`.

## Scoring model V0.1

Each opportunity receives 0-100 component scores:

- **Fit:** compatibility with buyer skills, interests, constraints
- **Speed:** time to a real market test
- **Ownership:** ability to build durable IP, audience, data, software, or customer relationships
- **Automation:** leverage available through AI/software
- **Distribution:** realistic ability to reach buyers
- **Evidence:** strength of existing traction or market proof

Do not present the composite as scientific certainty. It is a decision aid.

Suggested internal weighting:

```
fit          25%
evidence     20%
speed        15%
ownership    15%
distribution 15%
automation   10%
```

## Stripe product specification

Create a **new dedicated Stripe product**. Do not reuse the $49 Business Intelligence Report product or price ID.

### Product

- **Name:** Gwap Gang — 1% Personal Leverage Map
- **Statement descriptor / short label:** 1% LEVERAGE MAP
- **Description:** Personalized Gwap Gang intelligence report identifying the three strongest leverage opportunities inside your existing skills, tools, projects, experience, audience, access, and assets.
- **Type:** one-time service / digital deliverable
- **Price:** USD $49.00
- **Tax:** use the same Stripe Tax policy currently used for comparable Gwap digital/service offers
- **Quantity:** fixed at 1

### Payment Link / Checkout

Collect at checkout:

- customer email: required
- full name: required
- consent to terms/refund policy: recommended

Do **not** duplicate the full leverage intake inside Stripe. Keep checkout short.

### Checkout redirects

Success URL:

```
https://gwapgang.com/1percent/leverage-map/intake/?session_id={CHECKOUT_SESSION_ID}
```

Cancel URL:

```
https://gwapgang.com/1percent/leverage-map/?checkout=cancelled
```

### Required backend environment variables after product creation

```
LEVERAGE_STRIPE_EXPECTED_MODE=live
LEVERAGE_STRIPE_PRICE_ID=price_...
LEVERAGE_STRIPE_PRODUCT_ID=prod_...
LEVERAGE_STRIPE_EXPECTED_CURRENCY=usd
LEVERAGE_STRIPE_EXPECTED_AMOUNT=4900
```

### Fulfillment state

Recommended states:

```
paid_pending_intake
intake_received
analysis_queued
analysis_running
qa_pending
ready_for_delivery
delivered
refunded
cancelled
```

Recommended unique key: Stripe Checkout Session ID.

## AI mission contract

```
MISSION_TYPE: LEVERAGE_MAP_V0_1

INPUT:
validated paid intake matching the intake JSON Schema

REQUIREMENTS:
1. Inventory existing leverage before inventing new assets.
2. Produce exactly three candidate plays.
3. Separate evidence from inference.
4. Penalize plays that violate stated constraints.
5. Prefer REUSE > COMBINE > EXTEND > BUILD.
6. Prefer a smaller real-world validation over speculative software construction.
7. Identify what not to do.
8. Do not promise income.
9. Do not provide legal, tax, investment, or regulated financial advice.
10. Output must validate against the report JSON Schema.

OUTPUT:
one structured report object + customer-readable formatted report
```

## Promotion system

Primary message:

> You may already have the advantage. You are just not capturing it yet.

Secondary hooks:

- Stop asking what business to start. Ask what you can leverage.
- You probably do not need another side hustle. You may need to monetize something you already know.
- Being early is not enough. Capturing the value is the skill.
- Your abandoned projects may be more valuable combined than they were alone.
- Everybody has AI. Very few people have leverage.

### Campaign path

```
Hero 1% Playbook episode
 -> 5 Shorts
 -> matching article / Leverage Brief
 -> /1percent/leverage-map/
 -> $49 purchase
 -> customer result
 -> anonymized case study
 -> next campaign
```

## V0.1 graduation

Do not scale the offer until:

- 10 qualified visitors complete or seriously engage with the sales path
- 5 external customers pay $49
- at least 4 reports pass internal QA without unsupported claims
- at least 3 customers confirm that the report gave them a clearer next move
- at least 1 customer attempts the recommended validation test

The initial goal is evidence, not catalog expansion.

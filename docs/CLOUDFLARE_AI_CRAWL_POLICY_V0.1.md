# GWAP Cloudflare AI Crawl Policy V0.1

Status: PROPOSED / SAFE DEFAULT
Scope: gwapgang.com
Effective target date: before 2026-09-15

## Policy intent

Preserve search and answer-engine discovery while limiting uncompensated model-training reuse.

## Desired Cloudflare policy

- Search crawlers: ALLOW
- AI answer / agent crawlers: ALLOW initially
- Model training crawlers: DISALLOW
- Bot Preference Sync: ENABLE
- Pay Per Crawl / Pay Per Use: DO NOT ENABLE automatically; review economics and crawler coverage first
- Attribution / crawler analytics: ENABLE when available

## Apple-specific policy

- `Applebot`: ALLOW across the public site so GWAP can remain discoverable in Apple search experiences, including Siri, Spotlight and Safari.
- `Applebot-Extended`: DISALLOW across the public site to opt out of Apple foundation-model training use.
- Do not apply `nosnippet` to public GWAP Intelligence pages intended for Siri/Apple AI discovery, because Apple says `nosnippet` prevents a page from being used to generate a description or broad-world-knowledge web answer.
- If GWAP later publishes paid or subscription-only intelligence, mark page-level structured data with `isAccessibleForFree: false` where appropriate; Apple says such pages can remain eligible for search but will not be used as AI-answer context.

## Why

1. Googlebot, Bingbot, Applebot and other mixed-purpose crawlers can serve multiple functions. Blanket blocking risks suppressing search/discovery.
2. Bot Preference Sync is intended to synchronize Cloudflare AI bot controls with robots directives so transparent crawlers can honor training restrictions without losing permitted search access.
3. Training reuse is separable from discovery and should default to blocked until GWAP intentionally licenses or monetizes it.
4. Agent access remains allowed initially because GWAP's publishing strategy benefits from AI-answer discovery and citations. Revisit once Cloudflare exposes stable usage-based monetization for the zone.
5. Applebot-Extended is a usage-control signal, not a separate crawler. Blocking it does not prevent Applebot indexing/search inclusion.

## Dashboard implementation checklist

In Cloudflare for `gwapgang.com`:

1. Open AI Crawl Control / AI bot controls.
2. Set Search = Allow.
3. Set AI/Agent/User = Allow.
4. Set Training = Block/Disallow.
5. Enable Bot Preference Sync.
6. Confirm existing WAF/Bot rules do not globally block verified search crawlers.
7. Enable crawler/AI attribution analytics if available.
8. Leave paid crawler monetization disabled until a separate commercial review.
9. Test Googlebot, Bingbot and Applebot access after save.

## Site-side baseline

Repository files added or updated alongside this policy:

- `/robots.txt` — allows general crawling, explicitly allows Applebot, disallows Applebot-Extended, and advertises sitemap.
- `/sitemap.xml` — minimal sitemap for the current public root.
- `/docs/APPLE_SIRI_VISIBILITY_TEST_V0.1.md` — repeatable Apple/Siri visibility measurement plan.

Cloudflare may prepend or synchronize AI-specific directives to robots behavior when Bot Preference Sync is enabled.

## Verification gate

PASS only if all are true:

- `https://gwapgang.com/robots.txt` returns 200.
- `https://gwapgang.com/sitemap.xml` returns 200.
- Search-engine crawling remains allowed.
- Applebot is allowed.
- Applebot-Extended is disallowed.
- Training policy is disallowed in Cloudflare AI controls.
- Bot Preference Sync is enabled.
- No production route, payment, auth, or application behavior changed.

## Future monetization gate

Do not enable Pay Per Crawl / Pay Per Use automatically. Re-evaluate when Cloudflare exposes production-ready pricing/coverage for `gwapgang.com`, and require explicit human approval before monetization or access-control changes.

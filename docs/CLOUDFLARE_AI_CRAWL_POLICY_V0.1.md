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

## Why

1. Googlebot, Bingbot, Applebot and other mixed-purpose crawlers can serve multiple functions. Blanket blocking risks suppressing search/discovery.
2. Bot Preference Sync is intended to synchronize Cloudflare AI bot controls with robots directives so transparent crawlers can honor training restrictions without losing permitted search access.
3. Training reuse is separable from discovery and should default to blocked until GWAP intentionally licenses or monetizes it.
4. Agent access remains allowed initially because GWAP's publishing strategy benefits from AI-answer discovery and citations. Revisit once Cloudflare exposes stable usage-based monetization for the zone.

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

Repository files added alongside this policy:

- `/robots.txt` — allows general crawling and advertises sitemap.
- `/sitemap.xml` — minimal sitemap for the current public root.

Cloudflare may prepend or synchronize AI-specific directives to robots behavior when Bot Preference Sync is enabled.

## Verification gate

PASS only if all are true:

- `https://gwapgang.com/robots.txt` returns 200.
- `https://gwapgang.com/sitemap.xml` returns 200.
- Search-engine crawling remains allowed.
- Training policy is disallowed in Cloudflare AI controls.
- Bot Preference Sync is enabled.
- No production route, payment, auth, or application behavior changed.

## Future monetization gate

Do not enable Pay Per Crawl / Pay Per Use automatically. Re-evaluate when Cloudflare exposes production-ready pricing/coverage for `gwapgang.com`, and require explicit human approval before monetization or access-control changes.

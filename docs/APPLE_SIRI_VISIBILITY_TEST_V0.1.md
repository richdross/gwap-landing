# GWAP Apple / Siri Visibility Test V0.1

Status: READY AFTER PRODUCTION CRAWLER POLICY IS LIVE
Scope: public GWAP Intelligence / gwapgang.com content

## Objective

Measure whether Apple search/AI experiences discover and cite GWAP after Applebot is allowed and Applebot-Extended is disallowed.

## Preconditions

- Production `robots.txt` returns 200.
- `Applebot` is allowed.
- `Applebot-Extended` is disallowed.
- Public test pages do not use `noindex` or `nosnippet`.
- Test pages are present in `sitemap.xml` and internally linked.

## Test questions

Run the following in Siri / Apple search experiences where web answers are available. Replace or add questions as GWAP Intelligence publishes more specific material.

1. What are practical AI automation opportunities for small Chicago businesses?
2. What AI tools give solo founders the best value?
3. How can a small business automate lead follow-up with AI?
4. What is the cheapest practical AI stack for a solo founder?
5. What business processes are easiest to automate with AI?
6. What are good AI business ideas for local service companies?
7. How can creators automate content production without a large team?
8. What should a small business look for before buying an AI automation service?
9. Which repetitive business tasks are best suited for AI agents?
10. How can a founder use AI to research competitors and opportunities?

## Measurement log

Record each run using this table.

| Date | Query | GWAP cited? | GWAP URL | Competitors/sources cited | Position/prominence | Notes |
|---|---|---|---|---|---|---|
| YYYY-MM-DD | Example query | YES/NO | URL or — | Source names | High/Medium/Low | Short observation |

## Pass criteria

Initial discovery PASS when at least one qualifying Apple experience:

- surfaces a GWAP page for a non-branded query, or
- cites/links a GWAP page in an AI-generated answer.

Brand-only queries such as `GWAP Gang` do not count as proof of non-branded discovery.

## Review cadence

- Run after crawler-policy deployment.
- Re-run after each meaningful batch of new GWAP Intelligence content.
- Compare new citations against previous sources and queries.
- Prioritize new articles around non-branded questions where GWAP has unique evidence but is not yet cited.

## Interpretation

- No citation immediately after deployment is not a failure; crawler/indexing latency can exist.
- Prefer measuring non-branded discovery over vanity brand searches.
- Do not weaken the `Applebot-Extended` training opt-out merely to chase citations; Apple states search ranking does not consider Applebot-Extended rules.

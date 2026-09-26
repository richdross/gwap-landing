# GWAP Search Intelligence V2

Search Intelligence V2 extends the existing Google Search Console collector. It does not create a second SEO platform.

## V2A — Query Collection

The existing collector already stores page-level Search Analytics signals. V2A adds a second Search Analytics request using:

```json
{
  "dimensions": ["query", "page"]
}
```

Each stored signal preserves the exact Search Console query string, the GWAP page it surfaced, clicks, impressions, CTR, average position, the rolling reporting period, and the verified Search Console property.

Signal contract:

- `source_type = gsc`
- `normalized.signalKind = search-query-performance`
- `normalized.adapter = gsc-search-analytics-github-v2a`

This makes it possible to connect real search language to specific GWAP content instead of inferring keywords from page titles.

## V2B — URL Index Intelligence

V2B uses the Search Console URL Inspection API with the same existing read-only Search Console OAuth scope.

Article inventory is loaded from:

1. `https://gwapgang.com/operator/blog-analytics/articles.json`
2. `https://gwapgang.com/sitemap.xml` as a fallback

Only same-host `/blog/` article URLs are inspected.

Stored index evidence includes:

- index verdict
- coverage state
- robots.txt state
- indexing state
- page fetch state
- Google-selected canonical
- user-declared canonical
- derived canonical status
- last crawl time
- crawler type
- known sitemaps
- referring URLs
- Search Console inspection result link

Signal contract:

- `source_type = gsc`
- `normalized.signalKind = url-index-status`
- `normalized.adapter = gsc-url-inspection-github-v2b`

The URL Inspection API reports the version in Google's index. It is not treated as a live URL test.

## Evidence rule

A missing Search Analytics row is not treated as proof that a URL is not indexed.

Search performance and index status remain separate evidence classes:

```text
URL INDEX STATUS
        +
QUERY/PAGE PERFORMANCE
        +
BEHAVIOR
        +
COMMERCIAL OUTCOME
        =
GWAP SEARCH INTELLIGENCE
```

## Deployment model

The production scheduler on `main` already checks out `architecture/cloudflare-core-v1` before executing:

```text
platform/intelligence/scripts/gsc-collector.mjs
```

Therefore this change belongs in `architecture/cloudflare-core-v1`. No new production secret is required.

The existing Google service account and `webmasters.readonly` scope are sufficient for both Search Analytics and URL Inspection.

Optional controls:

- `GSC_ARTICLE_MANIFEST_URL`
- `GSC_SITEMAP_URL`
- `GSC_INDEX_INSPECTION_LIMIT` — defaults to 50 and is bounded to 1–100

## Backward compatibility

The collector keeps the prior page-level proof fields at the top level:

- `rowsReturned`
- `stored`
- `duplicate`
- `failed`
- `skipped`

New proof sections are added as:

- `v2aQueryCollection`
- `v2bIndexIntelligence`
- `totals`

A failed V2A/V2B store or inspection makes the run fail visibly instead of silently claiming success.


## V2C — Index Recovery + Coverage Expansion

V2C turns URL Inspection evidence into bounded recovery decisions.

For every inspected article, GWAP now classifies the page into one of these states:

- `PROTECT_AND_MONITOR`
- `DISCOVERY_RECOVERY`
- `COVERAGE_EXPANSION`
- `CANONICAL_REVIEW`
- `CRAWLABILITY_REVIEW`
- `TECHNICAL_DIAGNOSIS`

The collector also verifies repository-side discovery evidence from the current production source:

- article source exists in `content/blog`
- sitemap template emits `collections.posts`
- article template emits `index,follow`
- article template emits the canonical link
- `robots.txt` allows the general search crawler
- blog index template links article URLs
- number of explicit editorial references from other article source files

V2C stores a separate `index-recovery-diagnostic` signal for each article so the recovery recommendation remains traceable to the same daily evidence window.

### Decision rule

Technical defects win over editorial speculation.

If the repository contains a concrete discovery or crawlability gap, V2C emits `FIX_TECHNICAL_DISCOVERY`.

If repository evidence is healthy and Google reports `URL is unknown to Google`, V2C emits `STRENGTHEN_DISCOVERY_AND_REQUEST_INDEXING`.

If repository evidence is healthy and Google reports `Discovered - currently not indexed`, V2C emits `MONITOR_DISCOVERED_URL_AND_REINFORCE_LINKS`.

If Google reports the URL indexed, V2C emits `PROTECT_URL_AND_COLLECT_DATA`.

### Important boundary

The Search Console URL Inspection API does not provide a general-purpose programmatic request-indexing operation for normal blog articles. V2C may recommend the Search Console manual request-indexing workflow, but it does not claim to submit that request automatically.

GitHub Actions is currently blocked from performing a trustworthy live HTTP check against gwapgang.com by Cloudflare bot policy. V2C therefore records:

`liveHttpStatus = NOT_VERIFIED_FROM_GITHUB_ACTIONS`

rather than inventing a 200 result. Indexed pages can separately carry Google's last successful fetch evidence from URL Inspection.

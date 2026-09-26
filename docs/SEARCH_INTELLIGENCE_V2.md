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

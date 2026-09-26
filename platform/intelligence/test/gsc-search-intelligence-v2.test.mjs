import assert from "node:assert/strict";
import test from "node:test";
import {
  articleUrlsFromGitHubContents,
  articleUrlsFromManifest,
  articleUrlsFromSitemapXml,
  buildIndexSignal,
  buildQuerySignal,
  buildRecoverySignal,
  classifyIndexRecovery,
  recoveryAction,
  canonicalStatus,
  indexStatusFromVerdict,
  normalizeQueryText,
  stableHash,
} from "../scripts/gsc-collector-lib.mjs";

test("V2A builds a query+page signal without losing the exact query", () => {
  const signal = buildQuerySignal({
    siteUrl: "sc-domain:gwapgang.com",
    permissionLevel: "siteFullUser",
    queryText: "  what should small business automate with ai  ",
    pageUrl: "https://gwapgang.com/blog/what-small-businesses-should-automate-first-with-ai/",
    targetHost: "gwapgang.com",
    clicks: 3,
    impressions: 14,
    ctr: 3 / 14,
    position: 4.8,
    startDate: "2026-08-28",
    endDate: "2026-09-24",
    today: "2026-09-26",
    observedAt: "2026-09-26T06:00:00.000Z",
  });

  assert.equal(signal.sourceType, "gsc");
  assert.equal(signal.normalized.signalKind, "search-query-performance");
  assert.equal(signal.normalized.query, "what should small business automate with ai");
  assert.equal(
    signal.normalized.pagePath,
    "/blog/what-small-businesses-should-automate-first-with-ai/",
  );
  assert.equal(signal.normalized.impressions, 14);
  assert.equal(signal.normalized.clicks, 3);
  assert.match(signal.sourceRef, /^gsc:.*:query-page:[0-9a-f]{24}:2026-09-26$/);
});

test("V2A rejects query rows outside the GWAP blog", () => {
  const signal = buildQuerySignal({
    siteUrl: "sc-domain:gwapgang.com",
    permissionLevel: "siteFullUser",
    queryText: "gwap",
    pageUrl: "https://gwapgang.com/",
    targetHost: "gwapgang.com",
    clicks: 1,
    impressions: 1,
    ctr: 1,
    position: 1,
    startDate: "2026-08-28",
    endDate: "2026-09-24",
    today: "2026-09-26",
    observedAt: "2026-09-26T06:00:00.000Z",
  });
  assert.equal(signal, null);
});

test("V2B builds an index signal from URL Inspection evidence", () => {
  const pageUrl =
    "https://gwapgang.com/blog/what-small-businesses-should-automate-first-with-ai/";
  const signal = buildIndexSignal({
    siteUrl: "sc-domain:gwapgang.com",
    permissionLevel: "siteFullUser",
    pageUrl,
    targetHost: "gwapgang.com",
    today: "2026-09-26",
    observedAt: "2026-09-26T06:00:00.000Z",
    inspection: {
      inspectionResult: {
        inspectionResultLink: "https://search.google.com/search-console/inspect?resource_id=test",
        indexStatusResult: {
          verdict: "PASS",
          coverageState: "Submitted and indexed",
          robotsTxtState: "ALLOWED",
          indexingState: "INDEXING_ALLOWED",
          lastCrawlTime: "2026-09-25T12:00:00Z",
          pageFetchState: "SUCCESSFUL",
          googleCanonical: pageUrl,
          userCanonical: pageUrl,
          crawledAs: "MOBILE",
          sitemap: ["https://gwapgang.com/sitemap.xml"],
          referringUrls: ["https://gwapgang.com/blog/"],
        },
      },
    },
  });

  assert.equal(signal.normalized.signalKind, "url-index-status");
  assert.equal(signal.normalized.indexStatus, "INDEXED");
  assert.equal(signal.normalized.canonicalStatus, "SELF");
  assert.equal(signal.normalized.pageFetchState, "SUCCESSFUL");
  assert.equal(signal.normalized.lastCrawlTime, "2026-09-25T12:00:00Z");
  assert.equal(signal.normalized.sitemaps.length, 1);
});

test("V2B maps excluded/neutral verdicts without inventing a live test", () => {
  assert.equal(indexStatusFromVerdict("PASS"), "INDEXED");
  assert.equal(indexStatusFromVerdict("NEUTRAL"), "EXCLUDED");
  assert.equal(indexStatusFromVerdict("FAIL"), "ERROR");
  assert.equal(indexStatusFromVerdict("VERDICT_UNSPECIFIED"), "UNKNOWN");
});

test("canonical status distinguishes self vs other", () => {
  const page = "https://gwapgang.com/blog/example/";
  assert.equal(canonicalStatus(page, page, page), "SELF");
  assert.equal(
    canonicalStatus(page, "https://gwapgang.com/blog/other/", page),
    "OTHER",
  );
});

test("article inventory prefers only unique GWAP blog articles", () => {
  const manifest = {
    articles: [
      { pagePath: "/blog/alpha/" },
      { pagePath: "/blog/alpha/" },
      { pagePath: "/blog/beta/" },
      { pagePath: "/culture/" },
      { pagePath: "https://example.com/blog/offsite/" },
    ],
  };
  assert.deepEqual(articleUrlsFromManifest(manifest, "gwapgang.com"), [
    "https://gwapgang.com/blog/alpha/",
    "https://gwapgang.com/blog/beta/",
  ]);
});

test("GitHub contents inventory derives article URLs from markdown filenames", () => {
  const items = [
    { type: "file", name: ".gitkeep" },
    { type: "file", name: "blog.json" },
    { type: "file", name: "alpha.md" },
    { type: "file", name: "beta.md" },
    { type: "dir", name: "nested" },
  ];

  assert.deepEqual(articleUrlsFromGitHubContents(items, "gwapgang.com"), [
    "https://gwapgang.com/blog/alpha/",
    "https://gwapgang.com/blog/beta/",
  ]);
});

test("sitemap fallback extracts only article URLs", () => {
  const xml = `<?xml version="1.0"?>
  <urlset>
    <url><loc>https://gwapgang.com/</loc></url>
    <url><loc>https://gwapgang.com/blog/</loc></url>
    <url><loc>https://gwapgang.com/blog/alpha/</loc></url>
    <url><loc>https://gwapgang.com/blog/beta/</loc></url>
  </urlset>`;

  assert.deepEqual(articleUrlsFromSitemapXml(xml, "gwapgang.com"), [
    "https://gwapgang.com/blog/alpha/",
    "https://gwapgang.com/blog/beta/",
  ]);
});

test("query normalization and stable references are deterministic", () => {
  assert.equal(normalizeQueryText(" a   b \n c "), "a b c");
  assert.equal(stableHash("same"), stableHash("same"));
  assert.notEqual(stableHash("same"), stableHash("different"));
});


test("V2C classifies indexed, unknown, and discovered-not-indexed states", () => {
  assert.equal(
    classifyIndexRecovery({
      indexStatus: "INDEXED",
      coverageState: "Submitted and indexed",
      canonicalStatus: "SELF",
    }),
    "PROTECT_AND_MONITOR",
  );

  assert.equal(
    classifyIndexRecovery({
      indexStatus: "EXCLUDED",
      coverageState: "URL is unknown to Google",
      canonicalStatus: "UNKNOWN",
    }),
    "DISCOVERY_RECOVERY",
  );

  assert.equal(
    classifyIndexRecovery({
      indexStatus: "EXCLUDED",
      coverageState: "Discovered - currently not indexed",
      canonicalStatus: "UNKNOWN",
    }),
    "COVERAGE_EXPANSION",
  );
});

test("V2C prioritizes concrete repository gaps before editorial changes", () => {
  const result = recoveryAction(
    "DISCOVERY_RECOVERY",
    {
      sourceExists: true,
      sitemapTemplateIncludesPosts: false,
      postTemplateIndexFollow: true,
      postTemplateCanonical: true,
      robotsAllowsSearch: true,
      blogIndexLinksPosts: true,
    },
    {},
  );

  assert.equal(result.action, "FIX_TECHNICAL_DISCOVERY");
  assert.deepEqual(result.problems, ["SITEMAP_TEMPLATE_GAP"]);
  assert.equal(result.manualIndexRequestRecommended, false);
});

test("V2C unknown-to-Google with healthy repository evidence recommends discovery recovery", () => {
  const result = recoveryAction(
    "DISCOVERY_RECOVERY",
    {
      sourceExists: true,
      sitemapTemplateIncludesPosts: true,
      postTemplateIndexFollow: true,
      postTemplateCanonical: true,
      robotsAllowsSearch: true,
      blogIndexLinksPosts: true,
    },
    {},
  );

  assert.equal(result.action, "STRENGTHEN_DISCOVERY_AND_REQUEST_INDEXING");
  assert.equal(result.manualIndexRequestRecommended, true);
  assert.deepEqual(result.problems, []);
});

test("V2C builds a machine-readable recovery signal", () => {
  const pageUrl =
    "https://gwapgang.com/blog/how-to-find-ai-automation-opportunities-in-your-business/";
  const indexSignal = {
    normalized: {
      indexStatus: "EXCLUDED",
      coverageState: "Discovered - currently not indexed",
      canonicalStatus: "UNKNOWN",
      pageFetchState: "PAGE_FETCH_STATE_UNSPECIFIED",
    },
  };

  const signal = buildRecoverySignal({
    siteUrl: "sc-domain:gwapgang.com",
    permissionLevel: "siteFullUser",
    pageUrl,
    targetHost: "gwapgang.com",
    indexSignal,
    repoEvidence: {
      sourceExists: true,
      sourceFile: "content/blog/how-to-find-ai-automation-opportunities-in-your-business.md",
      sitemapTemplateIncludesPosts: true,
      postTemplateIndexFollow: true,
      postTemplateCanonical: true,
      robotsAllowsSearch: true,
      blogIndexLinksPosts: true,
      inboundEditorialReferences: 3,
    },
    today: "2026-09-26",
    observedAt: "2026-09-26T06:00:00.000Z",
  });

  assert.equal(signal.normalized.signalKind, "index-recovery-diagnostic");
  assert.equal(signal.normalized.recoveryClass, "COVERAGE_EXPANSION");
  assert.equal(signal.normalized.action, "MONITOR_DISCOVERED_URL_AND_REINFORCE_LINKS");
  assert.equal(signal.normalized.repositoryEvidence.inboundEditorialReferences, 3);
  assert.equal(signal.normalized.liveHttpStatus, "NOT_VERIFIED_FROM_GITHUB_ACTIONS");
});

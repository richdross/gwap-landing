import assert from "node:assert/strict";
import test from "node:test";
import {
  articleUrlsFromGitHubContents,
  articleUrlsFromManifest,
  articleUrlsFromSitemapXml,
  buildIndexDiagnosticSignal,
  buildIndexSignal,
  buildIntentDiagnosticSignal,
  buildQuerySignal,
  buildRecoverySignal,
  clusterQueriesByIntent,
  compareEngineIndexStates,
  countInboundEditorialReferences,
  classifyIndexRecovery,
  recoveryAction,
  canonicalStatus,
  indexStatusFromVerdict,
  normalizeQueryText,
  rankPagesByImpressions,
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


test("V2B stores a new same-day signal when Google's index state changes", () => {
  const pageUrl = "https://gwapgang.com/blog/example/";
  const base = {
    siteUrl: "sc-domain:gwapgang.com",
    permissionLevel: "siteFullUser",
    pageUrl,
    targetHost: "gwapgang.com",
    today: "2026-09-26",
    observedAt: "2026-09-26T06:00:00.000Z",
  };

  const unknown = buildIndexSignal({
    ...base,
    inspection: {
      inspectionResult: {
        indexStatusResult: {
          verdict: "NEUTRAL",
          coverageState: "URL is unknown to Google",
        },
      },
    },
  });

  const discovered = buildIndexSignal({
    ...base,
    inspection: {
      inspectionResult: {
        indexStatusResult: {
          verdict: "NEUTRAL",
          coverageState: "Discovered - currently not indexed",
        },
      },
    },
  });

  assert.notEqual(unknown.sourceRef, discovered.sourceRef);
});

test("V2B keeps identical same-day index observations idempotent", () => {
  const args = {
    siteUrl: "sc-domain:gwapgang.com",
    permissionLevel: "siteFullUser",
    pageUrl: "https://gwapgang.com/blog/example/",
    targetHost: "gwapgang.com",
    today: "2026-09-26",
    observedAt: "2026-09-26T06:00:00.000Z",
    inspection: {
      inspectionResult: {
        indexStatusResult: {
          verdict: "PASS",
          coverageState: "Submitted and indexed",
          pageFetchState: "SUCCESSFUL",
        },
      },
    },
  };

  assert.equal(buildIndexSignal(args).sourceRef, buildIndexSignal(args).sourceRef);
});


test("V2D ranks highest-impression blog pages first", () => {
  const rows = [
    { keys: ["https://gwapgang.com/blog/low/"], impressions: 8, clicks: 1, ctr: 0.125, position: 7 },
    { keys: ["https://gwapgang.com/"], impressions: 500, clicks: 20, ctr: 0.04, position: 2 },
    { keys: ["https://gwapgang.com/blog/high/"], impressions: 120, clicks: 9, ctr: 0.075, position: 3 },
    { keys: ["https://gwapgang.com/blog/mid/"], impressions: 40, clicks: 3, ctr: 0.075, position: 5 },
  ];

  assert.deepEqual(
    rankPagesByImpressions(rows, "gwapgang.com", 2).map((page) => page.pagePath),
    ["/blog/high/", "/blog/mid/"],
  );
});

test("V2D clusters materially different query intents for one page", () => {
  const clusters = clusterQueriesByIntent([
    { query: "how to automate invoices", impressions: 12, clicks: 2, position: 4 },
    { query: "automate invoice workflow", impressions: 8, clicks: 1, position: 5 },
    { query: "best ai automation software", impressions: 10, clicks: 1, position: 6 },
    { query: "ai automation tools", impressions: 7, clicks: 1, position: 6.5 },
  ]);

  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].impressions, 20);
  assert.equal(clusters[1].impressions, 17);
});

test("V2D flags a well-supported multi-intent page for Founder Review", () => {
  const pageUrl = "https://gwapgang.com/blog/example/";
  const signal = buildIntentDiagnosticSignal({
    siteUrl: "sc-domain:gwapgang.com",
    permissionLevel: "siteFullUser",
    pageMetrics: {
      pageUrl,
      impressions: 37,
      clicks: 5,
      ctr: 5 / 37,
      position: 5.1,
    },
    queryRows: [
      { query: "how to automate invoices", impressions: 12, clicks: 2, position: 4 },
      { query: "automate invoice workflow", impressions: 8, clicks: 1, position: 5 },
      { query: "best ai automation software", impressions: 10, clicks: 1, position: 6 },
      { query: "ai automation tools", impressions: 7, clicks: 1, position: 6.5 },
    ],
    targetHost: "gwapgang.com",
    startDate: "2026-09-01",
    endDate: "2026-09-28",
    today: "2026-09-29",
    observedAt: "2026-09-29T19:00:00.000Z",
  });

  assert.equal(signal.normalized.decision, "REVIEW_INTENT_SPLIT");
  assert.equal(signal.normalized.serpValidationRequired, true);
  assert.equal(signal.normalized.founderReviewRequired, true);
  assert.equal(signal.normalized.qualifiedClusterCount, 2);
});

test("V2D refuses to recommend a split on thin search evidence", () => {
  const signal = buildIntentDiagnosticSignal({
    siteUrl: "sc-domain:gwapgang.com",
    permissionLevel: "siteFullUser",
    pageMetrics: {
      pageUrl: "https://gwapgang.com/blog/thin/",
      impressions: 4,
      clicks: 0,
      ctr: 0,
      position: 8,
    },
    queryRows: [
      { query: "automation guide", impressions: 2, clicks: 0, position: 8 },
      { query: "automation software", impressions: 2, clicks: 0, position: 8 },
    ],
    targetHost: "gwapgang.com",
    startDate: "2026-09-01",
    endDate: "2026-09-28",
    today: "2026-09-29",
    observedAt: "2026-09-29T19:00:00.000Z",
  });

  assert.equal(signal.normalized.decision, "COLLECT_MORE_DATA");
  assert.equal(signal.normalized.founderReviewRequired, false);
});

test("V2D cross-engine comparator stays explicit when Bing evidence is missing", () => {
  assert.equal(compareEngineIndexStates("INDEXED", null), "BING_EVIDENCE_MISSING");
  assert.equal(compareEngineIndexStates("EXCLUDED", "INDEXED"), "GOOGLE_INDEX_RECOVERY");
  assert.equal(compareEngineIndexStates("EXCLUDED", "NOT_INDEXED"), "SITE_TECHNICAL_INVESTIGATION");
  assert.equal(compareEngineIndexStates("INDEXED", "NOT_INDEXED"), "BING_DIAGNOSTIC");
  assert.equal(compareEngineIndexStates("INDEXED", "INDEXED"), "CROSS_ENGINE_HEALTHY");
});

test("V2D derives a bounded Google index decision without inventing Bing data", () => {
  const pageUrl = "https://gwapgang.com/blog/example/";
  const signal = buildIndexDiagnosticSignal({
    siteUrl: "sc-domain:gwapgang.com",
    permissionLevel: "siteFullUser",
    pageUrl,
    targetHost: "gwapgang.com",
    indexSignal: {
      normalized: {
        indexStatus: "EXCLUDED",
        coverageState: "Discovered - currently not indexed",
        canonicalStatus: "UNKNOWN",
      },
    },
    recoverySignal: {
      normalized: {
        recoveryClass: "COVERAGE_EXPANSION",
        action: "MONITOR_DISCOVERED_URL_AND_REINFORCE_LINKS",
      },
    },
    bingIndexStatus: null,
    today: "2026-09-29",
    observedAt: "2026-09-29T19:00:00.000Z",
  });

  assert.equal(signal.normalized.engineComparison, "BING_EVIDENCE_MISSING");
  assert.equal(signal.normalized.bingIndexStatus, "NOT_COLLECTED");
  assert.equal(signal.normalized.decision, "GOOGLE_INDEX_RECOVERY");
  assert.equal(signal.normalized.evidenceBoundary, "BING_INDEX_EVIDENCE_NOT_CONNECTED");
});


test("V2C counts both graph metadata and normal inline blog links", () => {
  const pageUrl = "https://gwapgang.com/blog/how-to-run-your-first-ai-automation-pilot-in-7-days/";
  const sourceFile = "content/blog/how-to-run-your-first-ai-automation-pilot-in-7-days.md";
  const articleSources = new Map([
    [
      "content/blog/what-small-businesses-should-automate-first-with-ai.md",
      "Use [the pilot](/blog/how-to-run-your-first-ai-automation-pilot-in-7-days/) next.",
    ],
    [
      "content/blog/how-to-find-ai-automation-opportunities-in-your-business.md",
      "relatedArticles:\n  - content/blog/how-to-run-your-first-ai-automation-pilot-in-7-days.md",
    ],
    [
      sourceFile,
      "Self references must not count /blog/how-to-run-your-first-ai-automation-pilot-in-7-days/",
    ],
    [
      "content/blog/unrelated.md",
      "No relationship here.",
    ],
  ]);

  assert.equal(
    countInboundEditorialReferences(
      articleSources,
      sourceFile,
      pageUrl,
      "gwapgang.com",
    ),
    2,
  );
});

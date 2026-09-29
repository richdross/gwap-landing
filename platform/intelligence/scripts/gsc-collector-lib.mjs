import { createHash } from "node:crypto";

export function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join("-")
    .slice(0, 160) || "unknown";
}

export function dayBucket(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function stableHash(value) {
  return createHash("sha256").update(String(value || "")).digest("hex").slice(0, 24);
}

export function pagePath(value, targetHost = "gwapgang.com") {
  try {
    const url = new URL(value);
    const actualHost = url.hostname.toLowerCase().replace(/^www\./, "");
    const expectedHost = String(targetHost).toLowerCase().replace(/^www\./, "");
    return actualHost === expectedHost ? url.pathname : null;
  } catch {
    return null;
  }
}

export function normalizeQueryText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 500);
}

export function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return String(value || "").trim().replace(/\/$/, "");
  }
}

export function canonicalStatus(pageUrl, googleCanonical, userCanonical) {
  const page = normalizeUrl(pageUrl);
  const google = normalizeUrl(googleCanonical);
  const user = normalizeUrl(userCanonical);

  if (googleCanonical && google === page && (!userCanonical || user === page)) return "SELF";
  if (googleCanonical && google !== page) return "OTHER";
  if (userCanonical && user !== page) return "OTHER";
  return "UNKNOWN";
}

export function indexStatusFromVerdict(verdict) {
  if (verdict === "PASS") return "INDEXED";
  if (verdict === "NEUTRAL") return "EXCLUDED";
  if (verdict === "FAIL") return "ERROR";
  return "UNKNOWN";
}

export function articleUrlsFromGitHubContents(items, targetHost = "gwapgang.com") {
  const list = Array.isArray(items) ? items : [];
  const base = `https://${String(targetHost).replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const seen = new Set();
  const urls = [];

  for (const item of list) {
    if (!item || item.type !== "file") continue;
    const name = String(item.name || "");
    if (!name.toLowerCase().endsWith(".md")) continue;

    const slug = name.replace(/\.md$/i, "").trim();
    if (!slug || slug.startsWith(".")) continue;

    let href;
    try {
      href = new URL(`/blog/${slug}/`, base).href;
    } catch {
      continue;
    }

    const normalized = normalizeUrl(href);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(href);
  }

  return urls.sort();
}

export function articleUrlsFromSitemapXml(xml, targetHost = "gwapgang.com") {
  const source = String(xml || "");
  const urls = [];
  const seen = new Set();
  const matches = source.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi);

  for (const match of matches) {
    const raw = String(match[1] || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    const path = pagePath(raw, targetHost);
    if (!path || !path.startsWith("/blog/") || path === "/blog/") continue;
    const normalized = normalizeUrl(raw);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(raw);
  }

  return urls.sort();
}

export function articleUrlsFromManifest(manifest, targetHost = "gwapgang.com") {
  const articles = Array.isArray(manifest?.articles) ? manifest.articles : [];
  const base = `https://${String(targetHost).replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const seen = new Set();
  const urls = [];

  for (const article of articles) {
    const raw = article?.url || article?.pageUrl || article?.pagePath;
    if (!raw) continue;

    let href;
    try {
      href = new URL(raw, base).href;
    } catch {
      continue;
    }

    const path = pagePath(href, targetHost);
    if (!path || !path.startsWith("/blog/") || path === "/blog/") continue;

    const normalized = normalizeUrl(href);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(href);
  }

  return urls.sort();
}

export function buildQuerySignal({
  siteUrl,
  permissionLevel,
  queryText,
  pageUrl,
  targetHost,
  clicks,
  impressions,
  ctr,
  position,
  startDate,
  endDate,
  today,
  observedAt,
}) {
  const query = normalizeQueryText(queryText);
  const path = pagePath(pageUrl, targetHost);
  if (!query || !path || !path.startsWith("/blog/")) return null;

  return {
    sourceType: "gsc",
    sourceRef: `gsc:${slug(siteUrl)}:query-page:${stableHash(`${query}|\n${pageUrl}`)}:${today}`,
    title: `Search query: ${query.slice(0, 180)} -> ${path}`,
    url: pageUrl,
    observedAt,
    normalized: {
      adapter: "gsc-search-analytics-github-v2a",
      signalKind: "search-query-performance",
      sniperKey: slug(path),
      siteUrl,
      permissionLevel,
      query,
      querySlug: slug(query),
      pageUrl,
      pagePath: path,
      clicks: number(clicks),
      impressions: number(impressions),
      ctr: number(ctr),
      position: number(position),
      type: "web",
      dataState: "final",
      period: `${startDate}:${endDate}`,
    },
  };
}

export function buildIndexSignal({
  siteUrl,
  permissionLevel,
  pageUrl,
  targetHost,
  inspection,
  today,
  observedAt,
}) {
  const path = pagePath(pageUrl, targetHost);
  if (!path || !path.startsWith("/blog/")) return null;

  const result = inspection?.inspectionResult || {};
  const index = result.indexStatusResult || {};
  const verdict = String(index.verdict || "VERDICT_UNSPECIFIED");
  const indexStateSignature = stableHash(JSON.stringify({
    verdict,
    coverageState: index.coverageState || null,
    robotsTxtState: index.robotsTxtState || null,
    indexingState: index.indexingState || null,
    pageFetchState: index.pageFetchState || null,
    googleCanonical: index.googleCanonical || null,
    userCanonical: index.userCanonical || null,
    lastCrawlTime: index.lastCrawlTime || null,
  }));

  return {
    sourceType: "gsc",
    sourceRef: `gsc:${slug(siteUrl)}:url-index:${stableHash(pageUrl)}:${today}:${indexStateSignature}`,
    title: `Index status: ${path}`,
    url: pageUrl,
    observedAt,
    normalized: {
      adapter: "gsc-url-inspection-github-v2b",
      signalKind: "url-index-status",
      sniperKey: slug(path),
      siteUrl,
      permissionLevel,
      pageUrl,
      pagePath: path,
      indexStatus: indexStatusFromVerdict(verdict),
      verdict,
      coverageState: index.coverageState || null,
      robotsTxtState: index.robotsTxtState || null,
      indexingState: index.indexingState || null,
      pageFetchState: index.pageFetchState || null,
      googleCanonical: index.googleCanonical || null,
      userCanonical: index.userCanonical || null,
      canonicalStatus: canonicalStatus(pageUrl, index.googleCanonical, index.userCanonical),
      lastCrawlTime: index.lastCrawlTime || null,
      crawledAs: index.crawledAs || null,
      sitemaps: Array.isArray(index.sitemap) ? index.sitemap.slice(0, 20) : [],
      referringUrls: Array.isArray(index.referringUrls) ? index.referringUrls.slice(0, 20) : [],
      inspectionResultLink: result.inspectionResultLink || null,
    },
  };
}


export function classifyIndexRecovery(index = {}) {
  const status = String(index.indexStatus || "UNKNOWN");
  const coverage = String(index.coverageState || "").toLowerCase();
  const robots = String(index.robotsTxtState || "");
  const indexing = String(index.indexingState || "");
  const canonical = String(index.canonicalStatus || "UNKNOWN");

  if (status === "INDEXED") return "PROTECT_AND_MONITOR";
  if (canonical === "OTHER") return "CANONICAL_REVIEW";
  if (/blocked|disallow/i.test(robots) || /blocked|disallow/i.test(indexing)) {
    return "CRAWLABILITY_REVIEW";
  }
  if (coverage.includes("unknown to google")) return "DISCOVERY_RECOVERY";
  if (coverage.includes("discovered") && coverage.includes("not indexed")) {
    return "COVERAGE_EXPANSION";
  }
  return "TECHNICAL_DIAGNOSIS";
}

export function recoveryAction(recoveryClass, repoEvidence = {}, index = {}) {
  const problems = [];
  if (repoEvidence.sourceExists === false) problems.push("ARTICLE_SOURCE_MISSING");
  if (repoEvidence.sitemapTemplateIncludesPosts === false) problems.push("SITEMAP_TEMPLATE_GAP");
  if (repoEvidence.postTemplateIndexFollow === false) problems.push("INDEX_META_GAP");
  if (repoEvidence.postTemplateCanonical === false) problems.push("CANONICAL_TEMPLATE_GAP");
  if (repoEvidence.robotsAllowsSearch === false) problems.push("ROBOTS_POLICY_GAP");
  if (repoEvidence.blogIndexLinksPosts === false) problems.push("BLOG_INDEX_LINK_GAP");

  if (problems.length) {
    return {
      action: "FIX_TECHNICAL_DISCOVERY",
      rationale: "Repository evidence contains a concrete technical discovery gap.",
      problems,
      manualIndexRequestRecommended: false,
    };
  }

  if (recoveryClass === "PROTECT_AND_MONITOR") {
    return {
      action: "PROTECT_URL_AND_COLLECT_DATA",
      rationale: "Google reports the URL indexed. Preserve URL, canonical, and crawlability while collecting search data.",
      problems,
      manualIndexRequestRecommended: false,
    };
  }

  if (recoveryClass === "DISCOVERY_RECOVERY") {
    return {
      action: "STRENGTHEN_DISCOVERY_AND_REQUEST_INDEXING",
      rationale:
        "Google reports the URL as unknown. Repository discovery signals are healthy, so strengthen internal discovery and use Search Console's manual request-indexing workflow rather than rewriting the article.",
      problems,
      manualIndexRequestRecommended: true,
    };
  }

  if (recoveryClass === "COVERAGE_EXPANSION") {
    return {
      action: "MONITOR_DISCOVERED_URL_AND_REINFORCE_LINKS",
      rationale:
        "Google has discovered the URL but has not indexed it. Keep the URL stable, reinforce relevant internal links, and monitor subsequent inspections before making editorial changes.",
      problems,
      manualIndexRequestRecommended: true,
    };
  }

  if (recoveryClass === "CANONICAL_REVIEW") {
    return {
      action: "REVIEW_CANONICAL_SELECTION",
      rationale: "Google or the page declares a different canonical URL. Resolve canonical intent before content optimization.",
      problems,
      manualIndexRequestRecommended: false,
    };
  }

  if (recoveryClass === "CRAWLABILITY_REVIEW") {
    return {
      action: "REVIEW_CRAWLABILITY",
      rationale: "Robots or indexing evidence suggests a crawl/indexing restriction.",
      problems,
      manualIndexRequestRecommended: false,
    };
  }

  return {
    action: "DIAGNOSE_BEFORE_EDITING",
    rationale:
      "The index state is not sufficiently explained by current evidence. Preserve the URL and gather more technical evidence before changing content.",
    problems,
    manualIndexRequestRecommended: false,
  };
}

export function buildRecoverySignal({
  siteUrl,
  permissionLevel,
  pageUrl,
  targetHost,
  indexSignal,
  repoEvidence = {},
  today,
  observedAt,
}) {
  const path = pagePath(pageUrl, targetHost);
  if (!path || !path.startsWith("/blog/")) return null;

  const index = indexSignal?.normalized || {};
  const recoveryClass = classifyIndexRecovery(index);
  const decision = recoveryAction(recoveryClass, repoEvidence, index);

  const recoveryStateSignature = stableHash(JSON.stringify({
    recoveryClass,
    action: decision.action,
    indexStatus: index.indexStatus || "UNKNOWN",
    coverageState: index.coverageState || null,
    canonicalStatus: index.canonicalStatus || "UNKNOWN",
    sourceExists: repoEvidence.sourceExists ?? null,
    inboundEditorialReferences: Number(repoEvidence.inboundEditorialReferences || 0),
  }));

  return {
    sourceType: "gsc",
    sourceRef: `gsc:${slug(siteUrl)}:index-recovery:${stableHash(pageUrl)}:${today}:${recoveryStateSignature}`,
    title: `Index recovery: ${path}`,
    url: pageUrl,
    observedAt,
    normalized: {
      adapter: "gsc-index-recovery-github-v2c",
      signalKind: "index-recovery-diagnostic",
      sniperKey: slug(path),
      siteUrl,
      permissionLevel,
      pageUrl,
      pagePath: path,
      recoveryClass,
      action: decision.action,
      rationale: decision.rationale,
      problems: decision.problems,
      manualIndexRequestRecommended: decision.manualIndexRequestRecommended,
      indexStatus: index.indexStatus || "UNKNOWN",
      coverageState: index.coverageState || null,
      canonicalStatus: index.canonicalStatus || "UNKNOWN",
      googleFetchEvidence:
        index.pageFetchState === "SUCCESSFUL"
          ? "GOOGLE_LAST_FETCH_SUCCESSFUL"
          : "NOT_AVAILABLE",
      liveHttpStatus: "NOT_VERIFIED_FROM_GITHUB_ACTIONS",
      repositoryEvidence: {
        sourceExists: repoEvidence.sourceExists ?? null,
        sitemapTemplateIncludesPosts: repoEvidence.sitemapTemplateIncludesPosts ?? null,
        postTemplateIndexFollow: repoEvidence.postTemplateIndexFollow ?? null,
        postTemplateCanonical: repoEvidence.postTemplateCanonical ?? null,
        robotsAllowsSearch: repoEvidence.robotsAllowsSearch ?? null,
        blogIndexLinksPosts: repoEvidence.blogIndexLinksPosts ?? null,
        inboundEditorialReferences: Number(repoEvidence.inboundEditorialReferences || 0),
        sourceFile: repoEvidence.sourceFile || null,
      },
    },
  };
}


// Search Intelligence V2D: intent + index diagnostics.
// This layer stays deterministic and evidence-gated. It identifies pages that
// deserve Founder Review; it never auto-splits content or claims Bing evidence
// that has not actually been collected.
const INTENT_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does",
  "for", "from", "how", "i", "in", "is", "it", "my", "of", "on", "or",
  "our", "should", "that", "the", "their", "to", "with", "your",
  "small", "business", "ai", "artificial", "intelligence"
]);

function normalizeIntentToken(token) {
  let value = String(token || "").toLowerCase();
  if (/^(automation|automations|automating|automated|automate)$/.test(value)) return "automate";
  if (/^(software|tool|tools|platform|platforms)$/.test(value)) return "tool";
  if (/^(consultant|consultants|consulting)$/.test(value)) return "consulting";
  if (/^(service|services)$/.test(value)) return "service";
  if (/^(workflow|workflows)$/.test(value)) return "workflow";
  if (/^(agent|agents)$/.test(value)) return "agent";
  if (value.length > 4 && value.endsWith("ies")) value = `${value.slice(0, -3)}y`;
  else if (value.length > 4 && value.endsWith("s")) value = value.slice(0, -1);
  return value;
}

export function intentClass(query = "") {
  const value = normalizeQueryText(query).toLowerCase();
  if (/\b(vs\.?|versus|compare|comparison|alternative|alternatives)\b/.test(value)) return "COMPARISON";
  if (/\b(best|top|review|reviews|price|pricing|cost|costs|software|tool|tools|platform|service|services)\b/.test(value)) {
    return "COMMERCIAL_RESEARCH";
  }
  if (/\b(near me|chicago|illinois|local|hire|quote|agency|consultant|consulting|company)\b/.test(value)) {
    return "LOCAL_TRANSACTIONAL";
  }
  if (/\b(how|guide|tutorial|steps|setup|set up|start|implement|implementation|build|create)\b/.test(value)) {
    return "HOW_TO";
  }
  if (/\b(what|why|meaning|definition|define)\b/.test(value)) return "INFORMATIONAL";
  return "OTHER";
}

export function intentTokens(query = "") {
  return [...new Set(
    normalizeQueryText(query)
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.map(normalizeIntentToken)
      .filter((token) => token.length > 2 && !INTENT_STOPWORDS.has(token)) || []
  )];
}

function overlapCoefficient(a = [], b = []) {
  const left = new Set(a);
  const right = new Set(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap++;
  return overlap / Math.min(left.size, right.size);
}

export function clusterQueriesByIntent(queryRows = []) {
  const rows = (Array.isArray(queryRows) ? queryRows : [])
    .map((row) => ({
      query: normalizeQueryText(row?.query ?? row?.queryText),
      clicks: number(row?.clicks),
      impressions: number(row?.impressions),
      ctr: number(row?.ctr),
      position: number(row?.position),
    }))
    .filter((row) => row.query && row.impressions > 0)
    .sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query));

  if (!rows.length) return [];

  const tokenRows = rows.map((row) => ({
    ...row,
    intent: intentClass(row.query),
    rawTokens: intentTokens(row.query),
  }));

  const frequency = new Map();
  for (const row of tokenRows) {
    for (const token of new Set(row.rawTokens)) {
      frequency.set(token, (frequency.get(token) || 0) + 1);
    }
  }
  const commonThreshold = Math.max(2, Math.ceil(tokenRows.length * 0.6));
  for (const row of tokenRows) {
    const reduced = row.rawTokens.filter((token) => (frequency.get(token) || 0) < commonThreshold);
    row.tokens = reduced.length ? reduced : row.rawTokens;
  }

  const clusters = [];
  for (const row of tokenRows) {
    let best = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const lexical = overlapCoefficient(row.tokens, [...cluster.tokens]);
      const sameIntent = row.intent !== "OTHER" && row.intent === cluster.primaryIntent;
      const score = lexical + (sameIntent ? 0.2 : 0);
      if (score > bestScore) {
        best = cluster;
        bestScore = score;
      }
    }

    if (!best || bestScore < 0.5) {
      clusters.push({
        representativeQuery: row.query,
        representativeImpressions: row.impressions,
        primaryIntent: row.intent,
        queryCount: 1,
        clicks: row.clicks,
        impressions: row.impressions,
        weightedPosition: row.position * row.impressions,
        tokens: new Set(row.tokens),
        intentCounts: new Map([[row.intent, 1]]),
      });
      continue;
    }

    best.queryCount++;
    best.clicks += row.clicks;
    best.impressions += row.impressions;
    best.weightedPosition += row.position * row.impressions;
    for (const token of row.tokens) best.tokens.add(token);
    best.intentCounts.set(row.intent, (best.intentCounts.get(row.intent) || 0) + 1);

    if (row.impressions > best.representativeImpressions) {
      best.representativeQuery = row.query;
      best.representativeImpressions = row.impressions;
    }

    best.primaryIntent = [...best.intentCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  }

  return clusters
    .map((cluster) => ({
      representativeQuery: cluster.representativeQuery,
      intentClass: cluster.primaryIntent,
      queryCount: cluster.queryCount,
      clicks: cluster.clicks,
      impressions: cluster.impressions,
      avgPosition:
        cluster.impressions > 0 ? cluster.weightedPosition / cluster.impressions : 0,
      terms: [...cluster.tokens].sort().slice(0, 8),
    }))
    .sort((a, b) => b.impressions - a.impressions || a.representativeQuery.localeCompare(b.representativeQuery));
}

export function rankPagesByImpressions(pageRows = [], targetHost = "gwapgang.com", limit = 5) {
  const boundedLimit = Math.max(1, Math.min(25, Number(limit) || 5));
  const pages = [];
  const seen = new Set();

  for (const row of Array.isArray(pageRows) ? pageRows : []) {
    const pageUrl = row?.keys?.[0] || row?.pageUrl;
    const path = pagePath(pageUrl, targetHost);
    if (!pageUrl || !path || !path.startsWith("/blog/")) continue;

    const normalized = normalizeUrl(pageUrl);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    pages.push({
      pageUrl,
      pagePath: path,
      clicks: number(row?.clicks),
      impressions: number(row?.impressions),
      ctr: number(row?.ctr),
      position: number(row?.position),
    });
  }

  return pages
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks || a.pagePath.localeCompare(b.pagePath))
    .slice(0, boundedLimit);
}

export function buildIntentDiagnosticSignal({
  siteUrl,
  permissionLevel,
  pageMetrics,
  queryRows,
  targetHost,
  startDate,
  endDate,
  today,
  observedAt,
}) {
  const pageUrl = pageMetrics?.pageUrl;
  const path = pagePath(pageUrl, targetHost);
  if (!path || !path.startsWith("/blog/")) return null;

  const rows = Array.isArray(queryRows) ? queryRows : [];
  const clusters = clusterQueriesByIntent(rows);
  const pageImpressions = number(pageMetrics?.impressions);
  const visibleQueryImpressions = rows.reduce((sum, row) => sum + number(row?.impressions), 0);
  const queryCoverageRatio =
    pageImpressions > 0 ? Math.min(1, visibleQueryImpressions / pageImpressions) : 0;
  const clusterThresholdImpressions = Math.max(3, Math.ceil(Math.max(visibleQueryImpressions, 1) * 0.15));
  const qualifiedClusters = clusters.filter(
    (cluster) => cluster.impressions >= clusterThresholdImpressions,
  );

  let decision = "KEEP_FOCUSED";
  let rationale = "Observed query demand is concentrated enough to keep the current page focused.";

  if (pageImpressions < 20 || rows.length < 3 || queryCoverageRatio < 0.5) {
    decision = "COLLECT_MORE_DATA";
    rationale =
      "Search evidence is still too small or incomplete to justify a structural page decision.";
  } else if (qualifiedClusters.length >= 2) {
    decision = "REVIEW_INTENT_SPLIT";
    rationale =
      "This high-impression page has at least two material query clusters. Validate separate SERPs before creating any new page.";
  }

  const confidence =
    decision === "COLLECT_MORE_DATA"
      ? "LOW"
      : pageImpressions >= 100 && queryCoverageRatio >= 0.75
        ? "HIGH"
        : "MEDIUM";

  const stateSignature = stableHash(JSON.stringify({
    decision,
    pageImpressions,
    visibleQueryImpressions,
    clusters: clusters.slice(0, 8).map((cluster) => [
      cluster.representativeQuery,
      cluster.intentClass,
      cluster.impressions,
    ]),
  }));

  return {
    sourceType: "gsc",
    sourceRef: `gsc:${slug(siteUrl)}:intent-diagnostic:${stableHash(pageUrl)}:${today}:${stateSignature}`,
    title: `Intent diagnostic: ${path}`,
    url: pageUrl,
    observedAt,
    normalized: {
      adapter: "gsc-intent-diagnostics-github-v2d",
      signalKind: "search-intent-diagnostic",
      sniperKey: slug(path),
      siteUrl,
      permissionLevel,
      pageUrl,
      pagePath: path,
      period: `${startDate}:${endDate}`,
      pageClicks: number(pageMetrics?.clicks),
      pageImpressions,
      pageCtr: number(pageMetrics?.ctr),
      pagePosition: number(pageMetrics?.position),
      queryCount: rows.length,
      visibleQueryImpressions,
      queryCoverageRatio,
      clusterCount: clusters.length,
      qualifiedClusterCount: qualifiedClusters.length,
      clusterThresholdImpressions,
      decision,
      confidence,
      rationale,
      serpValidationRequired: decision === "REVIEW_INTENT_SPLIT",
      founderReviewRequired: decision === "REVIEW_INTENT_SPLIT",
      clusters: clusters.slice(0, 8).map((cluster) => ({
        ...cluster,
        impressionShare:
          visibleQueryImpressions > 0 ? cluster.impressions / visibleQueryImpressions : 0,
      })),
    },
  };
}

function normalizeEngineIndexStatus(status) {
  const value = String(status || "").toUpperCase();
  if (!value) return "MISSING";
  if (["INDEXED", "PASS"].includes(value)) return "INDEXED";
  if (["EXCLUDED", "ERROR", "FAIL", "NOT_INDEXED", "NOT INDEXED"].includes(value)) return "NOT_INDEXED";
  return "UNKNOWN";
}

export function compareEngineIndexStates(googleStatus, bingStatus) {
  const google = normalizeEngineIndexStatus(googleStatus);
  const bing = normalizeEngineIndexStatus(bingStatus);

  if (bing === "MISSING" || bing === "UNKNOWN") return "BING_EVIDENCE_MISSING";
  if (google === "INDEXED" && bing === "INDEXED") return "CROSS_ENGINE_HEALTHY";
  if (google === "NOT_INDEXED" && bing === "NOT_INDEXED") return "SITE_TECHNICAL_INVESTIGATION";
  if (google === "NOT_INDEXED" && bing === "INDEXED") return "GOOGLE_INDEX_RECOVERY";
  if (google === "INDEXED" && bing === "NOT_INDEXED") return "BING_DIAGNOSTIC";
  return "HOLD";
}

export function buildIndexDiagnosticSignal({
  siteUrl,
  permissionLevel,
  pageUrl,
  targetHost,
  indexSignal,
  recoverySignal,
  bingIndexStatus = null,
  today,
  observedAt,
}) {
  const path = pagePath(pageUrl, targetHost);
  if (!path || !path.startsWith("/blog/")) return null;

  const index = indexSignal?.normalized || {};
  const recovery = recoverySignal?.normalized || {};
  const engineComparison = compareEngineIndexStates(index.indexStatus, bingIndexStatus);

  let decision = engineComparison;
  if (engineComparison === "BING_EVIDENCE_MISSING") {
    if (index.indexStatus === "INDEXED") {
      decision = "PROTECT_URL_AND_COLLECT_DATA";
    } else if (
      recovery.action === "FIX_TECHNICAL_DISCOVERY" ||
      ["CANONICAL_REVIEW", "CRAWLABILITY_REVIEW", "TECHNICAL_DIAGNOSIS"].includes(recovery.recoveryClass)
    ) {
      decision = "TECHNICAL_INVESTIGATION";
    } else if (["DISCOVERY_RECOVERY", "COVERAGE_EXPANSION"].includes(recovery.recoveryClass)) {
      decision = "GOOGLE_INDEX_RECOVERY";
    } else {
      decision = "HOLD";
    }
  }

  const stateSignature = stableHash(JSON.stringify({
    indexStatus: index.indexStatus || "UNKNOWN",
    coverageState: index.coverageState || null,
    recoveryClass: recovery.recoveryClass || null,
    recoveryAction: recovery.action || null,
    bingIndexStatus: bingIndexStatus || null,
    engineComparison,
    decision,
  }));

  return {
    sourceType: "gsc",
    sourceRef: `gsc:${slug(siteUrl)}:index-diagnostic:${stableHash(pageUrl)}:${today}:${stateSignature}`,
    title: `Index diagnostic: ${path}`,
    url: pageUrl,
    observedAt,
    normalized: {
      adapter: "search-index-diagnostics-github-v2d",
      signalKind: "search-index-diagnostic",
      sniperKey: slug(path),
      siteUrl,
      permissionLevel,
      pageUrl,
      pagePath: path,
      googleIndexStatus: index.indexStatus || "UNKNOWN",
      googleCoverageState: index.coverageState || null,
      googleCanonicalStatus: index.canonicalStatus || "UNKNOWN",
      recoveryClass: recovery.recoveryClass || null,
      recoveryAction: recovery.action || null,
      bingIndexStatus: bingIndexStatus || "NOT_COLLECTED",
      engineComparison,
      decision,
      founderReviewRequired: decision !== "PROTECT_URL_AND_COLLECT_DATA",
      evidenceBoundary:
        bingIndexStatus == null
          ? "BING_INDEX_EVIDENCE_NOT_CONNECTED"
          : "GOOGLE_AND_BING_EVIDENCE_AVAILABLE",
    },
  };
}

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

  return {
    sourceType: "gsc",
    sourceRef: `gsc:${slug(siteUrl)}:url-index:${stableHash(pageUrl)}:${today}`,
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

  return {
    sourceType: "gsc",
    sourceRef: `gsc:${slug(siteUrl)}:index-recovery:${stableHash(pageUrl)}:${today}`,
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

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

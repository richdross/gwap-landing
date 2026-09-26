import { createSign } from "node:crypto";
import {
  articleUrlsFromGitHubContents,
  articleUrlsFromManifest,
  articleUrlsFromSitemapXml,
  buildIndexSignal,
  buildQuerySignal,
  dayBucket,
  number,
  pagePath,
  slug,
} from "./gsc-collector-lib.mjs";

const endpoint = process.env.INTELLIGENCE_URL || "https://gwap-intelligence-v1.richdross.workers.dev";
const ingestKey = process.env.SIGNAL_INGEST_KEY;
const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GA4_SERVICE_ACCOUNT_JSON;
const targetHost = String(process.env.GSC_TARGET_HOST || "gwapgang.com").toLowerCase();
const autoEnableApi = String(process.env.GSC_AUTO_ENABLE_API || "").toLowerCase() === "true";
const articleManifestUrl =
  process.env.GSC_ARTICLE_MANIFEST_URL ||
  `https://${targetHost}/operator/blog-analytics/articles.json`;
const sitemapUrl = process.env.GSC_SITEMAP_URL || `https://${targetHost}/sitemap.xml`;
const githubInventoryUrl =
  process.env.GSC_GITHUB_INVENTORY_URL ||
  "https://api.github.com/repos/richdross/gwap-landing/contents/content/blog?ref=main";
const inspectionLimit = Math.max(
  1,
  Math.min(100, Number(process.env.GSC_INDEX_INSPECTION_LIMIT || 50) || 50),
);

if (!ingestKey) {
  console.error("SIGNAL_INGEST_KEY is required");
  process.exit(2);
}
if (!serviceAccountJson) {
  console.error("GOOGLE_SERVICE_ACCOUNT_JSON or GA4_SERVICE_ACCOUNT_JSON is required");
  process.exit(2);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function isoDayOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function serviceAccount() {
  try {
    const parsed = JSON.parse(serviceAccountJson);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("missing client_email/private_key");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Google service-account JSON is invalid: ${error.message}`);
  }
}

async function accessToken(scope = "https://www.googleapis.com/auth/webmasters.readonly") {
  const service = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: service.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const assertion = `${signingInput}.${signer
    .sign(service.private_key)
    .toString("base64url")}`;

  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(
      `Google OAuth token failed HTTP ${response.status}: ${data.error_description || data.error || "unknown"}`,
    );
  }
  return data.access_token;
}

async function googleJson(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      `Google Search Console HTTP ${response.status}: ${data?.error?.message || data?.error_description || "unknown"}`,
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function enableSearchConsoleApi(projectNumber) {
  const token = await accessToken("https://www.googleapis.com/auth/cloud-platform");
  const url = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(
    projectNumber,
  )}/services/searchconsole.googleapis.com:enable`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: data?.error?.message || "unknown",
    };
  }

  if (data.name) {
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const check = await fetch(
        `https://serviceusage.googleapis.com/v1/${data.name}`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      const operation = await check.json().catch(() => ({}));
      if (operation.done) {
        if (operation.error) {
          return {
            ok: false,
            status: operation.error.code || 500,
            message: operation.error.message || "enable operation failed",
          };
        }
        return { ok: true };
      }
    }
  }

  return { ok: true, pending: true };
}

async function ingest(payload) {
  const response = await fetch(`${endpoint}/signals`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gwap-ingest-key": ingestKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function storeSignal(signal) {
  const result = await ingest(signal);
  if (result.ok && result.data.storage === "stored") return "stored";
  if (result.ok && result.data.storage === "duplicate") return "duplicate";
  return "failed";
}

async function loadArticleUrls() {
  try {
    const response = await fetch(githubInventoryUrl, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "gwap-search-intelligence-v2",
      },
    });
    if (response.ok) {
      const items = await response.json();
      const urls = articleUrlsFromGitHubContents(items, targetHost);
      if (urls.length) {
        return { mode: "github-contents", source: githubInventoryUrl, urls };
      }
    }
  } catch {
    // Fall through to the public site manifest.
  }

  try {
    const response = await fetch(articleManifestUrl, {
      headers: { accept: "application/json" },
    });
    if (response.ok) {
      const manifest = await response.json();
      const urls = articleUrlsFromManifest(manifest, targetHost);
      if (urls.length) {
        return { mode: "manifest", source: articleManifestUrl, urls };
      }
    }
  } catch {
    // Fall through to sitemap.
  }

  const response = await fetch(sitemapUrl, {
    headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
  });
  if (!response.ok) {
    throw new Error(
      `GWAP article inventory unavailable: GitHub, manifest, and sitemap sources failed; sitemap HTTP ${response.status}`,
    );
  }
  const xml = await response.text();
  const urls = articleUrlsFromSitemapXml(xml, targetHost);
  if (!urls.length) {
    throw new Error("GWAP article inventory contains no /blog/ article URLs");
  }
  return { mode: "sitemap", source: sitemapUrl, urls };
}

function emptyStats() {
  return { rowsReturned: 0, stored: 0, duplicate: 0, failed: 0, skipped: 0 };
}

function record(stats, outcome) {
  if (outcome === "stored") stats.stored++;
  else if (outcome === "duplicate") stats.duplicate++;
  else stats.failed++;
}

const token = await accessToken();

let sites;
try {
  sites = await googleJson(
    "https://www.googleapis.com/webmasters/v3/sites",
    token,
  );
} catch (error) {
  const disabled =
    error?.status === 403 &&
    /has not been used|disabled/i.test(error.message || "");
  const projectNumber = String(error?.message || "").match(
    /project\s+(\d+)/i,
  )?.[1];
  if (!autoEnableApi || !disabled || !projectNumber) throw error;

  const enabled = await enableSearchConsoleApi(projectNumber);
  if (!enabled.ok) {
    throw new Error(
      `Search Console API is disabled and automatic enable failed HTTP ${enabled.status}: ${enabled.message}`,
    );
  }

  if (enabled.pending) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  sites = await googleJson(
    "https://www.googleapis.com/webmasters/v3/sites",
    token,
  );
}

const entries = Array.isArray(sites.siteEntry) ? sites.siteEntry : [];
const eligible = entries.filter(
  (entry) =>
    entry?.siteUrl && entry.permissionLevel !== "siteUnverifiedUser",
);
const matching = eligible
  .filter((entry) =>
    String(entry.siteUrl).toLowerCase().includes(targetHost),
  )
  .sort(
    (a, b) =>
      Number(String(b.siteUrl).startsWith("sc-domain:")) -
      Number(String(a.siteUrl).startsWith("sc-domain:")),
  );

if (!matching.length) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        source: "gsc",
        mode: "site-not-authorized",
        targetHost,
        accessibleSiteCount: eligible.length,
        matchedSiteCount: 0,
        actionRequired:
          "Grant the existing Google service account read access to the verified Search Console property.",
      },
      null,
      2,
    ),
  );
  process.exit(5);
}

const site = matching[0];
const siteUrl = site.siteUrl;
const endDate = isoDayOffset(-2);
const startDate = isoDayOffset(-29);
const queryUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
  siteUrl,
)}/searchAnalytics/query`;
const observedAt = new Date().toISOString();
const today = dayBucket();

const pageReport = await googleJson(queryUrl, token, {
  method: "POST",
  body: JSON.stringify({
    startDate,
    endDate,
    dimensions: ["page"],
    type: "web",
    aggregationType: "auto",
    dataState: "final",
    rowLimit: 25000,
  }),
});

const pageStats = emptyStats();
pageStats.rowsReturned = pageReport.rows?.length || 0;

for (const row of pageReport.rows || []) {
  const pageUrl = row.keys?.[0];
  const path = pagePath(pageUrl, targetHost);
  if (!pageUrl || !path || !path.startsWith("/blog/")) {
    pageStats.skipped++;
    continue;
  }

  const outcome = await storeSignal({
    sourceType: "gsc",
    sourceRef: `gsc:${slug(siteUrl)}:page:${slug(path)}:${today}`,
    title: `Search performance: ${path}`,
    url: pageUrl,
    observedAt,
    normalized: {
      adapter: "gsc-search-analytics-github-v1",
      signalKind: "search-performance",
      sniperKey: slug(path),
      siteUrl,
      permissionLevel: site.permissionLevel,
      pageUrl,
      pagePath: path,
      clicks: number(row.clicks),
      impressions: number(row.impressions),
      ctr: number(row.ctr),
      position: number(row.position),
      type: "web",
      dataState: "final",
      period: `${startDate}:${endDate}`,
    },
  });
  record(pageStats, outcome);
}

// Search Intelligence V2A: preserve the exact query + page relationship
// instead of relying only on page-level aggregates.
const queryReport = await googleJson(queryUrl, token, {
  method: "POST",
  body: JSON.stringify({
    startDate,
    endDate,
    dimensions: ["query", "page"],
    type: "web",
    aggregationType: "auto",
    dataState: "final",
    rowLimit: 25000,
  }),
});

const queryStats = emptyStats();
queryStats.rowsReturned = queryReport.rows?.length || 0;

for (const row of queryReport.rows || []) {
  const signal = buildQuerySignal({
    siteUrl,
    permissionLevel: site.permissionLevel,
    queryText: row.keys?.[0],
    pageUrl: row.keys?.[1],
    targetHost,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
    startDate,
    endDate,
    today,
    observedAt,
  });

  if (!signal) {
    queryStats.skipped++;
    continue;
  }
  record(queryStats, await storeSignal(signal));
}

// Search Intelligence V2B: inspect every current article URL and persist
// Google's indexed-version status, canonical selection, crawl/fetch state,
// and inspection evidence. The API does not perform live URL testing.
const inventory = await loadArticleUrls();
const articleUrls = inventory.urls.slice(0, inspectionLimit);
const indexStats = emptyStats();
indexStats.rowsReturned = articleUrls.length;

for (const pageUrl of articleUrls) {
  try {
    const inspection = await googleJson(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      token,
      {
        method: "POST",
        body: JSON.stringify({
          inspectionUrl: pageUrl,
          siteUrl,
          languageCode: "en-US",
        }),
      },
    );

    const signal = buildIndexSignal({
      siteUrl,
      permissionLevel: site.permissionLevel,
      pageUrl,
      targetHost,
      inspection,
      today,
      observedAt,
    });

    if (!signal) {
      indexStats.skipped++;
      continue;
    }
    record(indexStats, await storeSignal(signal));
  } catch (error) {
    indexStats.failed++;
    console.error(
      JSON.stringify({
        source: "gsc",
        signalKind: "url-index-status",
        pageUrl,
        error: String(error?.message || error).slice(0, 1000),
      }),
    );
  }
}

const totalStored =
  pageStats.stored + queryStats.stored + indexStats.stored;
const totalDuplicate =
  pageStats.duplicate + queryStats.duplicate + indexStats.duplicate;
const totalFailed =
  pageStats.failed + queryStats.failed + indexStats.failed;
const totalSkipped =
  pageStats.skipped + queryStats.skipped + indexStats.skipped;

console.log(
  JSON.stringify(
    {
      ok: totalFailed === 0,
      source: "gsc",
      mode: "search-intelligence-v2",
      targetHost,
      siteUrl,
      permissionLevel: site.permissionLevel,
      period: `${startDate}:${endDate}`,

      // Backward-compatible page-level proof fields.
      rowsReturned: pageStats.rowsReturned,
      stored: pageStats.stored,
      duplicate: pageStats.duplicate,
      failed: totalFailed,
      skipped: pageStats.skipped,

      v2aQueryCollection: queryStats,
      v2bIndexIntelligence: {
        ...indexStats,
        inventoryMode: inventory.mode,
        inventorySource: inventory.source,
        inventoryUrls: inventory.urls.length,
        inspectedUrls: articleUrls.length,
        inspectionLimit,
      },

      totals: {
        stored: totalStored,
        duplicate: totalDuplicate,
        failed: totalFailed,
        skipped: totalSkipped,
      },
    },
    null,
    2,
  ),
);

if (totalFailed > 0) process.exit(4);

import { createSign } from "node:crypto";

const endpoint = process.env.INTELLIGENCE_URL || "https://gwap-intelligence-v1.richdross.workers.dev";
const ingestKey = process.env.SIGNAL_INGEST_KEY;
const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GA4_SERVICE_ACCOUNT_JSON;
const targetHost = String(process.env.GSC_TARGET_HOST || "gwapgang.com").toLowerCase();
const autoEnableApi = String(process.env.GSC_AUTO_ENABLE_API || "").toLowerCase() === "true";

if (!ingestKey) {
  console.error("SIGNAL_INGEST_KEY is required");
  process.exit(2);
}
if (!serviceAccountJson) {
  console.error("GOOGLE_SERVICE_ACCOUNT_JSON or GA4_SERVICE_ACCOUNT_JSON is required");
  process.exit(2);
}

function base64Url(value) { return Buffer.from(value).toString("base64url"); }
function slug(value = "") {
  return String(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 12).join("-").slice(0, 160) || "unknown";
}
function dayBucket(date = new Date()) { return date.toISOString().slice(0, 10); }
function isoDayOffset(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function number(value) { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function serviceAccount() {
  try {
    const parsed = JSON.parse(serviceAccountJson);
    if (!parsed.client_email || !parsed.private_key) throw new Error("missing client_email/private_key");
    return parsed;
  } catch (error) {
    throw new Error(`Google service-account JSON is invalid: ${error.message}`);
  }
}
function pagePath(value) {
  try {
    const url = new URL(value);
    return url.hostname.toLowerCase().replace(/^www\./, "") === targetHost.replace(/^www\./, "") ? url.pathname : null;
  } catch {
    return null;
  }
}

async function accessToken(scope = "https://www.googleapis.com/auth/webmasters.readonly") {
  const service = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: service.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const assertion = `${signingInput}.${signer.sign(service.private_key).toString("base64url")}`;

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
    throw new Error(`Google OAuth token failed HTTP ${response.status}: ${data.error_description || data.error || "unknown"}`);
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
    const error = new Error(`Google Search Console HTTP ${response.status}: ${data?.error?.message || data?.error_description || "unknown"}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function enableSearchConsoleApi(projectNumber) {
  const token = await accessToken("https://www.googleapis.com/auth/cloud-platform");
  const url = `https://serviceusage.googleapis.com/v1/projects/${encodeURIComponent(projectNumber)}/services/searchconsole.googleapis.com:enable`;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, message: data?.error?.message || "unknown" };
  }

  if (data.name) {
    for (let attempt = 0; attempt < 12; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const check = await fetch(`https://serviceusage.googleapis.com/v1/${data.name}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const operation = await check.json().catch(() => ({}));
      if (operation.done) {
        if (operation.error) return { ok: false, status: operation.error.code || 500, message: operation.error.message || "enable operation failed" };
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

const token = await accessToken();
let sites;
try {
  sites = await googleJson("https://www.googleapis.com/webmasters/v3/sites", token);
} catch (error) {
  const disabled = error?.status === 403 && /has not been used|disabled/i.test(error.message || "");
  const projectNumber = String(error?.message || "").match(/project\s+(\d+)/i)?.[1];
  if (!autoEnableApi || !disabled || !projectNumber) throw error;

  const enabled = await enableSearchConsoleApi(projectNumber);
  if (!enabled.ok) {
    throw new Error(`Search Console API is disabled and automatic enable failed HTTP ${enabled.status}: ${enabled.message}`);
  }

  if (enabled.pending) await new Promise((resolve) => setTimeout(resolve, 10000));
  sites = await googleJson("https://www.googleapis.com/webmasters/v3/sites", token);
}
const entries = Array.isArray(sites.siteEntry) ? sites.siteEntry : [];
const eligible = entries.filter((entry) => entry?.siteUrl && entry.permissionLevel !== "siteUnverifiedUser");
const matching = eligible
  .filter((entry) => String(entry.siteUrl).toLowerCase().includes(targetHost))
  .sort((a, b) => Number(String(b.siteUrl).startsWith("sc-domain:")) - Number(String(a.siteUrl).startsWith("sc-domain:")));

if (!matching.length) {
  console.log(JSON.stringify({
    ok: false,
    source: "gsc",
    mode: "site-not-authorized",
    targetHost,
    accessibleSiteCount: eligible.length,
    matchedSiteCount: 0,
    actionRequired: "Grant the existing Google service account read access to the verified Search Console property.",
  }, null, 2));
  process.exit(5);
}

const site = matching[0];
const siteUrl = site.siteUrl;
const endDate = isoDayOffset(-2);
const startDate = isoDayOffset(-29);
const queryUrl = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;

const report = await googleJson(queryUrl, token, {
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

let stored = 0, duplicate = 0, failed = 0, skipped = 0;
const today = dayBucket();

for (const row of report.rows || []) {
  const pageUrl = row.keys?.[0];
  const path = pagePath(pageUrl);
  if (!pageUrl || !path || !path.startsWith("/blog/")) {
    skipped++;
    continue;
  }

  const outcome = await storeSignal({
    sourceType: "gsc",
    sourceRef: `gsc:${slug(siteUrl)}:page:${slug(path)}:${today}`,
    title: `Search performance: ${path}`,
    url: pageUrl,
    observedAt: new Date().toISOString(),
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

  if (outcome === "stored") stored++;
  else if (outcome === "duplicate") duplicate++;
  else failed++;
}

console.log(JSON.stringify({
  ok: failed === 0,
  source: "gsc",
  mode: "active",
  targetHost,
  siteUrl,
  permissionLevel: site.permissionLevel,
  period: `${startDate}:${endDate}`,
  rowsReturned: report.rows?.length || 0,
  stored,
  duplicate,
  failed,
  skipped,
}, null, 2));

if (failed > 0) process.exit(4);

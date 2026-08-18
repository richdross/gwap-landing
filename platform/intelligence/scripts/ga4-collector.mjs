import { createSign } from "node:crypto";

const endpoint = process.env.INTELLIGENCE_URL || "https://gwap-intelligence-v1.richdross.workers.dev";
const ingestKey = process.env.SIGNAL_INGEST_KEY;
const propertyId = String(process.env.GA4_PROPERTY_ID || "").replace(/^properties\//, "").trim();
const serviceAccountJson = process.env.GA4_SERVICE_ACCOUNT_JSON;

if (!ingestKey) {
  console.error("SIGNAL_INGEST_KEY is required");
  process.exit(2);
}

if (!propertyId || !serviceAccountJson) {
  console.log(JSON.stringify({
    ok: true,
    source: "ga4",
    mode: "not-configured",
    stored: 0,
    duplicate: 0,
    failed: 0,
  }, null, 2));
  process.exit(0);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function slug(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .join("-")
    .slice(0, 120) || "unknown";
}

function dayBucket(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function serviceAccount() {
  try {
    const parsed = JSON.parse(serviceAccountJson);
    if (!parsed.client_email || !parsed.private_key) throw new Error("missing client_email/private_key");
    return parsed;
  } catch (error) {
    throw new Error(`GA4_SERVICE_ACCOUNT_JSON is invalid: ${error.message}`);
  }
}

async function accessToken() {
  const service = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: service.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(service.private_key).toString("base64url");
  const assertion = `${signingInput}.${signature}`;

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

async function runReport(token, body) {
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GA4 runReport HTTP ${response.status}: ${data?.error?.message || "unknown"}`);
  }
  return data;
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

const token = await accessToken();
const today = dayBucket();
let stored = 0;
let duplicate = 0;
let failed = 0;
const summaries = [];

const pageReport = await runReport(token, {
  dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
  dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
  metrics: [
    { name: "screenPageViews" },
    { name: "activeUsers" },
    { name: "sessions" },
    { name: "eventCount" },
    { name: "userEngagementDuration" },
  ],
  orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
  limit: "50",
});

for (const row of pageReport.rows || []) {
  const path = row.dimensionValues?.[0]?.value || "/";
  const title = row.dimensionValues?.[1]?.value || path;
  const metrics = row.metricValues || [];
  const signal = {
    sourceType: "ga4",
    sourceRef: `ga4:${propertyId}:page:${slug(path)}:${today}`,
    title,
    observedAt: new Date().toISOString(),
    normalized: {
      adapter: "ga4-data-api-github-v1",
      signalKind: "page-behavior",
      sniperKey: slug(title || path),
      propertyId,
      pagePath: path,
      pageTitle: title,
      screenPageViews: number(metrics[0]?.value),
      activeUsers: number(metrics[1]?.value),
      sessions: number(metrics[2]?.value),
      eventCount: number(metrics[3]?.value),
      userEngagementDuration: number(metrics[4]?.value),
      period: "7daysAgo:today",
    },
  };
  const result = await ingest(signal);
  if (result.ok && result.data.storage === "stored") stored += 1;
  else if (result.ok && result.data.storage === "duplicate") duplicate += 1;
  else failed += 1;
}

const eventReport = await runReport(token, {
  dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
  dimensions: [{ name: "eventName" }],
  metrics: [{ name: "eventCount" }, { name: "activeUsers" }],
  orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
  limit: "50",
});

for (const row of eventReport.rows || []) {
  const eventName = row.dimensionValues?.[0]?.value || "unknown_event";
  const metrics = row.metricValues || [];
  const signal = {
    sourceType: "ga4",
    sourceRef: `ga4:${propertyId}:event:${slug(eventName)}:${today}`,
    title: `GA4 event: ${eventName}`,
    observedAt: new Date().toISOString(),
    normalized: {
      adapter: "ga4-data-api-github-v1",
      signalKind: "event-behavior",
      sniperKey: slug(eventName),
      propertyId,
      eventName,
      eventCount: number(metrics[0]?.value),
      activeUsers: number(metrics[1]?.value),
      period: "7daysAgo:today",
    },
  };
  const result = await ingest(signal);
  if (result.ok && result.data.storage === "stored") stored += 1;
  else if (result.ok && result.data.storage === "duplicate") duplicate += 1;
  else failed += 1;
}

summaries.push({ pages: pageReport.rows?.length || 0, events: eventReport.rows?.length || 0 });

console.log(JSON.stringify({
  ok: failed === 0,
  source: "ga4",
  mode: "active",
  propertyId,
  stored,
  duplicate,
  failed,
  summaries,
}, null, 2));

if (failed > 0) process.exit(4);

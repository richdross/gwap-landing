const TRENDS_RSS_BASE = "https://trends.google.com/trending/rss";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const GA4_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const DEFAULT_SEEDS = [
  "AI tools",
  "automation",
  "small business AI",
  "creator economy",
  "SaaS",
  "online business",
];

const DOMAIN_TERMS = [
  "ai", "artificial intelligence", "automation", "agent", "chatbot", "startup",
  "small business", "entrepreneur", "creator", "marketing", "ecommerce", "shopify",
  "saas", "software", "app", "youtube", "tiktok", "instagram", "side hustle",
  "freelance", "business", "sales", "lead generation", "website", "no code",
  "nocode", "coding", "productivity", "stripe", "cloudflare", "supabase", "vercel",
  "openai", "claude", "gemini", "seo", "content", "monetization", "commerce",
];

const PAIN_TERMS = [
  "need", "wish", "problem", "how do", "how can", "can't", "cannot", "doesn't",
  "expensive", "alternative", "recommend", "tool", "help", "struggling", "hard to",
  "looking for", "anyone know", "best way", "waste of time",
];

function supabaseKey(env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function supabaseHeaders(env, prefer = "return=minimal") {
  const key = supabaseKey(env);
  if (!key) return null;
  const headers = { apikey: key, "content-type": "application/json", prefer };
  if (!key.startsWith("sb_secret_")) headers.authorization = `Bearer ${key}`;
  return headers;
}

function text(value, max = 20000) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function xmlTag(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

function sniperKey(value = "") {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 10)
    .join("-")
    .slice(0, 120);
}

function sixHourBucket(date = new Date()) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(Math.floor(d.getUTCHours() / 6) * 6);
  return d.toISOString();
}

function dayBucket(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

function domainRelevance(value = "") {
  const lower = value.toLowerCase();
  return DOMAIN_TERMS.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function painMentions(comments = []) {
  let count = 0;
  for (const comment of comments) {
    const lower = String(comment || "").toLowerCase();
    if (PAIN_TERMS.some((term) => lower.includes(term))) count += 1;
  }
  return count;
}

function parseNumberish(value) {
  const n = Number(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function tokenOverlap(a = "", b = "") {
  const left = new Set(a.split(/[-\s]+/).filter((x) => x.length > 2));
  const right = new Set(b.split(/[-\s]+/).filter((x) => x.length > 2));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

async function existingSignal(env, sourceType, sourceRef) {
  if (!env.SUPABASE_URL || !supabaseKey(env) || !sourceRef) return null;
  const params = new URLSearchParams({
    select: "id,source_type,source_ref",
    source_type: `eq.${sourceType}`,
    source_ref: `eq.${sourceRef}`,
    limit: "1",
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/gwap_signals?${params}`, {
    headers: supabaseHeaders(env),
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function storeSignal(env, signal) {
  if (!env.SUPABASE_URL || !supabaseKey(env)) return { ok: false, mode: "not-configured" };
  if (signal.source_ref) {
    const existing = await existingSignal(env, signal.source_type, signal.source_ref);
    if (existing) return { ok: true, mode: "duplicate", id: existing.id };
  }
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/gwap_signals`, {
    method: "POST",
    headers: supabaseHeaders(env, "return=representation"),
    body: JSON.stringify(signal),
  });
  if (!response.ok) return { ok: false, mode: "error", status: response.status };
  const rows = await response.json();
  return { ok: true, mode: "stored", id: rows?.[0]?.id || null };
}

export async function collectGoogleTrends(env, options = {}) {
  const geo = (options.geo || env.SNIPER_GEO || "US").toUpperCase().slice(0, 8);
  const url = `${TRENDS_RSS_BASE}?geo=${encodeURIComponent(geo)}`;
  const response = await fetch(url, {
    headers: { "user-agent": "GWAP-Signal-Sniper/1.0" },
  });
  if (!response.ok) return { ok: false, source: "google-trends", status: response.status, stored: 0, candidates: [] };

  const xml = await response.text();
  const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((m) => m[1]).slice(0, 30);
  const bucket = sixHourBucket();
  const candidates = [];
  let stored = 0;
  let duplicates = 0;

  for (const block of blocks) {
    const title = xmlTag(block, "title");
    if (!title) continue;
    const key = sniperKey(title);
    const link = xmlTag(block, "link");
    const pubDate = xmlTag(block, "pubDate");
    const trafficLabel = xmlTag(block, "ht:approx_traffic");
    const observedAt = pubDate && !Number.isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : new Date().toISOString();
    const signal = {
      source_type: "google-trends",
      source_ref: `trends:${geo}:${key}:${bucket}`,
      title: text(title, 500),
      body: null,
      url: text(link, 2000),
      observed_at: observedAt,
      normalized: {
        adapter: "google-trends-rss-v1",
        sniperKey: key,
        query: title,
        geo,
        trafficLabel,
        domainRelevance: domainRelevance(title),
        observationBucket: bucket,
      },
    };
    const result = await storeSignal(env, signal);
    if (result.mode === "stored") stored += 1;
    if (result.mode === "duplicate") duplicates += 1;
    candidates.push({ title, key, relevance: domainRelevance(title), trafficLabel });
  }

  candidates.sort((a, b) => b.relevance - a.relevance);
  return { ok: true, source: "google-trends", feed: url, stored, duplicates, candidates };
}

function youtubeSeeds(env, trendCandidates = []) {
  const configured = String(env.SNIPER_SEEDS || "")
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
  const seeds = configured.length ? configured : DEFAULT_SEEDS;
  const trendQueries = trendCandidates.filter((c) => c.relevance > 0).map((c) => c.title);
  return [...new Set([...trendQueries, ...seeds])].slice(0, 6);
}

async function youtubeComments(apiKey, videoId) {
  const params = new URLSearchParams({
    part: "snippet",
    videoId,
    maxResults: "20",
    order: "relevance",
    textFormat: "plainText",
    key: apiKey,
  });
  const response = await fetch(`${YOUTUBE_API_BASE}/commentThreads?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  return (data.items || [])
    .map((item) => item?.snippet?.topLevelComment?.snippet?.textOriginal)
    .filter(Boolean)
    .slice(0, 20);
}

export async function collectYouTube(env, trendCandidates = []) {
  if (!env.YOUTUBE_API_KEY) return { ok: false, source: "youtube", mode: "not-configured", stored: 0, queries: [] };
  const queries = youtubeSeeds(env, trendCandidates);
  const publishedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const bucket = sixHourBucket();
  let stored = 0;
  let duplicates = 0;
  const queryResults = [];

  for (const query of queries) {
    const searchParams = new URLSearchParams({
      part: "snippet",
      type: "video",
      order: "date",
      maxResults: "5",
      publishedAfter,
      q: query,
      key: env.YOUTUBE_API_KEY,
    });
    const searchResponse = await fetch(`${YOUTUBE_API_BASE}/search?${searchParams}`);
    if (!searchResponse.ok) {
      queryResults.push({ query, ok: false, status: searchResponse.status });
      continue;
    }
    const searchData = await searchResponse.json();
    const videoIds = (searchData.items || []).map((item) => item?.id?.videoId).filter(Boolean);
    if (!videoIds.length) {
      queryResults.push({ query, ok: true, videos: 0 });
      continue;
    }

    const videoParams = new URLSearchParams({
      part: "snippet,statistics",
      id: videoIds.join(","),
      key: env.YOUTUBE_API_KEY,
    });
    const videosResponse = await fetch(`${YOUTUBE_API_BASE}/videos?${videoParams}`);
    if (!videosResponse.ok) {
      queryResults.push({ query, ok: false, status: videosResponse.status });
      continue;
    }
    const videosData = await videosResponse.json();
    const comments = await youtubeComments(env.YOUTUBE_API_KEY, videoIds[0]);
    const painCount = painMentions(comments);

    for (const video of videosData.items || []) {
      const id = video.id;
      const stats = video.statistics || {};
      const snippet = video.snippet || {};
      const signal = {
        source_type: "youtube",
        source_ref: `youtube:${id}:${sniperKey(query)}:${bucket}`,
        title: text(snippet.title, 500),
        body: text(snippet.description, 4000),
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
        observed_at: snippet.publishedAt || new Date().toISOString(),
        normalized: {
          adapter: "youtube-data-api-v1",
          sniperKey: sniperKey(query),
          query,
          videoId: id,
          channelId: snippet.channelId || null,
          channelTitle: snippet.channelTitle || null,
          publishedAt: snippet.publishedAt || null,
          viewCount: parseNumberish(stats.viewCount),
          likeCount: parseNumberish(stats.likeCount),
          commentCount: parseNumberish(stats.commentCount),
          sampledComments: videoIds[0] === id ? comments.length : 0,
          painMentions: videoIds[0] === id ? painCount : 0,
          observationBucket: bucket,
        },
      };
      const result = await storeSignal(env, signal);
      if (result.mode === "stored") stored += 1;
      if (result.mode === "duplicate") duplicates += 1;
    }
    queryResults.push({ query, ok: true, videos: videoIds.length, sampledComments: comments.length, painMentions: painCount });
  }

  return { ok: true, source: "youtube", stored, duplicates, queries: queryResults };
}

function base64UrlBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlString(value) {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function pemBytes(pem) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function ga4AccessToken(env) {
  if (!env.GA4_SERVICE_ACCOUNT_JSON) return null;
  const service = JSON.parse(env.GA4_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlString(JSON.stringify({
    iss: service.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(service.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const assertion = `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.access_token || null;
}

export async function collectGA4(env) {
  if (!env.GA4_PROPERTY_ID || !env.GA4_SERVICE_ACCOUNT_JSON) {
    return { ok: false, source: "ga4", mode: "not-configured", stored: 0 };
  }
  let token;
  try {
    token = await ga4AccessToken(env);
  } catch (error) {
    return { ok: false, source: "ga4", mode: "auth-error", error: String(error?.message || error).slice(0, 300), stored: 0 };
  }
  if (!token) return { ok: false, source: "ga4", mode: "auth-error", stored: 0 };

  const propertyId = String(env.GA4_PROPERTY_ID).replace(/^properties\//, "").trim();
  const response = await fetch(`${GA4_API_BASE}/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "activeUsers" },
        { name: "userEngagementDuration" },
        { name: "eventCount" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: "25",
    }),
  });
  if (!response.ok) return { ok: false, source: "ga4", mode: "api-error", status: response.status, stored: 0 };

  const data = await response.json();
  let stored = 0;
  let duplicates = 0;
  for (const row of data.rows || []) {
    const pagePath = row.dimensionValues?.[0]?.value || "/";
    const pageTitle = row.dimensionValues?.[1]?.value || pagePath;
    const metrics = row.metricValues || [];
    const signal = {
      source_type: "ga4",
      source_ref: `ga4:${propertyId}:${sniperKey(pagePath)}:${dayBucket()}`,
      title: text(pageTitle, 500),
      body: null,
      url: null,
      observed_at: new Date().toISOString(),
      normalized: {
        adapter: "ga4-data-api-v1",
        sniperKey: sniperKey(pageTitle || pagePath),
        pagePath,
        pageTitle,
        screenPageViews: parseNumberish(metrics[0]?.value),
        activeUsers: parseNumberish(metrics[1]?.value),
        userEngagementDuration: parseNumberish(metrics[2]?.value),
        eventCount: parseNumberish(metrics[3]?.value),
        period: "7daysAgo:today",
      },
    };
    const result = await storeSignal(env, signal);
    if (result.mode === "stored") stored += 1;
    if (result.mode === "duplicate") duplicates += 1;
  }
  return { ok: true, source: "ga4", stored, duplicates, rows: data.rows?.length || 0 };
}

async function recentSignals(env, days = 7) {
  if (!env.SUPABASE_URL || !supabaseKey(env)) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    select: "id,source_type,source_ref,title,url,observed_at,normalized,status",
    observed_at: `gte.${since}`,
    order: "observed_at.desc",
    limit: "750",
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/gwap_signals?${params}`, {
    headers: supabaseHeaders(env),
  });
  if (!response.ok) return [];
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function ga4Matches(key, ga4Signals) {
  return ga4Signals.filter((signal) => {
    const candidate = signal.normalized?.sniperKey || sniperKey(signal.title || "");
    return tokenOverlap(key, candidate) >= 0.34;
  });
}

function convergenceScore(key, signals) {
  const trends = signals.filter((s) => s.source_type === "google-trends" && s.normalized?.sniperKey === key);
  const youtube = signals.filter((s) => s.source_type === "youtube" && s.normalized?.sniperKey === key);
  const ga4 = ga4Matches(key, signals.filter((s) => s.source_type === "ga4"));
  const sources = new Set([
    ...(trends.length ? ["google-trends"] : []),
    ...(youtube.length ? ["youtube"] : []),
    ...(ga4.length ? ["ga4"] : []),
  ]);

  let score = 0;
  if (trends.length) score += 30;
  if (youtube.length) score += 30;
  if (ga4.length) score += 15;

  const maxViews = Math.max(0, ...youtube.map((s) => Number(s.normalized?.viewCount || 0)));
  score += Math.min(10, Math.round(Math.log10(maxViews + 1) * 2));

  const pain = youtube.reduce((sum, s) => sum + Number(s.normalized?.painMentions || 0), 0);
  score += Math.min(8, pain * 2);

  if (trends.length > 1 || youtube.length > 2) score += 5;
  if (trends.some((s) => Number(s.normalized?.domainRelevance || 0) > 0)) score += 2;

  return {
    score: Math.max(0, Math.min(100, score)),
    sources: [...sources],
    trends,
    youtube,
    ga4,
    maxViews,
    painMentions: pain,
  };
}

async function upsertOpportunity(env, key, title, convergence) {
  const now = new Date().toISOString();
  const summary = `Signal Sniper found convergence across ${convergence.sources.join(", ")}.`;
  const payload = {
    opportunity_key: `sniper:${key}`,
    title: title || key.replace(/-/g, " "),
    summary,
    score: convergence.score,
    thesis: {
      engine: "GWAP_SIGNAL_SNIPER_V1",
      convergence: convergence.sources,
      interpretation: "Multiple independent sources are pointing at the same topic. Treat this as a candidate for human/business judgment, not proof of product-market fit.",
    },
    evidence_summary: {
      googleTrendsSnapshots: convergence.trends.length,
      youtubeVideos: convergence.youtube.length,
      ga4Matches: convergence.ga4.length,
      maxYouTubeViews: convergence.maxViews,
      sampledPainMentions: convergence.painMentions,
    },
    status: convergence.score >= 80 ? "watch" : "candidate",
    last_seen_at: now,
    updated_at: now,
  };
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/gwap_opportunities?on_conflict=opportunity_key`, {
    method: "POST",
    headers: supabaseHeaders(env, "resolution=merge-duplicates,return=representation"),
    body: JSON.stringify(payload),
  });
  if (!response.ok) return { ok: false, status: response.status };
  const rows = await response.json();
  const opportunity = rows?.[0];
  if (!opportunity?.id) return { ok: false, status: 500 };

  const allSignals = [...convergence.trends, ...convergence.youtube, ...convergence.ga4].slice(0, 50);
  if (allSignals.length) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/gwap_opportunity_signals?on_conflict=opportunity_id,signal_id`, {
      method: "POST",
      headers: supabaseHeaders(env, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(allSignals.map((signal) => ({
        opportunity_id: opportunity.id,
        signal_id: signal.id,
        relevance: signal.source_type === "ga4" ? 0.75 : 1,
      }))),
    });
  }

  return { ok: true, opportunity };
}

export async function compareSignalsAndPromote(env) {
  const signals = await recentSignals(env, 7);
  const keys = new Set();
  for (const signal of signals) {
    if (["google-trends", "youtube"].includes(signal.source_type) && signal.normalized?.sniperKey) {
      keys.add(signal.normalized.sniperKey);
    }
  }

  const promoted = [];
  const compared = [];
  for (const key of [...keys].slice(0, 100)) {
    const convergence = convergenceScore(key, signals);
    compared.push({ key, score: convergence.score, sources: convergence.sources });
    if (convergence.sources.length < 2 || convergence.score < 55) continue;
    const title = convergence.trends[0]?.title || convergence.youtube[0]?.normalized?.query || convergence.youtube[0]?.title;
    const result = await upsertOpportunity(env, key, title, convergence);
    if (result.ok) promoted.push({
      key,
      score: convergence.score,
      sources: convergence.sources,
      opportunityId: result.opportunity.id,
      status: result.opportunity.status,
    });
  }

  promoted.sort((a, b) => b.score - a.score);
  compared.sort((a, b) => b.score - a.score);
  return { ok: true, signalCount: signals.length, compared: compared.slice(0, 25), promoted: promoted.slice(0, 25) };
}

export function sniperStatus(env) {
  return {
    enabled: env.ENABLE_SIGNAL_SNIPER !== "false",
    sources: {
      googleTrends: { ready: true, mode: "official-trending-rss" },
      youtube: { ready: Boolean(env.YOUTUBE_API_KEY), mode: "youtube-data-api-v3" },
      ga4: { ready: Boolean(env.GA4_PROPERTY_ID && env.GA4_SERVICE_ACCOUNT_JSON), mode: "analytics-data-api-v1beta" },
      reddit: { ready: false, mode: "dormant-pending-approved-access" },
    },
    schedule: {
      trends: "hourly",
      convergence: "every-six-hours",
    },
    scoring: "deterministic-zero-ai-cost",
  };
}

export async function runSignalSniper(env, options = {}) {
  if (env.ENABLE_SIGNAL_SNIPER === "false") return { ok: false, error: "signal_sniper_disabled" };
  const full = options.full !== false;
  const trends = await collectGoogleTrends(env, options);
  let youtube = { ok: false, source: "youtube", mode: "skipped" };
  let ga4 = { ok: false, source: "ga4", mode: "skipped" };
  if (full) {
    youtube = await collectYouTube(env, trends.candidates || []);
    ga4 = await collectGA4(env);
  }
  const convergence = await compareSignalsAndPromote(env);
  return { ok: trends.ok && convergence.ok, full, trends, youtube, ga4, convergence };
}

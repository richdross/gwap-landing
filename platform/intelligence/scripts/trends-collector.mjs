const endpoint = process.env.INTELLIGENCE_URL || "https://gwap-intelligence-v1.richdross.workers.dev";
const ingestKey = process.env.SIGNAL_INGEST_KEY;
const geo = (process.env.SNIPER_GEO || "US").toUpperCase();
const feedUrl = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;

if (!ingestKey) {
  console.error("SIGNAL_INGEST_KEY is required");
  process.exit(2);
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

const DOMAIN_TERMS = [
  "ai", "artificial intelligence", "automation", "agent", "chatbot", "startup",
  "small business", "entrepreneur", "creator", "marketing", "ecommerce", "shopify",
  "saas", "software", "app", "youtube", "tiktok", "instagram", "side hustle",
  "freelance", "business", "sales", "lead generation", "website", "no code",
  "nocode", "coding", "productivity", "stripe", "cloudflare", "supabase", "vercel",
  "openai", "claude", "gemini", "seo", "content", "monetization", "commerce",
];

function domainRelevance(value = "") {
  const lower = value.toLowerCase();
  return DOMAIN_TERMS.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function sixHourBucket(date = new Date()) {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(Math.floor(d.getUTCHours() / 6) * 6);
  return d.toISOString();
}

async function fetchWithRetry(url, attempts = 4) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; GWAP-Signal-Sniper/1.0; +https://gwapgang.com)",
        accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (response.ok) return response;
    last = response.status;
    if (![429, 500, 502, 503, 504].includes(response.status)) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
  }
  throw new Error(`Google Trends RSS fetch failed with HTTP ${last || "unknown"}`);
}

const response = await fetchWithRetry(feedUrl);
const xml = await response.text();
const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]).slice(0, 50);

if (!blocks.length) {
  console.error("No Google Trends RSS items were parsed");
  process.exit(3);
}

const bucket = sixHourBucket();
let stored = 0;
let duplicate = 0;
let failed = 0;
const top = [];

for (const block of blocks) {
  const title = xmlTag(block, "title");
  if (!title) continue;
  const link = xmlTag(block, "link");
  const pubDate = xmlTag(block, "pubDate");
  const trafficLabel = xmlTag(block, "ht:approx_traffic");
  const key = sniperKey(title);
  const observedAt = pubDate && !Number.isNaN(Date.parse(pubDate)) ? new Date(pubDate).toISOString() : new Date().toISOString();
  const payload = {
    sourceType: "google-trends",
    sourceRef: `trends:${geo}:${key}:${bucket}`,
    title,
    url: link || null,
    observedAt,
    normalized: {
      adapter: "google-trends-rss-github-v1",
      sniperKey: key,
      query: title,
      geo,
      trafficLabel,
      domainRelevance: domainRelevance(title),
      observationBucket: bucket,
    },
  };

  const ingest = await fetch(`${endpoint}/signals`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-gwap-ingest-key": ingestKey,
    },
    body: JSON.stringify(payload),
  });
  const data = await ingest.json().catch(() => ({}));
  if (ingest.ok && data.storage === "stored") stored += 1;
  else if (ingest.ok && data.storage === "duplicate") duplicate += 1;
  else failed += 1;

  top.push({ title, relevance: domainRelevance(title), trafficLabel, storage: data.storage || `HTTP ${ingest.status}` });
}

top.sort((a, b) => b.relevance - a.relevance);
console.log(JSON.stringify({
  ok: failed === 0,
  source: "google-trends",
  feedUrl,
  parsed: blocks.length,
  stored,
  duplicate,
  failed,
  top: top.slice(0, 10),
}, null, 2));

if (failed > 0) process.exit(4);

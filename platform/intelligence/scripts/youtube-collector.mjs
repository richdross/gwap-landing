const endpoint = process.env.INTELLIGENCE_URL || "https://gwap-intelligence-v1.richdross.workers.dev";
const ingestKey = process.env.SIGNAL_INGEST_KEY;
const apiKey = process.env.YOUTUBE_API_KEY;
const geo = (process.env.SNIPER_GEO || "US").toUpperCase();
const trendsUrl = `https://trends.google.com/trending/rss?geo=${encodeURIComponent(geo)}`;

if (!ingestKey) {
  console.error("SIGNAL_INGEST_KEY is required");
  process.exit(2);
}
if (!apiKey) {
  console.error("YOUTUBE_API_KEY is required");
  process.exit(2);
}

const DEFAULT_SEEDS = ["AI tools", "automation", "small business AI"];
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

function domainRelevance(value = "") {
  const lower = value.toLowerCase();
  return DOMAIN_TERMS.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0);
}

function trafficNumber(label = "") {
  const number = Number(String(label).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(number)) return 0;
  const lower = String(label).toLowerCase();
  if (lower.includes("m")) return number * 1_000_000;
  if (lower.includes("k")) return number * 1_000;
  return number;
}

function painMentions(comments = []) {
  let count = 0;
  for (const comment of comments) {
    const lower = String(comment || "").toLowerCase();
    if (PAIN_TERMS.some((term) => lower.includes(term))) count += 1;
  }
  return count;
}

async function fetchTrends() {
  try {
    const response = await fetch(trendsUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; GWAP-Signal-Sniper/1.0; +https://gwapgang.com)",
        accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return [];
    const xml = await response.text();
    const blocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => match[1]).slice(0, 50);
    return blocks.map((block) => {
      const title = xmlTag(block, "title");
      const trafficLabel = xmlTag(block, "ht:approx_traffic");
      return {
        title,
        trafficLabel,
        relevance: domainRelevance(title || ""),
        traffic: trafficNumber(trafficLabel),
      };
    }).filter((item) => item.title);
  } catch {
    return [];
  }
}

async function youtubeSearch(query) {
  const publishedAfter = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    order: "date",
    maxResults: "5",
    publishedAfter,
    q: query,
    key: apiKey,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`search:${query}:HTTP ${response.status}:${data?.error?.message || "unknown"}`);
  return (data.items || []).map((item) => item?.id?.videoId).filter(Boolean);
}

async function youtubeVideos(ids) {
  if (!ids.length) return [];
  const params = new URLSearchParams({
    part: "snippet,statistics",
    id: ids.join(","),
    key: apiKey,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`videos:HTTP ${response.status}:${data?.error?.message || "unknown"}`);
  return data.items || [];
}

async function youtubeComments(videoId) {
  const params = new URLSearchParams({
    part: "snippet",
    videoId,
    maxResults: "20",
    order: "relevance",
    textFormat: "plainText",
    key: apiKey,
  });
  const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params}`);
  if (!response.ok) return [];
  const data = await response.json().catch(() => ({}));
  return (data.items || [])
    .map((item) => item?.snippet?.topLevelComment?.snippet?.textOriginal)
    .filter(Boolean)
    .slice(0, 20);
}

async function ingestSignal(payload) {
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

const trends = await fetchTrends();
const relevantTrends = trends
  .filter((item) => item.relevance > 0)
  .sort((a, b) => (b.relevance - a.relevance) || (b.traffic - a.traffic))
  .slice(0, 3)
  .map((item) => item.title);
const highTrafficTrends = trends
  .sort((a, b) => b.traffic - a.traffic)
  .slice(0, 2)
  .map((item) => item.title);
const queries = [...new Set([...relevantTrends, ...highTrafficTrends, ...DEFAULT_SEEDS])].slice(0, 6);

const bucket = sixHourBucket();
let stored = 0;
let duplicate = 0;
let failed = 0;
const results = [];

for (const query of queries) {
  try {
    const ids = await youtubeSearch(query);
    const videos = await youtubeVideos(ids);
    const comments = ids[0] ? await youtubeComments(ids[0]) : [];
    const painCount = painMentions(comments);
    let queryStored = 0;
    let queryDuplicate = 0;

    for (const video of videos) {
      const id = video.id;
      const snippet = video.snippet || {};
      const stats = video.statistics || {};
      const payload = {
        sourceType: "youtube",
        sourceRef: `youtube:${id}:${sniperKey(query)}:${bucket}`,
        title: snippet.title || null,
        body: snippet.description || null,
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
        observedAt: snippet.publishedAt || new Date().toISOString(),
        normalized: {
          adapter: "youtube-data-api-github-v1",
          sniperKey: sniperKey(query),
          query,
          queryDomainRelevance: domainRelevance(query),
          videoId: id,
          channelId: snippet.channelId || null,
          channelTitle: snippet.channelTitle || null,
          publishedAt: snippet.publishedAt || null,
          viewCount: Number(stats.viewCount || 0),
          likeCount: Number(stats.likeCount || 0),
          commentCount: Number(stats.commentCount || 0),
          sampledComments: ids[0] === id ? comments.length : 0,
          painMentions: ids[0] === id ? painCount : 0,
          observationBucket: bucket,
        },
      };
      const ingest = await ingestSignal(payload);
      if (ingest.ok && ingest.data.storage === "stored") {
        stored += 1;
        queryStored += 1;
      } else if (ingest.ok && ingest.data.storage === "duplicate") {
        duplicate += 1;
        queryDuplicate += 1;
      } else {
        failed += 1;
      }
    }

    results.push({ query, videos: videos.length, commentsSampled: comments.length, painMentions: painCount, stored: queryStored, duplicate: queryDuplicate });
  } catch (error) {
    failed += 1;
    results.push({ query, error: String(error?.message || error).slice(0, 500) });
  }
}

console.log(JSON.stringify({
  ok: failed === 0,
  source: "youtube",
  queryCount: queries.length,
  queries,
  stored,
  duplicate,
  failed,
  results,
}, null, 2));

if (stored === 0 && duplicate === 0) process.exit(4);

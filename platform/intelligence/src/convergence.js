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

function tokenOverlap(a = "", b = "") {
  const left = new Set(a.split(/[-\s]+/).filter((x) => x.length > 2));
  const right = new Set(b.split(/[-\s]+/).filter((x) => x.length > 2));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
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

function strictConvergence(key, signals) {
  const trends = signals.filter((signal) =>
    signal.source_type === "google-trends" &&
    signal.normalized?.sniperKey === key &&
    Number(signal.normalized?.domainRelevance || 0) > 0
  );
  const youtube = signals.filter((signal) =>
    signal.source_type === "youtube" &&
    signal.normalized?.sniperKey === key &&
    Number(signal.normalized?.queryDomainRelevance ?? 1) > 0
  );
  const ga4 = ga4Matches(key, signals.filter((signal) => signal.source_type === "ga4"));

  const sources = new Set([
    ...(trends.length ? ["google-trends"] : []),
    ...(youtube.length ? ["youtube"] : []),
    ...(ga4.length ? ["ga4"] : []),
  ]);

  let score = 0;
  if (trends.length) score += 35;
  if (youtube.length) score += 30;
  if (ga4.length) score += 15;

  const maxViews = Math.max(0, ...youtube.map((signal) => Number(signal.normalized?.viewCount || 0)));
  score += Math.min(8, Math.round(Math.log10(maxViews + 1) * 2));

  const pain = youtube.reduce((sum, signal) => sum + Number(signal.normalized?.painMentions || 0), 0);
  score += Math.min(8, pain * 2);

  if (trends.length > 1 || youtube.length > 2) score += 4;

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
  const payload = {
    opportunity_key: `sniper:${key}`,
    title: title || key.replace(/-/g, " "),
    summary: `Signal Sniper found business-relevant convergence across ${convergence.sources.join(", ")}.`,
    score: convergence.score,
    thesis: {
      engine: "GWAP_SIGNAL_SNIPER_V1_STRICT",
      convergence: convergence.sources,
      qualityGate: "business_relevant_trend_required",
      interpretation: "Multiple independent sources are pointing at the same business-relevant topic. Treat this as a candidate for human/business judgment, not proof of product-market fit.",
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

  const linked = [...convergence.trends, ...convergence.youtube, ...convergence.ga4].slice(0, 50);
  if (linked.length) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/gwap_opportunity_signals?on_conflict=opportunity_id,signal_id`, {
      method: "POST",
      headers: supabaseHeaders(env, "resolution=merge-duplicates,return=minimal"),
      body: JSON.stringify(linked.map((signal) => ({
        opportunity_id: opportunity.id,
        signal_id: signal.id,
        relevance: signal.source_type === "ga4" ? 0.75 : 1,
      }))),
    });
  }
  return { ok: true, opportunity };
}

export async function compareSignalsAndPromoteStrict(env) {
  const signals = await recentSignals(env, 7);
  const relevantTrendKeys = new Set(
    signals
      .filter((signal) => signal.source_type === "google-trends" && Number(signal.normalized?.domainRelevance || 0) > 0)
      .map((signal) => signal.normalized?.sniperKey)
      .filter(Boolean),
  );

  const compared = [];
  const promoted = [];
  for (const key of [...relevantTrendKeys].slice(0, 100)) {
    const convergence = strictConvergence(key, signals);
    compared.push({ key, score: convergence.score, sources: convergence.sources });
    if (convergence.sources.length < 2 || convergence.score < 60) continue;
    const title = convergence.trends[0]?.title || convergence.youtube[0]?.normalized?.query || convergence.youtube[0]?.title;
    const result = await upsertOpportunity(env, key, title, convergence);
    if (result.ok) {
      promoted.push({
        key,
        score: convergence.score,
        sources: convergence.sources,
        opportunityId: result.opportunity.id,
        status: result.opportunity.status,
      });
    }
  }

  compared.sort((a, b) => b.score - a.score);
  promoted.sort((a, b) => b.score - a.score);
  return {
    ok: true,
    qualityGate: "business_relevant_trend_required",
    signalCount: signals.length,
    relevantTrendKeys: relevantTrendKeys.size,
    compared: compared.slice(0, 25),
    promoted: promoted.slice(0, 25),
  };
}

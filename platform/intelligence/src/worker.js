import { runSignalSniper, sniperStatus } from "./sniper.js";
import { compareSignalsAndPromoteStrict } from "./convergence.js";

const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

function supabaseKey(env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || null;
}

function supabaseHeaders(env, prefer = "return=minimal") {
  const key = supabaseKey(env);
  if (!key) return null;
  const headers = {
    apikey: key,
    "content-type": "application/json",
    prefer,
  };
  if (!key.startsWith("sb_secret_")) headers.authorization = `Bearer ${key}`;
  return headers;
}

async function findExistingSignal(env, sourceType, sourceRef) {
  if (!env.SUPABASE_URL || !sourceRef) return null;
  const headers = supabaseHeaders(env);
  if (!headers) return null;
  const params = new URLSearchParams({
    select: "id,source_type,source_ref",
    source_type: `eq.${sourceType}`,
    source_ref: `eq.${sourceRef}`,
    limit: "1",
  });
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/gwap_signals?${params}`, { headers });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function storeSignal(env, signal) {
  if (!env.SUPABASE_URL || !supabaseKey(env)) return { ok: false, mode: "not-configured" };
  if (signal.source_ref) {
    const existing = await findExistingSignal(env, signal.source_type, signal.source_ref);
    if (existing) return { ok: true, mode: "duplicate", id: existing.id };
  }
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/gwap_signals`, {
    method: "POST",
    headers: supabaseHeaders(env),
    body: JSON.stringify(signal),
  });
  return response.ok ? { ok: true, mode: "stored" } : { ok: false, mode: "error", status: response.status };
}

function authorizedIngest(request, env) {
  if (!env.SIGNAL_INGEST_KEY) return { ok: false, status: 503, error: "signal_ingest_not_configured" };
  const supplied = request.headers.get("x-gwap-ingest-key");
  if (!supplied || supplied !== env.SIGNAL_INGEST_KEY) return { ok: false, status: 401, error: "unauthorized_signal_ingest" };
  return { ok: true };
}

function canonicalSignal(body) {
  if (!body || typeof body.sourceType !== "string") return null;
  return {
    source_type: body.sourceType.slice(0, 80),
    source_ref: typeof body.sourceRef === "string" ? body.sourceRef.slice(0, 500) : null,
    title: typeof body.title === "string" ? body.title.slice(0, 500) : null,
    body: typeof body.body === "string" ? body.body.slice(0, 20000) : null,
    url: typeof body.url === "string" ? body.url.slice(0, 2000) : null,
    observed_at: body.observedAt || new Date().toISOString(),
    normalized: body.normalized && typeof body.normalized === "object" ? body.normalized : {},
  };
}

function legacyRedditSignal(body) {
  if (!body || typeof body !== "object") return null;
  const payload = body.payload && typeof body.payload === "object" ? body.payload : body;
  const title = typeof payload.title === "string" ? payload.title : null;
  const url = typeof payload.url === "string" ? payload.url : null;
  const explicitRef = typeof body.sourceRef === "string" ? body.sourceRef : null;
  if (!title && !url && !explicitRef) return null;
  return {
    source_type: "reddit",
    source_ref: (explicitRef || url)?.slice(0, 500) || null,
    title: title?.slice(0, 500) || null,
    body: typeof payload.body === "string" ? payload.body.slice(0, 20000) : null,
    url: url?.slice(0, 2000) || null,
    observed_at: payload.observedAt || body.observedAt || new Date().toISOString(),
    normalized: {
      adapter: "reddit-legacy-v1",
      legacyEventType: typeof body.type === "string" ? body.type : "SIGNAL_RAW_FOUND",
      legacySource: typeof body.source === "string" ? body.source : "reddit-ai",
      category: typeof payload.category === "string" ? payload.category : "reddit-ai",
      score: Number.isFinite(payload.score) ? payload.score : null,
      comments: Number.isFinite(payload.comments) ? payload.comments : null,
    },
  };
}

async function persistSignal(request, env, adapter) {
  const auth = authorizedIngest(request, env);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const body = await readJson(request);
  const signal = adapter(body);
  if (!signal) return json({ ok: false, error: "invalid_signal" }, 400);
  const storage = await storeSignal(env, signal);
  if (!storage.ok && storage.mode !== "not-configured") return json({ ok: false, error: "signal_storage_failed", storage }, 502);
  if (env.SIGNAL_QUEUE && env.ENABLE_QUEUES === "true" && storage.mode === "stored") {
    await env.SIGNAL_QUEUE.send({ type: "signal.received", signal });
  }
  return json({
    ok: true,
    storage: storage.mode,
    queued: Boolean(env.SIGNAL_QUEUE && env.ENABLE_QUEUES === "true" && storage.mode === "stored"),
    adapter: adapter === legacyRedditSignal ? "reddit-legacy-v1" : "canonical-v1",
  }, 202);
}

function intelligenceCapabilities(env) {
  return {
    supabase: Boolean(env.SUPABASE_URL && supabaseKey(env)),
    signalIngestAuth: Boolean(env.SIGNAL_INGEST_KEY),
    redditLegacyAdapter: true,
    signalSniper: sniperStatus(env),
    workersAI: Boolean(env.AI) && env.ENABLE_WORKERS_AI === "true",
    vectorize: Boolean(env.VECTOR_INDEX) && env.ENABLE_VECTORIZE === "true",
    queue: Boolean(env.SIGNAL_QUEUE) && env.ENABLE_QUEUES === "true",
    workflows: Boolean(env.INTELLIGENCE_WORKFLOW) && env.ENABLE_WORKFLOWS === "true",
    browserRun: Boolean(env.BROWSER) && env.ENABLE_BROWSER_RUN === "true",
    agents: env.ENABLE_AGENTS === "true",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true, service: "gwap-intelligence", costMode: "zero-incremental-cost", capabilities: intelligenceCapabilities(env), timestamp: new Date().toISOString() });
    }
    if (url.pathname === "/sniper/status" && request.method === "GET") return json({ ok: true, sniper: sniperStatus(env) });
    if (url.pathname === "/sniper/run" && request.method === "POST") {
      const auth = authorizedIngest(request, env);
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
      const body = (await readJson(request)) || {};
      const result = await runSignalSniper(env, { full: body.full !== false, geo: body.geo });
      return json(result, result.ok ? 200 : 502);
    }
    if (url.pathname === "/sniper/compare" && request.method === "POST") {
      const auth = authorizedIngest(request, env);
      if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
      const result = await compareSignalsAndPromoteStrict(env);
      return json(result, result.ok ? 200 : 502);
    }
    if (url.pathname === "/signals" && request.method === "POST") return persistSignal(request, env, canonicalSignal);
    if (url.pathname === "/signals/reddit-legacy" && request.method === "POST") return persistSignal(request, env, legacyRedditSignal);
    if (url.pathname === "/judge" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return json({ ok: false, error: "invalid_request" }, 400);
      if (!(env.AI && env.ENABLE_WORKERS_AI === "true")) {
        return json({ ok: false, error: "ai_disabled_zero_cost_guardrail", message: "Workers AI is not enabled for this environment. Enable only after free-tier guardrails are verified." }, 503);
      }
      return json({ ok: false, error: "judgment_model_not_selected" }, 501);
    }
    return json({ ok: false, error: "not_found" }, 404);
  },

  async scheduled(controller, env, ctx) {
    if (env.ENABLE_SIGNAL_SNIPER === "false") return;
    ctx.waitUntil(compareSignalsAndPromoteStrict(env).then((result) => {
      console.log("GWAP Signal Sniper convergence run", JSON.stringify({
        ok: result.ok,
        relevantTrendKeys: result.relevantTrendKeys || 0,
        promoted: result.promoted?.length || 0,
      }));
    }));
  },

  async queue(batch, env) {
    if (env.ENABLE_QUEUES !== "true") return;
    for (const message of batch.messages) {
      console.log("GWAP intelligence queue event", message.body?.type || "unknown");
      message.ack();
    }
  },
};

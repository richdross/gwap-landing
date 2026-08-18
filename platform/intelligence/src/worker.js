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

async function supabaseInsert(env, table, row) {
  const key = supabaseKey(env);
  if (!env.SUPABASE_URL || !key) {
    return { ok: false, mode: "not-configured" };
  }

  const headers = {
    apikey: key,
    "content-type": "application/json",
    prefer: "return=minimal",
  };
  if (!key.startsWith("sb_secret_")) {
    headers.authorization = `Bearer ${key}`;
  }

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(row),
  });
  return response.ok ? { ok: true, mode: "stored" } : { ok: false, mode: "error", status: response.status };
}

function intelligenceCapabilities(env) {
  return {
    supabase: Boolean(env.SUPABASE_URL && supabaseKey(env)),
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
      return json({
        ok: true,
        service: "gwap-intelligence",
        costMode: "zero-incremental-cost",
        capabilities: intelligenceCapabilities(env),
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/signals" && request.method === "POST") {
      const body = await readJson(request);
      if (!body || typeof body.sourceType !== "string") {
        return json({ ok: false, error: "invalid_signal" }, 400);
      }

      const signal = {
        source_type: body.sourceType.slice(0, 80),
        source_ref: typeof body.sourceRef === "string" ? body.sourceRef.slice(0, 500) : null,
        title: typeof body.title === "string" ? body.title.slice(0, 500) : null,
        body: typeof body.body === "string" ? body.body.slice(0, 20000) : null,
        url: typeof body.url === "string" ? body.url.slice(0, 2000) : null,
        observed_at: body.observedAt || new Date().toISOString(),
        normalized: body.normalized && typeof body.normalized === "object" ? body.normalized : {},
      };

      const storage = await supabaseInsert(env, "gwap_signals", signal);
      if (!storage.ok && storage.mode !== "not-configured") {
        return json({ ok: false, error: "signal_storage_failed", storage }, 502);
      }

      if (env.SIGNAL_QUEUE && env.ENABLE_QUEUES === "true") {
        await env.SIGNAL_QUEUE.send({ type: "signal.received", signal });
      }

      return json({ ok: true, storage: storage.mode, queued: Boolean(env.SIGNAL_QUEUE && env.ENABLE_QUEUES === "true") }, 202);
    }

    if (url.pathname === "/judge" && request.method === "POST") {
      const body = await readJson(request);
      if (!body) return json({ ok: false, error: "invalid_request" }, 400);

      if (!(env.AI && env.ENABLE_WORKERS_AI === "true")) {
        return json({
          ok: false,
          error: "ai_disabled_zero_cost_guardrail",
          message: "Workers AI is not enabled for this environment. Enable only after free-tier guardrails are verified.",
        }, 503);
      }

      return json({ ok: false, error: "judgment_model_not_selected" }, 501);
    }

    return json({ ok: false, error: "not_found" }, 404);
  },

  async queue(batch, env) {
    if (env.ENABLE_QUEUES !== "true") return;
    for (const message of batch.messages) {
      console.log("GWAP intelligence queue event", message.body?.type || "unknown");
      message.ack();
    }
  },
};

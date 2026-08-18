const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const ALLOWED_EVENTS = new Set([
  "landing_view",
  "scanner_start",
  "scanner_complete",
  "greenprint_view",
  "build_click",
  "checkout_start",
  "checkout_success",
]);

const VALID = {
  goal: new Set(["money", "customers", "build", "automate", "audience", "clarity"]),
  asset: new Set(["skills", "business", "audience", "site", "customers", "tech", "scratch"]),
  constraint: new Set(["fast", "audience", "money", "time", "offer", "ideas", "customers"]),
};

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function isScannerInput(value) {
  return Boolean(
    value &&
      VALID.goal.has(value.goal) &&
      VALID.asset.has(value.asset) &&
      VALID.constraint.has(value.constraint),
  );
}

function judgeOpportunity({ goal, asset, constraint }) {
  let result = {
    key: "productized-outcome",
    score: 82,
    move: "Productize one painful outcome and test it with buyers before expanding the system.",
    why: "Your fastest useful intelligence now comes from market behavior, not another planning cycle.",
    whyNow: "A real buyer gives better evidence than another round of private planning.",
    avoid: "Do not expand the platform until one concrete outcome earns attention.",
    win: "One clear offer, one live conversion path, and the first qualified customer action.",
  };

  if (goal === "customers" || constraint === "customers") {
    result = {
      key: "customer-acquisition-offer",
      score: 91,
      move: "Turn the strongest thing you already have into one specific customer-acquisition offer.",
      why: "Your bottleneck is distribution, so building more before testing acquisition adds delay.",
      whyNow: "Existing assets can become proof and a reason to start customer conversations immediately.",
      avoid: "Do not disappear into another product rebuild.",
      win: "Ten qualified conversations and at least one paid or strongly validated next step.",
    };
  } else if (goal === "clarity" || constraint === "ideas") {
    result = {
      key: "decision-sprint",
      score: 89,
      move: "Choose one offer using pain × reachability × speed to revenue, then run one public demand test.",
      why: "Your bottleneck is selection. A market test will produce better evidence than another brainstorm.",
      whyNow: "Decision latency is costing more than imperfect execution.",
      avoid: "Do not start a second project until the first receives market evidence.",
      win: "One selected offer and one public demand test with measurable response.",
    };
  } else if (goal === "automate") {
    result = {
      key: "revenue-automation",
      score: 87,
      move: "Automate one repeated workflow tied directly to revenue, delivery, or customer response time.",
      why: "Automation is valuable when it removes recurring work around a measurable business outcome.",
      whyNow: "A narrow workflow can prove leverage quickly without creating infrastructure debt.",
      avoid: "Do not automate a process that has not been proven manually.",
      win: "One verified workflow that saves time or increases throughput every week.",
    };
  } else if (asset === "audience") {
    result = {
      key: "audience-offer",
      score: 93,
      move: "Sell a small, specific outcome to the audience you already own before building a larger product.",
      why: "Distribution is usually the expensive part. You already have attention, so use it to test willingness to pay.",
      whyNow: "Existing attention can produce revenue and product evidence immediately.",
      avoid: "Do not hide behind a long build cycle.",
      win: "First purchases, deposits, or qualified hand-raises from the current audience.",
    };
  } else if (asset === "tech" && goal === "money") {
    result = {
      key: "automation-service",
      score: 95,
      move: "Sell a narrow automation service with a fixed outcome and fixed scope before building SaaS.",
      why: "Technical ability monetizes faster when customers buy the outcome instead of the machinery.",
      whyNow: "You can deliver value before taking on a full product build.",
      avoid: "Do not lead with AI features, architecture, or tooling.",
      win: "One buyer pays for a clearly defined automated outcome.",
    };
  } else if (constraint === "fast") {
    result = {
      key: "fast-cash-offer",
      score: 94,
      move: "Package the fastest result you can already deliver and sell it as a fixed-scope offer.",
      why: "Your constraint is time-to-cash. Existing capability should be monetized before new software is built.",
      whyNow: "A service or assisted product can close before a full SaaS product can mature.",
      avoid: "Do not make revenue depend on a new audience or a long engineering cycle.",
      win: "A real buyer pays or commits to a clearly scoped result.",
    };
  }

  return result;
}

async function verifyTurnstile(request, env, token) {
  if (!env.TURNSTILE_SECRET_KEY) return { ok: true, mode: "not-configured" };
  if (!token) return { ok: false, error: "turnstile_required" };

  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET_KEY);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = await response.json();
  return data.success ? { ok: true, mode: "verified" } : { ok: false, error: "turnstile_failed" };
}

function supabaseKey(env) {
  return env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || null;
}

async function supabaseInsert(env, table, row) {
  const key = supabaseKey(env);
  if (!env.SUPABASE_URL || !key) {
    return { ok: false, mode: "not-configured" };
  }

  try {
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
    return response.ok
      ? { ok: true, mode: "stored" }
      : { ok: false, mode: "configured-error", status: response.status };
  } catch {
    return { ok: false, mode: "network-error" };
  }
}

async function createCheckout(request, env, payload = {}) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return json(
      {
        ok: false,
        error: "checkout_not_configured",
        message: "Stripe Checkout is intentionally disabled until production price bindings are installed.",
      },
      503,
    );
  }

  const origin = new URL(request.url).origin;
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price]", env.STRIPE_PRICE_ID);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/?checkout=cancelled`);
  form.set("allow_promotion_codes", "true");
  if (payload.scannerRunId) form.set("client_reference_id", payload.scannerRunId);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = await response.json();

  if (!response.ok || !data.url) {
    return json({ ok: false, error: "stripe_checkout_failed" }, 502);
  }

  await supabaseInsert(env, "gwap_events", {
    event_name: "checkout_start",
    session_id: payload.sessionId || null,
    payload: { scannerRunId: payload.scannerRunId || null, stripeSessionId: data.id },
  });

  return json({ ok: true, url: data.url });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "gwapgang-core",
        architecture: "github-cloudflare-supabase-stripe",
        environment: env.ENVIRONMENT || "preview",
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/api/config") {
      return json({
        public: {
          architecture: "AI -> GitHub -> Cloudflare -> Supabase/Stripe",
          runtime: "Cloudflare Workers + Static Assets",
          database: "Supabase",
          payments: "Stripe",
        },
        capabilities: {
          scannerApi: true,
          eventApi: true,
          turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
          supabaseEvents: Boolean(env.SUPABASE_URL && supabaseKey(env)),
          stripeCheckout: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_ID),
        },
      });
    }

    if (url.pathname === "/api/scanner" && request.method === "POST") {
      const body = await readJson(request);
      if (!body || !isScannerInput(body.answers)) {
        return json({ ok: false, error: "invalid_scanner_input" }, 400);
      }

      const turnstile = await verifyTurnstile(request, env, body.turnstileToken);
      if (!turnstile.ok) return json({ ok: false, error: turnstile.error }, 403);

      const result = judgeOpportunity(body.answers);
      const scannerRunId = crypto.randomUUID();
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 120) : null;

      await supabaseInsert(env, "gwap_scanner_runs", {
        id: scannerRunId,
        session_id: sessionId,
        goal: body.answers.goal,
        asset: body.answers.asset,
        constraint: body.answers.constraint,
        move_key: result.key,
        result,
      });

      await supabaseInsert(env, "gwap_events", {
        event_name: "scanner_complete",
        session_id: sessionId,
        payload: { scannerRunId, moveKey: result.key, score: result.score },
      });

      return json({ ok: true, scannerRunId, result });
    }

    if (url.pathname === "/api/events" && request.method === "POST") {
      const body = await readJson(request);
      if (!body || !ALLOWED_EVENTS.has(body.eventName)) {
        return json({ ok: false, error: "invalid_event" }, 400);
      }

      const storage = await supabaseInsert(env, "gwap_events", {
        event_name: body.eventName,
        session_id: typeof body.sessionId === "string" ? body.sessionId.slice(0, 120) : null,
        payload: body.payload && typeof body.payload === "object" ? body.payload : {},
      });
      return json({ ok: true, storage: storage.mode });
    }

    if (url.pathname === "/api/checkout" && request.method === "POST") {
      const body = (await readJson(request)) || {};
      return createCheckout(request, env, body);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data, null, 2), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        service: "gwapgang-core",
        architecture: "github-cloudflare-supabase-stripe",
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
        enabledNow: [
          "static-assets",
          "worker-api",
          "observability",
        ],
        nextBindings: [
          "turnstile",
          "ai-gateway",
          "r2",
          "supabase",
          "stripe-webhooks",
        ],
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "not_found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

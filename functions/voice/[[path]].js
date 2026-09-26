const VOICE_ORIGIN = "https://gwap-backend.onrender.com";

export async function onRequest({ request }) {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, VOICE_ORIGIN);

  const headers = new Headers(request.headers);
  headers.set("X-Forwarded-Host", incoming.host);
  headers.set("X-Forwarded-Proto", incoming.protocol.replace(":", ""));

  const init = {
    method: request.method,
    headers,
    redirect: "manual"
  };

  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
    init.body = request.body;
  }

  const upstreamResponse = await fetch(new Request(upstream.toString(), init));
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Gwap-Voice-Proxy", "v0.2.1");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}

const VOICE_ORIGIN = "https://gwap-backend.onrender.com";
const CHAT_MAX_BYTES = 8192;

function jsonError(status, error) {
  return Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function boundedBody(request, field = "message") {
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return { error: jsonError(415, "Conversation request must be JSON.") };
  }
  const reader = request.body?.getReader();
  if (!reader) return { error: jsonError(400, "Conversation request is empty.") };
  let count = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > CHAT_MAX_BYTES) {
        await reader.cancel();
        return { error: jsonError(413, "Conversation request is too large.") };
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(count);
  let offset = 0;
  for (const part of chunks) { data.set(part, offset); offset += part.byteLength; }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(data));
    if (!parsed || typeof parsed !== "object" || typeof parsed[field] !== "string") {
      return { error: jsonError(400, "Conversation message is missing.") };
    }
  } catch { return { error: jsonError(400, "Invalid conversation JSON.") }; }
  return { body: data };
}

async function fastChat({ request, env, incoming }) {
  if (request.method !== "POST") return jsonError(405, "Method not allowed.");
  const origin = request.headers.get("origin");
  if (origin && origin !== incoming.origin) return jsonError(403, "Cross-origin request rejected.");
  const cookie = request.headers.get("cookie") || "";
  if (!cookie.includes("gwap_voice_device=")) return jsonError(401, "Voice device pairing required.");

  const configured = String(env?.GWAP_VOICE_FAST_CHAT_URL || "").trim();
  const token = String(env?.GWAP_VOICE_FAST_CHAT_TOKEN || "").trim();
  let target;
  try {
    target = new URL("/api/voice/chat", configured);
    if (target.protocol !== "https:" || !target.hostname || token.length < 32) throw Error("configuration");
  } catch {
    return jsonError(503, "Voice conversation is not configured.");
  }

  // Check the existing HttpOnly paired-device session; never expose the model token to a browser.
  let paired;
  try {
    const check = await fetch(new URL("/voice/session", VOICE_ORIGIN), {
      method: "GET", headers: { Cookie: cookie }, redirect: "manual",
      signal: AbortSignal.timeout(6500)
    });
    if (!check.ok) return jsonError(401, "Voice device session expired.");
    const state = await check.json();
    paired = state.paired === true;
  } catch {
    return jsonError(503, "Unable to verify voice session.");
  }
  if (!paired) return jsonError(401, "Voice device pairing required.");
  const body = await boundedBody(request);
  if (body.error) return body.error;

  const streaming = request.headers.get("accept")?.toLowerCase().includes("text/event-stream") === true;
  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", ...(streaming ? {Accept:"text/event-stream"} : {}) },
      body: body.body, redirect: "manual", signal: AbortSignal.timeout(25000)
    });
    // Keep untrusted upstream headers and all secrets out of browser responses.
    if (!upstream.ok) {
      if (upstream.status === 429) return jsonError(429, "Conversation rate limit reached.");
      return jsonError(503, "Conversation temporarily unavailable.");
    }
    if (streaming) {
      if (!upstream.body || !upstream.headers.get("content-type")?.includes("text/event-stream")) {
        return jsonError(502, "Conversation stream unavailable.");
      }
      return new Response(upstream.body, { headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
        "X-Gwap-Voice-Path": "stream-chat-v0.3"
      } });
    }
    const payload = await upstream.json();
    if (typeof payload?.spoken_response !== "string" || !payload.spoken_response.trim()) {
      return jsonError(502, "Voice model returned no speech.");
    }
    return Response.json({
      ok: true, mode: "conversation", spoken_response: payload.spoken_response.slice(0, 3000)
    }, { headers: { "Cache-Control": "no-store", "X-Gwap-Voice-Path": "fast-chat-v0.3" } });
  } catch {
    return jsonError(503, "Voice conversation connection failed.");
  }
}

async function transcribeAudio({ request, env, incoming }) {
  if (request.method !== "POST") return jsonError(405, "Method not allowed.");
  const origin = request.headers.get("origin");
  if (origin !== incoming.origin) return jsonError(403, "Same-origin microphone request required.");
  const cookie = request.headers.get("cookie") || "";
  if (!cookie.includes("gwap_voice_device=")) return jsonError(401, "Voice device pairing required.");
  const mime = String(request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["audio/mp4","audio/webm","audio/ogg","audio/wav","audio/x-wav","audio/mpeg","audio/mp3"].includes(mime)) {
    return jsonError(415, "Unsupported voice recording format.");
  }
  if (Number(request.headers.get("content-length")) > 650000) return jsonError(413, "Recording too large.");
  const configured = String(env?.GWAP_VOICE_FAST_CHAT_URL || "").trim();
  const token = String(env?.GWAP_VOICE_FAST_CHAT_TOKEN || "").trim();
  let target;
  try {
    target = new URL("/api/voice/transcribe", configured);
    if (target.protocol !== "https:" || token.length < 32) throw new Error("configuration");
  } catch { return jsonError(503, "Speech service is not configured."); }
  try {
    const check = await fetch(new URL("/voice/session", VOICE_ORIGIN), {
      method: "GET", headers: { Cookie: cookie }, redirect: "manual", signal: AbortSignal.timeout(6500)
    });
    if (!check.ok || (await check.json()).paired !== true) {
      return jsonError(401, "Voice device session expired.");
    }
  } catch { return jsonError(503, "Unable to verify voice session."); }
  if (!request.body) return jsonError(400, "No audio was received.");
  const reader = request.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const {done,value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 650000) {
        await reader.cancel();
        return jsonError(413, "Recording too large.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (total < 1000) return jsonError(400, "Recording too short.");
  const audio = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { audio.set(chunk, offset); offset += chunk.length; }
  try {
    const upstream = await fetch(target, {
      method: "POST", headers: {
        Authorization: "Bearer " + token,
        "Content-Type": mime
      }, body: audio, redirect: "manual", signal: AbortSignal.timeout(20000)
    });
    if (!upstream.ok) {
      if (upstream.status === 422) return jsonError(422, "No clear speech detected. Try again.");
      if (upstream.status === 415) return jsonError(415, "This audio format is not supported.");
      return jsonError(503, "Speech transcription temporarily unavailable.");
    }
    const payload = await upstream.json();
    if (!payload || typeof payload.transcript !== "string") return jsonError(502, "Invalid transcription result.");
    return Response.json({ok:true, transcript:payload.transcript.slice(0,1800)}, {
      headers:{"Cache-Control":"no-store","X-Gwap-Voice-Path":"speech-fallback-v0.3"}
    });
  } catch { return jsonError(503, "Unable to transcribe recording."); }
}

async function previewSpeechAudio({request,env,incoming}) {
  if (request.method !== "POST") return jsonError(405,"Method not allowed.");
  if (request.headers.get("origin") !== incoming.origin) return jsonError(403,"Same-origin required.");
  const cookie = request.headers.get("cookie") || "";
  if (!cookie.includes("gwap_voice_device=")) return jsonError(401,"Device pairing required.");
  const token = String(env?.GWAP_VOICE_FAST_CHAT_TOKEN || "").trim();
  let url;
  try {
    url = new URL("/api/voice/speak",String(env?.GWAP_VOICE_FAST_CHAT_URL || ""));
    if (url.protocol !== "https:" || token.length < 32) throw Error("config");
  } catch { return jsonError(503,"MP3 playback service unavailable."); }
  const incomingBody = await boundedBody(request, "text");
  if (incomingBody.error) return incomingBody.error;
  const utf8 = new TextDecoder().decode(incomingBody.body);
  if (utf8.length > 1100) return jsonError(413,"Speech too long.");
  let payload;
  try { payload=JSON.parse(utf8); } catch { return jsonError(400,"Invalid speech JSON."); }
  if (typeof payload?.text !== "string" || !payload.text.trim() || payload.text.length > 700) {
    return jsonError(400,"Choose a short reply, up to 700 characters.");
  }
  try {
    const session = await fetch(new URL("/voice/session",VOICE_ORIGIN),{
      method:"GET",headers:{Cookie:cookie},redirect:"manual",
      signal:AbortSignal.timeout(6500)
    });
    if (!session.ok || (await session.json()).paired !== true) {
      return jsonError(401,"Device session expired.");
    }
  } catch { return jsonError(503,"Unable to verify paired device."); }
  try {
    const upstream=await fetch(url,{
      method:"POST",redirect:"manual",
      headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify({text:payload.text}),
      signal:AbortSignal.timeout(25000)
    });
    if (!upstream.ok) {
      return jsonError(503,"Audio generation unavailable. Use Test Speaker instead.");
    }
    const mime=String(upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (mime !== "audio/mpeg" && mime !== "audio/wav") {
      return jsonError(502,"Audio model returned unsupported audio format.");
    }
    const data=await upstream.arrayBuffer();
    if (data.byteLength < 40 || data.byteLength > 8000000) {
      return jsonError(502,"Invalid audio response.");
    }
    const head=new Uint8Array(data.slice(0,12));
    const str=(offset,len)=>String.fromCharCode(...head.slice(offset,offset+len));
    const actualWav=str(0,4)==="RIFF" && str(8,4)==="WAVE";
    const actualMp3=str(0,3)==="ID3" || (head[0]===0xff && (head[1]&0xe0)===0xe0);
    if ((mime==="audio/wav" && !actualWav) || (mime==="audio/mpeg" && !actualMp3)) {
      return jsonError(502,"Audio format mismatch.");
    }
    return new Response(data,{
      headers:{"Content-Type":mime,"Cache-Control":"no-store","Content-Disposition":"inline"}
    });
  } catch { return jsonError(503,"Audio request failed. Try again."); }
}

export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  if (incoming.pathname === "/voice/chat") return fastChat({ request, env, incoming });
  if (incoming.pathname === "/voice/transcribe") return transcribeAudio({ request, env, incoming });
  if (incoming.pathname === "/voice/speak") return previewSpeechAudio({request,env,incoming});
  const upstream = new URL(incoming.pathname + incoming.search, VOICE_ORIGIN);

  // Browser requests to a Pages preview carry its unique Origin header.
  // The live Render backend intentionally does not allow preview domains via CORS.
  // This is a server-to-server proxy: validate the *incoming* browser origin
  // against this exact Pages deployment, then omit Origin when calling Render.
  // No Render CORS allowlist or production configuration changes are required.
  const browserOrigin = request.headers.get("origin");
  if (browserOrigin && browserOrigin !== incoming.origin) {
    return jsonError(403, "Cross-origin voice request rejected.");
  }
  // Mutating requests must originate from this deployment's UI. Do not allow
  // form posts or cross-site forged requests that omit Origin.
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()) && !browserOrigin) {
    return jsonError(403, "A same-origin voice request is required.");
  }
  const headers = new Headers(request.headers);
  headers.delete("origin");
  headers.set("X-Forwarded-Host", incoming.host);
  headers.set("X-Forwarded-Proto", incoming.protocol.replace(":", ""));

  const init = {
    method: request.method,
    headers,
    redirect: "manual"
  };

  if (!["GET", "HEAD"].includes(request.method.toUpperCase())) {
    init.body = request.body;
    if (request.body) init.duplex = "half";
  }

  const upstreamResponse = await fetch(new Request(upstream.toString(), init));
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Gwap-Voice-Proxy", "v0.3-lab");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders
  });
}

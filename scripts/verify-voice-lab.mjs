import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { onRequest } from "../functions/voice/[[path]].js";

const html = readFileSync(new URL("../public/voice-lab/index.html", import.meta.url), "utf8");
function chatRequest(body, headers = {}) {
  return new Request("https://gwapgang.com/voice/chat", {
    method: "POST",
    headers: {
      Origin: "https://gwapgang.com",
      Cookie: "gwap_voice_device=paired-test",
      "Content-Type": "application/json",
      ...headers
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}
const env = {
  GWAP_VOICE_FAST_CHAT_URL: "https://gwap-cloud-agent-staging.example.workers.dev",
  GWAP_VOICE_FAST_CHAT_TOKEN: "test-chat-scoped-token-longer-than-32-characters"
};

test("mobile conversation script parses and exposes its two distinct modes", () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.match(html, /Start Conversation/);
  assert.match(html, /COMMAND MODE/);
  assert.match(html, /\/voice\/chat/);
  assert.match(html, /voice\/session/);
  assert.match(html, /Clear conversation/);
});

test("chat requires paired device, scoped config, and same-origin request", async () => {
  assert.equal((await onRequest({ request: chatRequest({message:"Hi"}, {Cookie:""}), env })).status, 401);
  assert.equal((await onRequest({ request: chatRequest({message:"Hi"}), env: {} })).status, 503);
  assert.equal((await onRequest({ request: chatRequest({message:"Hi"}, {Origin:"https://evil.example"}), env })).status, 403);
});

test("session check runs before model inference and scoped bearer stays on server", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (requestOrUrl, options) => {
    calls += 1;
    const target = new URL(typeof requestOrUrl === "string" ? requestOrUrl : requestOrUrl.toString());
    if (target.pathname === "/voice/session") {
      assert.equal(options.headers.Cookie, "gwap_voice_device=paired-test");
      return Response.json({ paired: true });
    }
    assert.equal(target.pathname, "/api/voice/chat");
    assert.equal(options.headers.Authorization, "Bearer " + env.GWAP_VOICE_FAST_CHAT_TOKEN);
    return Response.json({ spoken_response: "I have three options for your next move." });
  };
  try {
    const res = await onRequest({
      request: chatRequest({ message:"What should I do?", history:[] }), env
    });
    assert.equal(res.status, 200);
    assert.equal(calls, 2);
    assert.equal(res.headers.get("X-Gwap-Voice-Path"), "fast-chat-v0.3");
    const payload = await res.json();
    assert.match(payload.spoken_response, /three options/);
    assert.doesNotMatch(JSON.stringify(payload), /test-chat-scoped-token/);
  } finally { globalThis.fetch = previousFetch; }
});

test("unpaired session refuses chat and never queries AI provider", async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ paired: false }); };
  try {
    const res = await onRequest({ request: chatRequest({message:"Hi"}), env });
    assert.equal(res.status, 401);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = previousFetch; }
});

test("rejects oversized JSON before reaching provider", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ paired: true });
  try {
    const res = await onRequest({ request: chatRequest({ message:"x".repeat(8500) }), env });
    assert.equal(res.status, 413);
  } finally { globalThis.fetch = previousFetch; }
});


test("ten guided iPhone acceptance prompts include latency, speech, interruption, and export evidence", () => {
  const prompts = [...html.matchAll(/^    \["[^"]+", "[^"]+", "[^"]+"\]/gm)];
  assert.equal(prompts.length, 10);
  assert.match(html, /audible_ms/);
  assert.match(html, /mic_ms/);
  assert.match(html, /api_ms/);
  assert.match(html, /interrupted/);
  assert.match(html, /qaGrade/);
  assert.match(html, /gwap-voice-iphone-evidence\.json/);
  assert.match(html, /recognition.*onresult|r\.onresult/);
});

test("ten mock paired conversations cross edge with bounded context, no client-side secrets", async () => {
  const previousFetch = globalThis.fetch;
  let callCount = 0;
  let providerCalls = 0;
  const history = [];
  globalThis.fetch = async (target, options) => {
    callCount++;
    const url = new URL(typeof target === "string" ? target : target.toString());
    if (url.pathname === "/voice/session") return Response.json({ paired: true });
    providerCalls++;
    assert.equal(url.pathname, "/api/voice/chat");
    assert.equal(options.headers.Authorization, "Bearer " + env.GWAP_VOICE_FAST_CHAT_TOKEN);
    const input = JSON.parse(new TextDecoder().decode(options.body));
    assert.ok(input.history.length <= 8);
    return Response.json({ spoken_response: "Response number " + providerCalls + " with natural follow-up." });
  };
  try {
    for (let turn = 1; turn <= 10; turn++) {
      const message = "Scenario " + turn;
      const response = await onRequest({
        request: chatRequest({message, history:[...history]}), env
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.spoken_response, "Response number " + turn + " with natural follow-up.");
      history.push({role:"user",content:message},{role:"assistant",content:body.spoken_response});
      while(history.length > 8) history.shift();
    }
    assert.equal(providerCalls, 10);
    assert.equal(callCount, 20);
  } finally { globalThis.fetch = previousFetch; }
});


test("authenticated edge streams SSE deltas without buffering or exposing bearer token", async () => {
  const prior = globalThis.fetch;
  let modelCalls = 0;
  const encoder = new TextEncoder();
  globalThis.fetch = async (target, options) => {
    const uri = new URL(typeof target === "string" ? target : target.toString());
    if (uri.pathname === "/voice/session") return Response.json({paired:true});
    assert.equal(uri.pathname, "/api/voice/chat");
    assert.equal(options.headers.Accept, "text/event-stream");
    assert.equal(options.headers.Authorization, "Bearer " + env.GWAP_VOICE_FAST_CHAT_TOKEN);
    modelCalls++;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"response":"The first sentence."}\n\n'));
        controller.enqueue(encoder.encode('data: {"response":" Here is the second."}\n\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    });
    return new Response(stream, {headers:{"Content-Type":"text/event-stream"}});
  };
  try {
    const request = chatRequest({message:"Talk to me",history:[]},{Accept:"text/event-stream"});
    const response = await onRequest({request,env});
    assert.equal(response.status,200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    assert.equal(response.headers.get("X-Gwap-Voice-Path"), "stream-chat-v0.3");
    const speech = await response.text();
    assert.match(speech, /The first sentence/);
    assert.match(speech, /\[DONE\]/);
    assert.doesNotMatch(speech, /test-chat-scoped-token/);
    assert.equal(modelCalls,1);
  } finally { globalThis.fetch = prior; }
});

test("mobile lab measures incremental audio-start latency, and supports interruption", () => {
  assert.match(html, /Accept:\s*"text\/event-stream"/);
  assert.match(html, /reader\.read\(\)/);
  assert.match(html, /record\.first_delta_ms/);
  assert.match(html, /record\.audible_ms/);
  assert.match(html, /pendingController\?\.abort\(\)/);
  assert.match(html, /SpeechSynthesisUtterance\(piece\)/);
});

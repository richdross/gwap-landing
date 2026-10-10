import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
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
  assert.match(html, /streamingExperiment \? "text\/event-stream" : "application\/json"/);
  assert.match(html, /reader\.read\(\)/);
  assert.match(html, /record\.first_delta_ms/);
  assert.match(html, /record\.synthesis_started_ms/);
  assert.match(html, /audible_ms:null/);
  assert.match(html, /pendingController\?\.abort\(\)/);
  assert.match(html, /SpeechSynthesisUtterance\(piece\)/);
});


test("preview pairing proxy validates browser origin, removes Origin for Render, and keeps credentials", async () => {
  const browser = "https://preview-id.gwap-landing.pages.dev";
  const originalFetch = globalThis.fetch;
  let intercepted = 0;
  globalThis.fetch = async (upstream) => {
    intercepted++;
    assert.equal(new URL(upstream.url).origin, "https://gwap-backend.onrender.com");
    assert.equal(new URL(upstream.url).pathname, "/voice/pair");
    assert.equal(upstream.headers.get("origin"), null);
    assert.equal(upstream.headers.get("authorization"), "Bearer operator-token-test");
    assert.equal(upstream.headers.get("x-forwarded-host"), "preview-id.gwap-landing.pages.dev");
    assert.equal(upstream.method, "POST");
    return Response.json({ok:false,error:"Valid operator token required for pairing"},{status:401});
  };
  try {
    const request = new Request(browser + "/voice/pair", {
      method:"POST",
      headers:{ Origin: browser, Authorization:"Bearer operator-token-test" }
    });
    const accepted = await onRequest({request, env});
    assert.equal(accepted.status,401);
    assert.match((await accepted.json()).error,/operator token/);
    assert.equal(intercepted,1);

    const malicious = new Request(browser+"/voice/pair",{
      method:"POST",headers:{Origin:"https://attacker.example",Authorization:"Bearer operator-token-test"}
    });
    assert.equal((await onRequest({request:malicious,env})).status,403);
    const missing = new Request(browser+"/voice/pair",{
      method:"POST",headers:{Authorization:"Bearer operator-token-test"}
    });
    assert.equal((await onRequest({request:missing,env})).status,403);
    assert.equal(intercepted,1,"rejected origins must never reach Render");
  } finally {globalThis.fetch=originalFetch;}
});


test("iPhone recording fallback captures microphone data and uses the scoped transcription bridge", async () => {
  const host = "https://gwapgang.com";
  const saved = globalThis.fetch;
  let calls=0;
  globalThis.fetch = async (u, options) => {
    const path = new URL(typeof u === "string" ? u : u.toString()).pathname;
    calls++;
    if (path === "/voice/session") return Response.json({paired:true});
    assert.equal(path, "/api/voice/transcribe");
    assert.equal(options.headers.Authorization, "Bearer " + env.GWAP_VOICE_FAST_CHAT_TOKEN);
    assert.equal(options.headers["Content-Type"], "audio/mp4");
    assert.ok(options.body instanceof Uint8Array);
    assert.equal(options.body.length,1400);
    return Response.json({transcript:"We should find paying customers."});
  };
  try {
    const response=await onRequest({
      request:new Request(host+"/voice/transcribe",{
        method:"POST",headers:{
          Origin:host,Cookie:"gwap_voice_device=paired-test","Content-Type":"audio/mp4"
        },body:new Uint8Array(1400).fill(8)
      }), env
    });
    assert.equal(response.status,200);
    assert.equal((await response.json()).transcript,"We should find paying customers.");
    assert.equal(calls,2);
  } finally {globalThis.fetch=saved;}
});

test("recording fallback rejects cross-site calls and excessive recordings before AI invocation",async () => {
  const host="https://gwapgang.com";
  const original=globalThis.fetch;
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({paired:true});};
  try {
    for(const [origin,audio,sizeCode] of [
      ["https://attacker.example",new Uint8Array(1200),403],
      [host,new Uint8Array(650010),413]
    ]) {
      const result=await onRequest({request:new Request(host+"/voice/transcribe",{
        method:"POST",
        headers:{Origin:origin,Cookie:"gwap_voice_device=paired-test","Content-Type":"audio/mp4"},
        body:audio
      }), env});
      assert.equal(result.status,sizeCode);
    }
    assert.equal(calls,1,"Oversized recording may verify the paired session but must never reach the model");
  }finally {globalThis.fetch=original;}
});

test("mobile UI supports both Web Speech and recording fallback with visible controls",()=>{
  assert.match(html, /getUserMedia/);
  assert.match(html, /new MediaRecorder/);
  assert.match(html, /\/voice\/transcribe/);
  assert.match(html, /stopMediaRecording\(true\)/);
  assert.match(html, /id="endCall"/);
  assert.match(html, /recorder\?\.state === "recording"/);
  assert.ok(html.indexOf('id="listen"')<html.indexOf('id="transcript"'), "Start control must precede large transcript");
});


test("iOS microphone permission prompt cannot cancel an in-flight recording start", () => {
  const fragment = html.match(/function pauseForBackground\([^)]*\)\s*\{[\s\S]*?\n  \}/)?.[0];
  assert.ok(fragment, "background pause handler must be implemented");
  assert.match(fragment, /if \(mediaStarting && !navigating\) return;/, "permission prompt must not call stop while getUserMedia awaits");
  assert.match(html, /window\.addEventListener\("pagehide", \(\) => pauseForBackground\(true\)\)/);
  assert.match(html, /document\.addEventListener\("visibilitychange",/);
  assert.doesNotMatch(html, /if \(document\.hidden\) stop\(\)/);
  assert.match(html, /Conversation ended by End/);
  assert.match(html, /Conversation paused when Safari left the screen/);
});

test("mocked Safari permission visibility transition preserves recording",async()=>{
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const nodes=new Map(),de={},we={};
  function node(id){if(!nodes.has(id))nodes.set(id,{id,value:"",textContent:"",disabled:false,
    classList:{toggle(){}},events:{},addEventListener(k,cb){this.events[k]=cb;},
    append(){},remove(){},blur(){},pause(){},scrollTop:0,scrollHeight:0});return nodes.get(id);}
  let allowMic;
  const permission=new Promise(r=>allowMic=r);
  let starts=0,stops=0;
  class Recorder{
    static isTypeSupported(){return true;}
    constructor(){this.state="inactive";this.mimeType="audio/mp4";this.events={};}
    addEventListener(k,cb){this.events[k]=cb;}
    start(){this.state="recording";starts++;}
    stop(){this.state="inactive";stops++;this.events.stop?.();}
  }
  const document={hidden:false,getElementById:node,addEventListener(k,cb){de[k]=cb;}};
  const window={MediaRecorder:Recorder,SpeechRecognition:undefined,webkitSpeechRecognition:undefined,
    speechSynthesis:{cancel(){},getVoices(){return[];},speak(){}},
    addEventListener(k,cb){we[k]=cb;}};
  const navigator={userAgent:"iPhone Safari",mediaDevices:{getUserMedia:()=>permission}};
  vm.runInNewContext(script,{document,window,navigator,MediaRecorder:Recorder,
    location:{search:""},URLSearchParams,URL,Response,AbortController,Blob,TextDecoder,Uint8Array,
    performance,setInterval,clearInterval,setTimeout,clearTimeout,fetch:async()=>Response.json({paired:true})},
    {timeout:1200});
  await new Promise(r=>setImmediate(r));
  assert.equal(node("listen").disabled,false);
  node("listen").events.click();
  assert.match(node("status").textContent,/Requesting microphone/);
  document.hidden=true;de.visibilitychange();
  assert.doesNotMatch(node("status").textContent,/Conversation ended/);
  allowMic({getTracks:()=>[{stop(){}}]});
  await new Promise(r=>setImmediate(r));
  assert.equal(starts,1);
  assert.match(node("status").textContent,/Listening/);
  we.pagehide();
  assert.equal(stops,1);
  assert.match(node("status").textContent,/paused/);
});

test("scoped MP3 preview route requires pairing, same origin, and bounded text", async () => {
  const host="https://gwapgang.com", old=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async (url,options)=>{
    calls++;
    const path=new URL(typeof url==="string"?url:url.toString()).pathname;
    if(path==="/voice/session") return Response.json({paired:true});
    assert.equal(path,"/api/voice/speak");
    assert.equal(options.headers.Authorization,"Bearer "+env.GWAP_VOICE_FAST_CHAT_TOKEN);
    assert.deepEqual(JSON.parse(options.body),{text:"Gwap says hello."});
    const wav=new Uint8Array(250).fill(0);
    wav.set(new TextEncoder().encode("RIFF"),0);
    wav.set(new TextEncoder().encode("WAVE"),8);
    return new Response(wav,{headers:{"Content-Type":"audio/wav"}});
  };
  try {
    let request=new Request(host+"/voice/speak",{method:"POST",headers:{
      Origin:host,Cookie:"gwap_voice_device=paired-test","Content-Type":"application/json"
    },body:JSON.stringify({text:"Gwap says hello."})});
    const ok=await onRequest({request,env});
    assert.equal(ok.status,200);
    assert.equal(ok.headers.get("Content-Type"),"audio/wav");
    assert.equal(ok.headers.get("Cache-Control"),"no-store");
    assert.equal((await ok.arrayBuffer()).byteLength,250);
    assert.equal(calls,2);
    request=new Request(host+"/voice/speak",{method:"POST",headers:{
      Origin:"https://bad.example",Cookie:"gwap_voice_device=paired-test","Content-Type":"application/json"
    },body:JSON.stringify({text:"Gwap says hello."})});
    assert.equal((await onRequest({request,env})).status,403);
    request=new Request(host+"/voice/speak",{method:"POST",headers:{
      Origin:host,Cookie:"gwap_voice_device=paired-test","Content-Type":"application/json"
    },body:JSON.stringify({text:"x".repeat(701)})});
    assert.equal((await onRequest({request,env})).status,400);
    assert.equal(calls,2,"Rejected speech must never reach AI");
  } finally { globalThis.fetch=old; }
});

test("Safari speaker UI separates synthesis intent from actual user-confirmed audio",()=>{
  assert.match(html,/id="speakerTest"/);
  assert.match(html,/context.createOscillator\(\)/);
  assert.match(html,/oscillator.start\(onset\)/);
  assert.match(html,/Two test tones requested/);
  assert.match(html,/id="speakerReplay"/);
  assert.match(html,/id="speakerMp3"/);
  assert.match(html,/id="speakerPlayer" controls/);
  assert.match(html,/Safari never started speech/);
  assert.match(html,/Waiting for Safari speech to start/);
  assert.match(html,/Safari reports synthesis started/);
  assert.match(html,/speakerPlayer.hidden=false/);
  assert.match(html,/Recorded speech is ready. Press the Play/);
  assert.match(html,/lastReply\.slice\(0,260\)/);
  assert.doesNotMatch(html,/ctx.playing = true; speaking = true; status\("Gwap is speaking/);
});


test("iOS conversation does not auto-start blocked Web Speech and enables native reply audio",async()=>{
  const script=html.split("<script>")[1]?.split("</script>")[0];
  assert.ok(script);
  const els=new Map();
  function node(id){
    if(!els.has(id)){
      els.set(id,{
        id,value:"",textContent:"",disabled:false,hidden:false,handlers:{},classList:{toggle(){}},
        addEventListener(type,callback){this.handlers[type]=callback;},remove(){},append(){},blur(){},
        pause(){},load(){},removeAttribute(){},scrollTop:0,scrollHeight:0
      });
    }
    return els.get(id);
  }
  const document={
    hidden:false,getElementById:node,
    createElement:(tag)=>({tagName:tag,textContent:"",className:"",append(){},remove(){},click(){}}),
    body:{append(){}},addEventListener(){}
  };
  let browserSpeakAttempts=0, modelCalls=0, audioCalls=0;
  const window={
    speechSynthesis:{cancel(){},speak(){browserSpeakAttempts++;},getVoices(){return[];}},
    SpeechSynthesisUtterance:class {}, MediaRecorder:undefined,
    addEventListener(){}
  };
  const navigator={userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 26_0) Mobile Safari"};
  const u=class extends URL {};
  u.createObjectURL=()=>"blob:gwap-test-audio";
  u.revokeObjectURL=()=>{};
  const fetch=async(path)=>{
    if(path==="/voice/session")return Response.json({paired:true});
    if(path==="/voice/chat"){
      modelCalls++;
      return Response.json({spoken_response:"GWAP is responding with the customer acquisition plan."});
    }
    if(path==="/voice/speak"){
      audioCalls++;
      return new Response(new Uint8Array(250).fill(65),{headers:{"Content-Type":"audio/wav"}});
    }
    throw Error("Unexpected mocked route: "+path);
  };
  vm.runInNewContext(script,{
    document,window,navigator,MediaRecorder:undefined,
    location:{search:""},URLSearchParams,URL:u,Response,AbortController,Blob,TextDecoder,
    Uint8Array,performance,setInterval,clearInterval,setTimeout,clearTimeout,fetch
  },{timeout:1500});
  await new Promise(r=>setImmediate(r));
  node("message").value="Are you working?";
  node("composer").handlers.submit({preventDefault(){}});
  await new Promise(r=>setTimeout(r,20));
  assert.equal(modelCalls,1);
  assert.equal(browserSpeakAttempts,0,"iPhone must not try unreliable automatic Safari Web Speech");
  assert.equal(node("speakerMp3").disabled,false,"Generate Audio must enable once response exists");
  assert.equal(node("speakerMp3").textContent,"");
  assert.match(node("status").textContent,/Ready for follow-up/);
  assert.equal(node("listen").disabled,true,"Mock has no microphone API; typed answers still work");
  await node("speakerMp3").handlers.click();
  assert.equal(audioCalls,1);
  assert.equal(node("speakerPlayer").src,"blob:gwap-test-audio");
  assert.equal(node("speakerPlayer").hidden,false);
  assert.equal(node("speakerMp3").disabled,false);
  assert.match(node("speakerNote").textContent,/Press the Play/);
});

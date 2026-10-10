import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../public/voice-lab/index.html",import.meta.url),"utf8");
const script=html.split("<script>")[1]?.split("</script>")[0];
assert.ok(script);

function createPhone({holdPlayback=false,blockAudioContext=false}={}){
  const elements=new Map(),windowEvents={},documentEvents={};
  let now=0, recordingStart=0, apiCalls=[], players=[], audioStartCount=0, browserTts=0, micStopCount=0;
  let intervalFn=null, timeouts=new Set(), activeRecording=null;
  function node(id){
    if(!elements.has(id)){
      elements.set(id,{
        id,disabled:false,value:"",textContent:"",hidden:false,src:"",style:{},
        handlers:{},classList:{toggle(){}},scrollTop:0,scrollHeight:0,
        addEventListener(k,f){this.handlers[k]=f;},removeEventListener(k,f){if(this.handlers[k]===f)delete this.handlers[k];},
        append(){},remove(){},blur(){},click(){this.handlers.click?.();},
        pause(){},load(){},removeAttribute(){},play(){return Promise.resolve();}
      });
    }
    return elements.get(id);
  }
  class Recorder {
    static isTypeSupported(type){return type==="audio/mp4";}
    constructor(){this.state="inactive";this.mimeType="audio/mp4";this.handlers={};}
    addEventListener(k,f){this.handlers[k]=f;}
    start(){this.state="recording";recordingStart=now;activeRecording=this;players.push(this);}
    stop(){
      if(this.state!=="recording")return;
      this.state="inactive";micStopCount++;
      const bytes=new Uint8Array(1800).fill(8);
      this.handlers.dataavailable?.({data:new Blob([bytes],{type:"audio/mp4"})});
      this.handlers.stop?.();
    }
  }
  const resources=[];
  class AC {
    constructor(){this.state=blockAudioContext?"suspended":"running";this.currentTime=0;this.destination={};resources.push(this);}
    resume(){if(blockAudioContext)return Promise.reject(new Error("gesture-required"));this.state="running";return Promise.resolve();}
    close(){this.state="closed";return Promise.resolve();}
    createGain(){return {gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}
    createOscillator(){return {connect(){},start(){},stop(){},frequency:{value:440},type:"sine"};}
    createMediaStreamSource(){return {connect(){}};}
    createAnalyser(){return {fftSize:1024,getByteTimeDomainData(bytes){bytes.fill(now-recordingStart<1500?165:128);}};}
    decodeAudioData(bytes){assert.ok(bytes.byteLength>=44);return Promise.resolve({duration:1});}
    createBufferSource(){
      const source={buffer:null,onended:null,connect(){},start(){
        audioStartCount++;
        if(!holdPlayback)queueMicrotask(()=>source.onended?.());
      },stop(){source.onended?.();}};
      return source;
    }
  }
  class TestUrl extends URL{}
  TestUrl.createObjectURL=()=>"blob:gwap-audio";
  TestUrl.revokeObjectURL=()=>{};
  const window={
    AudioContext:AC,MediaRecorder:Recorder,
    speechSynthesis:{cancel(){},speak(){browserTts++;},getVoices(){return[];}},
    addEventListener(k,f){windowEvents[k]=f;}
  };
  const document={
    hidden:false,getElementById:node,createElement:(tag)=>({
      tagName:tag,textContent:"",className:"",append(){},remove(){},click(){}
    }),body:{append(){}},addEventListener(k,f){documentEvents[k]=f;}
  };
  const navigator={
    userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 26_0) Mobile Safari",
    mediaDevices:{async getUserMedia(){return {getTracks:()=>[{stop(){}}]};}}
  };
  const fetch=async(path,init={})=>{
    apiCalls.push({path,init});
    if(path==="/voice/session")return Response.json({paired:true});
    if(path==="/voice/transcribe")return Response.json({transcript:"How can GWAP find more customers?"});
    if(path==="/voice/chat")return Response.json({spoken_response:"Contact qualified businesses, verify their needs, and offer a clear paid solution."});
    if(path==="/voice/speak") {
      assert.equal(init.credentials,"same-origin");
      assert.ok((JSON.parse(init.body).text).startsWith("Contact qualified"));
      return new Response(new Uint8Array(300).fill(65),{headers:{"Content-Type":"audio/wav"}});
    }
    throw Error("Unexpected request: "+path);
  };
  const timer=(f,ms)=>{
    if(ms===350){queueMicrotask(f);return 1001;}
    const id=setTimeout(f,ms);timeouts.add(id);return id;
  };
  const clearTimer=(id)=>{timeouts.delete(id);clearTimeout(id);};
  const mock={
    window,navigator,document,MediaRecorder:Recorder,
    location:{search:""},URL:TestUrl,URLSearchParams,Response,AbortController,
    Blob,TextDecoder,Uint8Array,performance:{now:()=>now},
    setInterval:(f)=>{intervalFn=f;return 77;},
    clearInterval:()=>{intervalFn=null;},
    setTimeout:timer,clearTimeout:clearTimer,fetch
  };
  vm.runInNewContext(script,mock,{timeout:1600});
  const settle=async()=>{for(let i=0;i<14;i++)await new Promise(r=>setImmediate(r));};
  return {
    node,window,document,settle,apiCalls,players,resources,
    get currentRecorder(){return activeRecording;},
    get playbackCount(){return audioStartCount;},
    get browserSpeechCalls(){return browserTts;},
    get micStops(){return micStopCount;},
    get activeInterval(){return intervalFn;},
    tick:(ms)=>{now=ms;intervalFn?.();},
    async cleanup(){
      node("endCall").handlers.click?.();
      await settle();
      for(const x of timeouts)clearTimeout(x);
    }
  };
}

test("one tap: start -> auto silence-stop -> transcribe -> AI -> generated WAV -> replay -> auto-relisten",async()=>{
  const phone=createPhone();
  try{
    await phone.settle();
    assert.equal(phone.node("listen").disabled,false);
    phone.node("listen").handlers.click();
    await phone.settle();
    assert.equal(phone.players.length,1);
    assert.match(phone.node("status").textContent,/Listening/);
    // VAD hears speech (RMS > threshold) then silence and closes recording.
    for(const t of [650,900,1400,2800])phone.tick(t);
    await phone.settle();
    const paths=phone.apiCalls.map(x=>x.path);
    assert.ok(paths.includes("/voice/transcribe"),"must transcribe captured speech");
    assert.ok(paths.includes("/voice/chat"),"must answer the transcription");
    assert.equal(paths.filter(x=>x==="/voice/speak").length,1,"one bounded TTS request per turn");
    assert.equal(phone.playbackCount,1,"decoded audio must start without a second user gesture");
    assert.equal(phone.browserSpeechCalls,0,"must never use broken iOS speechSynthesis");
    assert.equal(phone.node("speakerPlayer").hidden,false);
    assert.equal(phone.node("speakerPlayer").src,"blob:gwap-audio");
    assert.ok(phone.players.length>=2,"new microphone recording should start after spoken reply");
    assert.match(phone.node("status").textContent,/Listening/);
    // No additional click: a second spoken question should also go end-to-end.
    for(const t of [3450,3700,4200,5600])phone.tick(t);
    await phone.settle();
    assert.equal(phone.apiCalls.filter(x=>x.path==="/voice/chat").length,2,"second question must reach AI");
    assert.equal(phone.apiCalls.filter(x=>x.path==="/voice/speak").length,2,"second reply must generate audio");
    assert.equal(phone.playbackCount,2,"second reply must play automatically");
    assert.ok(phone.players.length>=3,"third listening session should start after second reply");
    assert.equal(phone.node("endCall").disabled,false);
  }finally{await phone.cleanup();}
});

test("interrupt stops generated playback and reopens the microphone; End releases audio and stops recording",async()=>{
  const phone=createPhone({holdPlayback:true});
  try{
    await phone.settle();
    phone.node("listen").handlers.click();
    await phone.settle();
    for(const t of [650,900,1400,2800])phone.tick(t);
    await phone.settle();
    assert.equal(phone.playbackCount,1);
    assert.match(phone.node("status").textContent,/Playing GWAP generated voice/);
    assert.equal(phone.node("listen").disabled,false);
    assert.match(phone.node("listen").textContent,/Interrupt/);
    phone.node("listen").handlers.click();
    await phone.settle();
    assert.ok(phone.players.length>=2,"interruption should start capturing a follow-up");
    phone.node("endCall").handlers.click();
    await phone.settle();
    assert.equal(phone.node("endCall").disabled,true);
    assert.match(phone.node("status").textContent,/Conversation ended/);
    assert.ok(phone.resources.some(x=>x.state==="closed"),"End must close the audio context");
  }finally{await phone.cleanup();}
});

test("when autoplay cannot unlock, native player remains visible for a deliberate Play tap",async()=>{
  const phone=createPhone({blockAudioContext:true});
  try{
    await phone.settle();
    phone.node("listen").handlers.click();
    await phone.settle();
    // Suspended Web Audio also disables silence detection, so use Send Speech fallback.
    phone.node("listen").handlers.click();
    await phone.settle();
    // Fallback HTML audio can autoplay in this mock, which is acceptable.
    assert.equal(phone.node("speakerPlayer").hidden,false);
    assert.equal(phone.node("speakerPlayer").src,"blob:gwap-audio");
    assert.equal(phone.browserSpeechCalls,0);
  }finally{await phone.cleanup();}
});

// Read-only Cloudflare Security Events probe. Intentionally emits no IP addresses, user agents,
// cookies, raw request identifiers, credentials, or complete unfiltered event payloads.
const token = process.env.CLOUDFLARE_API_TOKEN || "";
const root = "https://api.cloudflare.com/client/v4";
const windowStart = "2026-10-09T21:37:00Z";
const windowEnd = "2026-10-09T21:42:00Z";

function message(e) { return String(e?.message || e?.name || "unknown").slice(0,160); }
async function getZone() {
  const res = await fetch(root+"/zones?name=gwapgang.com",{
    headers:{ authorization:"Bearer "+token },signal:AbortSignal.timeout(14000)
  });
  const json = await res.json().catch(()=>({}));
  return {status:res.status, id:json?.result?.[0]?.id || null};
}
async function ask(query) {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql",{
    method:"POST",
    headers:{ authorization:"Bearer "+token, "content-type":"application/json" },
    body:JSON.stringify({query}), signal:AbortSignal.timeout(18000)
  });
  const json=await res.json().catch(()=>({}));
  return {status:res.status,errors:(json.errors||[]).map(e=>message(e)),data:json.data};
}
function q(zone, fields, extraFilter="") {
  return 'query { viewer { zones(filter: {zoneTag: "'+zone+'"}) { firewallEventsAdaptive(filter: {datetime_geq: "'+windowStart+'", datetime_leq: "'+windowEnd+'" '+extraFilter+'} limit: 500, orderBy: [datetime_DESC]) { '+fields+' } } } }';
}
const report={
  mode:"read-only",windowUtc:[windowStart,windowEnd],domain:"gwapgang.com",
  searchedPrefix:"/blog/",method:"Cloudflare GraphQL firewallEventsAdaptive"
};
if(!token) {
  report.status="token_missing";
}else{
  try{
    const zone=await getZone();
    report.zoneLookupStatus=zone.status;
    if(!zone.id){ report.status="zone_unavailable"; }
    else{
      // Narrow filter first; fall back to broad time window when schema lacks path filtering.
      const attempts=[
        {type:"path-filtered", fields:"action datetime source ruleId requestPath rayName", filter:', requestPath_like:"/blog/%"'},
        {type:"unfiltered",fields:"action datetime source ruleId requestPath rayName",filter:""},
        {type:"minimal",fields:"action datetime source ruleId",filter:""}
      ];
      for(const attempt of attempts){
        const x=await ask(q(zone.id,attempt.fields,attempt.filter));
        report.graphqlStatus=x.status;
        report.queryMode=attempt.type;
        if(x.errors.length){report.errors=x.errors.map(e=>e.slice(0,130));continue;}
        const events=x.data?.viewer?.zones?.[0]?.firewallEventsAdaptive;
        if(!Array.isArray(events)){report.status="empty_or_unavailable";continue;}
        report.status="queried";
        report.totalResults=events.length;
        const blog=events.filter(e=>typeof e.requestPath==="string"&&e.requestPath.startsWith("/blog/"));
        report.blogEvents=blog.length;
        // Group only anonymized source/rule/action; never report identities.
        const grouped={};
        for(const e of blog){
          const key=[String(e.action||"unknown").slice(0,30),String(e.source||"unknown").slice(0,40),String(e.ruleId||"not_reported").slice(0,80)].join("|");
          grouped[key]=(grouped[key]||0)+1;
        }
        report.blogRuleSummary=Object.entries(grouped).slice(0,25).map(([key,count])=>{
          const [action,source,ruleId]=key.split("|");return {action,source,ruleId,count};
        });
        report.sampleUtc=blog.slice(0,5).map(e=>String(e.datetime||""));
        if(attempt.type==="minimal"){
          report.note="No requestPath field available; rule attribution specific to /blog/ could not be determined";
        }
        delete report.errors; break;
      }
    }
  }catch(e){report.status="error";report.error=message(e);}
}
console.log("CLOUDFLARE_SECURITY_EVENTS "+JSON.stringify(report));

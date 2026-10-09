import { createSign } from "node:crypto";

const targets = [
  "/blog/the-new-gatekeepers-of-ai-commerce-why-agent-access-is-becoming-the-real-power-layer/",
  "/brief/001-ai-is-getting-cheaper-leverage-is-getting-more-valuable/",
  "/start/",
  "/revenue-leak-score/",
  "/revenue-rescue-sprint/",
  "/revenue-leak-playbook/",
];
const base = "https://gwapgang.com";
const deadline = 16000;
function summarizeFailure(err) {
  return String(err?.name || "network_error").replace(/[^a-zA-Z0-9_ -]/g,"").slice(0,80);
}
async function getWithTimeout(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(deadline) });
}
async function probeLivePages() {
  const results = [];
  for (const path of targets) {
    try {
      const r = await getWithTimeout(base + path, {
        redirect: "follow",
        headers: { "user-agent": "GWAP-QA-ReadOnly/1.0", "cache-control": "no-cache" },
      });
      const html = await r.text();
      const candidate = /text\/html/i.test(r.headers.get("content-type") || "");
      const row = {
        path, status: r.status, html: candidate, bytes: html.length,
        cfRayPresent: Boolean(r.headers.get("cf-ray")),
        tagIdPresent: html.includes("G-MZF7SR86XK"),
        sharedBootstrapPresent: html.includes("window.gwapTrack"),
        navigationHandoffPresent: html.includes("gwap_pending_navigation_event_v1"),
        canonicalPresent: html.includes('<link rel="canonical"'),
      };
      results.push(row);
    } catch (e) {
      results.push({ path, error: summarizeFailure(e) });
    }
  }
  return results;
}

function base64Url(x) { return Buffer.from(x).toString("base64url"); }
async function googleToken(json) {
  const account = JSON.parse(json);
  if (!account.client_email || !account.private_key) throw new Error("invalid_service_account");
  const now = Math.floor(Date.now() / 1000);
  const h = base64Url(JSON.stringify({alg:"RS256",typ:"JWT"}));
  const p = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now+3600,
  }));
  const toSign = h+"."+p;
  const signer = createSign("RSA-SHA256");
  signer.update(toSign);
  signer.end();
  const assertion = toSign+"."+signer.sign(account.private_key).toString("base64url");
  const tokenRes = await getWithTimeout("https://oauth2.googleapis.com/token",{
    method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}).toString(),
  });
  const result = await tokenRes.json().catch(()=>({}));
  if (!tokenRes.ok || !result.access_token) throw new Error("google_oauth_http_"+tokenRes.status);
  return result.access_token;
}
async function gaRequest(token, method, body, prop) {
  const r = await getWithTimeout(
    "https://analyticsdata.googleapis.com/v1beta/properties/"+encodeURIComponent(prop)+":"+method,
    {method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},body:JSON.stringify(body)}
  );
  const data = await r.json().catch(()=>({}));
  if (!r.ok) {
    const code = data?.error?.status || "unknown";
    return { status:"HTTP_"+r.status, errorCode:String(code).slice(0,60) };
  }
  const metricTotals = data.totals?.[0]?.metricValues?.map(x=>Number(x.value)||0)||[];
  const rows = data.rows || [];
  return {
    status:"ok",rowCount:data.rowCount??rows.length,rowsReturned:rows.length,
    totals:metricTotals,
    dailyActivity:body.dimensions?.[0]?.name==="date" ? rows.map(r=>({
      day:r.dimensionValues?.[0]?.value || "",
      events:Number(r.metricValues?.[0]?.value||0)
    })).slice(0,45) : undefined,
    nonzeroRows:rows.filter(x=>x.metricValues?.some(m=>Number(m.value)>0)).length,
    dateSpan:rows.length&&rows[0]?.dimensionValues?.[0]?.value?.match(/^20\d{6}$/)?[rows[0].dimensionValues[0].value,rows.at(-1).dimensionValues[0].value]:null,
  };
}
async function gaAudit() {
  const secret=process.env.GA4_SERVICE_ACCOUNT_JSON, prop=process.env.GA4_PROPERTY_ID;
  if(!secret||!prop)return {status:"missing_service_account_or_property"};
  const token=await googleToken(secret);
  const cases=[
    {name:"rolling_7day_pages",method:"runReport",body:{
      dateRanges:[{startDate:"7daysAgo",endDate:"today"}],
      dimensions:[{name:"pagePath"}],
      metrics:[{name:"screenPageViews"},{name:"activeUsers"}],limit:100
    }},
    {name:"absolute_oct_pages",method:"runReport",body:{
      dateRanges:[{startDate:"2026-10-01",endDate:"2026-10-08"}],
      dimensions:[{name:"pagePath"}],
      metrics:[{name:"screenPageViews"},{name:"activeUsers"}],limit:100
    }},
    {name:"prior_sept_pages",method:"runReport",body:{
      dateRanges:[{startDate:"2026-09-18",endDate:"2026-09-30"}],
      dimensions:[{name:"pagePath"}],
      metrics:[{name:"screenPageViews"}],limit:100
    }},
    {name:"oct_events",method:"runReport",body:{
      dateRanges:[{startDate:"2026-10-01",endDate:"2026-10-08"}],
      dimensions:[{name:"eventName"}],
      metrics:[{name:"eventCount"}],limit:100
    }},
    {name:"full_period_by_date",method:"runReport",body:{
      dateRanges:[{startDate:"2026-09-12",endDate:"2026-10-09"}],
      dimensions:[{name:"date"}],
      metrics:[{name:"eventCount"}],limit:35
    }},
    {name:"today_by_date",method:"runReport",body:{
      dateRanges:[{startDate:"7daysAgo",endDate:"today"}],
      dimensions:[{name:"date"}],
      metrics:[{name:"screenPageViews"},{name:"activeUsers"}],limit:20
    }},
    {name:"realtime_events",method:"runRealtimeReport",body:{
      dimensions:[{name:"eventName"}],
      metrics:[{name:"eventCount"}],limit:40
    }},
  ];
  const report={status:"queried",queries:{}};
  for(const item of cases){
    report.queries[item.name]=await gaRequest(token,item.method,item.body,prop);
  }
  return report;
}

console.log("GWAP_GA4_PRODUCTION_PROBE_BEGIN");
const pages=await probeLivePages();
console.log("PUBLIC_HTML_PROBE "+JSON.stringify(pages));
const triage=[
  {label:"top_chrome_ua",url:base+targets[0],agent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36"},
  {label:"top_pages_dev",url:"https://gwap-landing.pages.dev"+targets[0],agent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36"},
  {label:"other_blog_chrome",url:base+"/blog/how-to-calculate-ai-automation-roi-before-you-buy-another-tool/",agent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36"}
];
const triageReport=[];
for(const item of triage) {
  try {
    const response=await getWithTimeout(item.url,{redirect:"follow",headers:{"user-agent":item.agent}});
    const body=await response.text();
    triageReport.push({label:item.label,status:response.status,cfRayPresent:Boolean(response.headers.get("cf-ray")),hasTag:body.includes("G-MZF7SR86XK"),challengeHint:/cf-chl|just a moment|attention required|access denied/i.test(body.slice(0,11000)),bytes:body.length});
  }catch(err){triageReport.push({label:item.label,error:summarizeFailure(err)});}
}
console.log("CLOUDFLARE_TRIAGE "+JSON.stringify(triageReport));
let ga;
try { ga=await gaAudit(); } catch(e) { ga={status:"error",reason:summarizeFailure(e)}; }
console.log("GA4_REPORT_MATRIX "+JSON.stringify(ga));
console.log("GWAP_GA4_PRODUCTION_PROBE_END");

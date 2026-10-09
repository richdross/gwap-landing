import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

const productionBase = "https://gwapgang.com";
const pagesBase = "https://gwap-landing.pages.dev";
let base = productionBase;
const first = "/blog/the-new-gatekeepers-of-ai-commerce-why-agent-access-is-becoming-the-real-power-layer/";
const backup = "/brief/001-ai-is-getting-cheaper-leverage-is-getting-more-valuable/";
const googleParams = [];
const errors = [];
const findChrome = () => {
  for(const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]){
    try { return execFileSync("which",[name],{encoding:"utf8"}).trim(); }catch{}
  }
  throw new Error("chrome_not_installed");
};
const executablePath=findChrome();
const browser=await chromium.launch({headless:true,executablePath,args:["--no-sandbox"]});
const context=await browser.newContext({locale:"en-US",viewport:{width:1300,height:850}});
await context.addInitScript(() => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(["set", {debug_mode: true}]);
});
const page=await context.newPage();
page.on("request",request=>{
  const u=request.url();
  if(!u.includes("google-analytics.com/g/collect")&&!u.includes("analytics.google.com/g/collect"))return;
  try{
    const url=new URL(u);
    const params=url.searchParams;
    googleParams.push({
      event:params.get("en")||"(unknown)",
      tagMatch:params.get("tid")==="G-MZF7SR86XK",
      debugFlag:params.get("_dbg")||null,
      pagePath:(()=>{
        try{return new URL(params.get("dl")||base).pathname;}catch{return "";}
      })()
    });
  }catch(e){errors.push("url_parse");}
});
page.on("pageerror",e=>{if(errors.length<5)errors.push(String(e.name||"page_error"));});
let articleResponse=await page.goto(base+first,{waitUntil:"domcontentloaded",timeout:25000});
let articlePath=first;
let initialStatus=articleResponse?.status()||0;
if(initialStatus!==200){
  articleResponse=await page.goto(base+backup,{waitUntil:"domcontentloaded",timeout:25000});
  articlePath=backup;
}
if (articleResponse?.status() !== 200) {
  base = pagesBase;
  articleResponse = await page.goto(base+first,{waitUntil:"domcontentloaded",timeout:25000});
  articlePath=first;
  if (articleResponse?.status() !== 200) {
    articleResponse = await page.goto(base+backup,{waitUntil:"domcontentloaded",timeout:25000});
    articlePath=backup;
  }
}
await page.waitForTimeout(4000);
const articleTag=await page.evaluate(()=>Boolean(document.querySelector('script[src*="googletagmanager.com/gtag"]')));
const articleEventQueue=await page.evaluate(()=>Array.from(window.dataLayer||[]).map(x=>Array.from(x)[0]).filter(x=>typeof x==="string"));
const articleOrigin=await page.evaluate(()=>{try{return sessionStorage.getItem("gwap_origin_article")||"";}catch{return "blocked";}});
const articleStatus=articleResponse?.status()||0;
const startResponse = await page.goto(base+"/start/",{waitUntil:"domcontentloaded",timeout:25000});
const startStatus = startResponse?.status()||0;
await page.waitForTimeout(4000);
const startHasTag=await page.evaluate(()=>Boolean(document.querySelector('script[src*="googletagmanager.com/gtag"]')));
const startEventQueue=await page.evaluate(()=>Array.from(window.dataLayer||[]).map(x=>Array.from(x)[0]).filter(x=>typeof x==="string"));
const startOrigin=await page.evaluate(()=>{try{return sessionStorage.getItem("gwap_origin_article")||"";}catch{return "blocked";}});
const selectorCount = await page.locator('a[data-route="growth-diagnostic"]').count();
const startTitle=await page.title();
await page.evaluate(() => window.addEventListener("pagehide", () => {
  const captured=Array.from(window.dataLayer||[]).map(x=>Array.from(x)).filter(x=>x[0]==="event").map(x=>x[1]);
  try{sessionStorage.setItem("__gwap_audit_start_queued",JSON.stringify(captured));}catch{}
}));
if (selectorCount === 0) {
  console.log("GWAP_CONTROLLED_JOURNEY "+JSON.stringify({headlessChrome:true,hostTested:base,firstArticleStatus:initialStatus,finalArticleStatus:articleStatus,articlePath,articleTag,articleOrigin,startStatus,startHasTag,startOrigin,startTitle,reason:"growth_diagnostic_route_absent_or_challenged",capturedRequests:googleParams,formSubmitted:false,paymentAttempted:false}));
  await browser.close();
  process.exit(0);
}
await page.locator('a[data-route="growth-diagnostic"]').first().click({timeout:12000});
await page.waitForURL("**/revenue-leak-score/**",{timeout:25000});
await page.waitForTimeout(4500);
const scoreHasTag=await page.evaluate(()=>Boolean(document.querySelector('script[src*="googletagmanager.com/gtag"]')));
const startEventsQueued=await page.evaluate(()=>{try{return JSON.parse(sessionStorage.getItem("__gwap_audit_start_queued")||"[]");}catch{return [];}});
const scoreEventQueue=await page.evaluate(()=>Array.from(window.dataLayer||[]).map(x=>Array.from(x)[0]).filter(x=>typeof x==="string"));
const scoreOrigin=await page.evaluate(()=>{try{return sessionStorage.getItem("gwap_origin_article")||"";}catch{return "blocked";}});
const events=googleParams.filter(e=>e.tagMatch);
console.log("GWAP_CONTROLLED_JOURNEY "+JSON.stringify({
  headlessChrome:true, hostTested:base, firstArticleStatus:initialStatus, finalArticleStatus:articleStatus,
  articlePath, articleTag, startStatus, startHasTag, scoreHasTag,
  articleEventQueue,startEventQueue,scoreEventQueue,startEventsQueued,
  articleOrigin, startOrigin, scoreOrigin,
  diagnosticNavigationSucceeded:page.url().includes("/revenue-leak-score/"),
  requests: events,
  routeSelectedSent: events.some(e=>e.event==="gwap_route_selected"),
  clickTestOnly:true, formSubmitted:false, paymentAttempted:false,
  javascriptErrors:errors
}));
await browser.close();

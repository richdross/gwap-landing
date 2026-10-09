import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";

test("article to Start Here to diagnostic emits one landing-side GA4 route event",async()=>{
  const binary=execFileSync("which",["google-chrome"],{encoding:"utf8"}).trim();
  const browser=await chromium.launch({executablePath:binary,headless:true,args:["--no-sandbox"]});
  try{
    const context=await browser.newContext();
    await context.route("**/*",route=>{
      const url=route.request().url();
      if(/google-analytics\.com\/g\/collect/.test(url))return route.abort();
      return route.continue();
    });
    const page=await context.newPage();
    const host="http://127.0.0.1:8080";
    const article="/blog/the-new-gatekeepers-of-ai-commerce-why-agent-access-is-becoming-the-real-power-layer/";
    const a=await page.goto(host+article,{waitUntil:"domcontentloaded"});
    assert.equal(a.status(),200);
    const b=await page.goto(host+"/start/",{waitUntil:"domcontentloaded"});
    assert.equal(b.status(),200);
    await page.locator('a[data-route="growth-diagnostic"]').click();
    await page.waitForURL("**/revenue-leak-score/**",{timeout:12000});
    await page.waitForFunction(()=>{
      return Array.from(window.dataLayer||[]).some(x=>x[0]==="event" && x[1]==="gwap_route_selected");
    },{timeout:10000});
    const evidence=await page.evaluate(()=>{
      const events=Array.from(window.dataLayer||[]).filter(x=>x[0]==="event"&&x[1]==="gwap_route_selected");
      return {
        origin:sessionStorage.getItem("gwap_origin_article"),
        pending:sessionStorage.getItem("gwap_pending_navigation_event_v1"),
        events:events.map(e=>({name:e[1],path:e[2].destination_path,origin:e[2].origin_article_path,offer:e[2].offer_key}))
      };
    });
    assert.equal(evidence.events.length,1,"should emit exactly one internal navigation event");
    assert.equal(evidence.events[0].path,"/revenue-leak-score/");
    assert.equal(evidence.events[0].origin,article);
    assert.equal(evidence.events[0].offer,"revenue_leak_score");
    assert.equal(evidence.pending,null,"pending event should be consumed");
    await page.reload({waitUntil:"domcontentloaded"});
    const replay=await page.evaluate(()=>Array.from(window.dataLayer||[]).filter(x=>x[0]==="event"&&x[1]==="gwap_route_selected").length);
    assert.equal(replay,0,"a refreshed destination must not replay the old click");
    console.log("GA4_BROWSER_ROUTE_SMOKE PASS (one event on destination, no replay, no form submit)");
  }finally{await browser.close();}
});

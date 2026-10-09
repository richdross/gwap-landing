import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (p) => readFileSync(p, "utf8");
const bootstrap = read("_includes/analytics.njk");
const pages = ["_includes/post.njk", "start.njk", "revenue-leak-score.njk", "revenue-rescue-sprint.njk", "revenue-leak-playbook.njk"];

test("one shared GA4 bootstrap on every critical page", () => {
  assert.equal((bootstrap.match(/G-MZF7SR86XK/g) || []).length, 2);
  for (const path of pages) assert.ok(read(path).includes('{% include "analytics.njk" %}'), path);
  assert.ok(!read("_includes/post.njk").includes("gtag('config'"), "post template should not duplicate GA4 config");
});
test("only verified backend results emit diagnostic completion", () => {
  const score = read("revenue-leak-score.njk");
  assert.ok(score.includes('window.gwapTrack?.("gwap_diagnostic_started"'));
  assert.ok(score.indexOf('window.gwapTrack?.("gwap_diagnostic_completed"') > score.indexOf("if (!response.ok || !body.ok)"));
  assert.ok(!pages.some(path => /gtag\(["']event["'],\s*["']purchase["']/.test(read(path))));
});
test("route and checkout instrumentation are scoped", () => {
  assert.ok((read("start.njk").match(/data-gwap-track="gwap_route_selected"/g) || []).length >= 3);
  assert.ok(read("revenue-rescue-sprint.njk").includes('data-gwap-track="gwap_checkout_click"'));
  const playbook = read("revenue-leak-playbook.njk");
  assert.ok(playbook.indexOf("if (!token)") < playbook.indexOf('button.dataset.gwapTrack = "gwap_checkout_click"'));
});
test("browser events preserve article origin without sending entered personal information", () => {
  const inline = bootstrap.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline);
  const store = new Map();
  const sessionStorage = {getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value)};
  function boot(path) {
    const handlers = {};
    const window = {location: {pathname: path}, dataLayer: []};
    const document = {addEventListener: (name, handler) => {handlers[name] = handler;}};
    const location = {href: "https://gwapgang.com" + path};
    vm.runInNewContext(inline, {window, document, sessionStorage, location, URL, Date});
    return {window, handlers};
  }
  const origin = boot("/blog/example-article/");
  origin.window.gwapTrack("gwap_diagnostic_started", {offer_key: "revenue_leak_score", email: "private@example.com"});
  const start = boot("/start/");
  const link = {href: "https://gwapgang.com/revenue-leak-score/?email=private@example.com", dataset: {gwapTrack:"gwap_route_selected", gwapOffer:"revenue_leak_score", route:"growth-diagnostic"}};
  start.handlers.click({target:{closest:() => link}});
  const calls = start.window.dataLayer.map(args => Array.from(args));
  assert.equal(calls.filter(args => args[0] === "config").length, 1);
  const event = calls.find(args => args[0] === "event");
  assert.equal(event[1], "gwap_route_selected");
  assert.equal(event[2].origin_article_path, "/blog/example-article/");
  assert.equal(event[2].destination_path, "/revenue-leak-score/");
  assert.ok(!JSON.stringify(event).includes("private@example.com"));
});

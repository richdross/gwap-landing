import test from "node:test";
import assert from "node:assert/strict";
import { signalKey, hourBucket, isEditorialArticlePath } from "./ga4-collector-lib.mjs";

test("signal keys distinguish similar slugs", () => {
  assert.equal(signalKey("/blog/a/"), signalKey("/blog/a/"));
  assert.notEqual(signalKey("/blog/the-new-gatekeepers-of-ai-commerce-one/"), signalKey("/blog/the-new-gatekeepers-of-ai-commerce-two/"));
});
test("same UTC hour produces one stable hour bucket", () => {
  assert.equal(hourBucket("2026-10-09T19:02:00Z"), "2026-10-09-19");
  assert.equal(hourBucket("2026-10-09T19:59:59Z"), "2026-10-09-19");
  assert.equal(hourBucket("2026-10-09T20:00:00Z"), "2026-10-09-20");
});
test("both editorial routes are supported", () => {
  assert.equal(isEditorialArticlePath("/blog/my-article/"), true);
  assert.equal(isEditorialArticlePath("/brief/001-story/"), true);
  for (const p of ["/","/start/","/blog/","/brief/","/revenue-leak-score/","/blog/a/b/"]) {
    assert.equal(isEditorialArticlePath(p), false);
  }
});

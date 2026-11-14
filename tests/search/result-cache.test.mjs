import test from "node:test";
import assert from "node:assert/strict";
import {
  createSearchResultCache,
  SearchCapacityError,
} from "../../src/lib/search/result-cache.ts";
test("a hundred identical users share one query and one hydrated result", async () => {
  const cache = createSearchResultCache();
  let calls = 0;
  const read = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    return { courses: [{ id: "math1151" }] };
  };
  const results = await Promise.all(
    Array.from({ length: 100 }, () => cache.get("run:query:page", read)),
  );
  assert.equal(calls, 1);
  assert(results.every((r) => r === results[0]));
  assert.equal(
    (await cache.get("run:query:page", read)).courses[0].id,
    "math1151",
  );
  assert.equal(calls, 1);
  await cache.get("new-run:query:page", read);
  assert.equal(calls, 2);
});
test("page memory, pending work and failures remain bounded", async () => {
  const cache = createSearchResultCache({
    maxEntries: 2,
    maxBytes: 100,
    maxPending: 1,
  });
  let resolve;
  const pending = cache.get("slow", () => new Promise((r) => (resolve = r)));
  await assert.rejects(
    cache.get("other", async () => "value"),
    SearchCapacityError,
  );
  await Promise.resolve();
  resolve("slow result");
  await pending;
  await cache.get("large", async () => "x".repeat(200));
  assert(cache.stats().bytes <= 100);
  assert.equal(cache.stats().entries, 1);
  await assert.rejects(
    cache.get("failed", async () => {
      throw new Error("offline");
    }),
  );
  assert.equal(cache.stats().pending, 0);
  assert.equal(await cache.get("failed", async () => "retry"), "retry");
  await cache.get("third", async () => "new");
  assert.equal(cache.stats().entries, 2);
});

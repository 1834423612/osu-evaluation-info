import test from "node:test";
import assert from "node:assert/strict";
import { createIndexedCatalogSearch } from "../../src/lib/search/client.ts";
test("the primary index accepts typos unchanged and never falls through on a legitimate empty result", async () => {
  let input,
    live = 0;
  const search = createIndexedCatalogSearch(
    async (url) => {
      input = url;
      return Response.json({
        sourceMode: "index",
        courses: [],
        searchInfo: { engine: "bm25-1" },
      });
    },
    async () => {
      live++;
    },
  );
  await search("/api/catalog?q=chemsitry&campus=all&component=lec");
  assert.equal(
    new URL(input, "https://local").searchParams.get("q"),
    "chemsitry",
  );
  assert.equal(live, 0);
});
test("fallback is labelled, cancellation is respected and a pinned page cannot change data sources", async () => {
  let live = 0;
  const search = createIndexedCatalogSearch(
    async () => Response.json({}, { status: 503 }),
    async () => {
      live++;
      return { courses: [], searchInfo: {} };
    },
  );
  assert.equal(
    (await search("/api/catalog?q=typo")).searchInfo.fallbackReason,
    "unavailable",
  );
  await assert.rejects(search("/api/catalog?q=typo&cursor=s:opaque"));
  assert.equal(live, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    search("/api/catalog?q=typo", { signal: controller.signal }),
  );
  assert.equal(live, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createSmartCatalogSearch } from "../../src/lib/catalog/smart-search.ts";
const empty = {
  courses: [],
  hasMore: false,
  capped: false,
  totalItems: 0,
  terms: [{ code: "1272" }],
};
const facets = async () => [
  {
    slug: "subject",
    items: [
      { value: "philos", label: "Philosophy" },
      { value: "math", label: "Mathematics" },
    ],
  },
];
test("normalizes subject names before querying, keeping every user filter and the original query", async () => {
  let seen;
  const search = createSmartCatalogSearch(async (url) => {
    seen = new URL(url, "https://test");
    return Response.json({ ...empty, courses: [{ id: "PHILOS-2465" }] });
  }, facets);
  const result = await search(
    "/api/catalog?q=philosophy%202465&term=1272&campus=all&component=lec&instruction-mode=dl",
  );
  assert.equal(seen.searchParams.get("q"), "PHILOS 2465");
  assert.equal(seen.searchParams.get("subject"), "PHILOS");
  assert.equal(seen.searchParams.get("component"), "lec");
  assert.equal(seen.searchParams.get("instruction-mode"), "dl");
  assert.equal(seen.searchParams.get("campus"), "all");
  assert.equal(result.searchInfo.query, "philosophy 2465");
});
test("unavailable numbers remain empty and alternatives are actual courses requiring a deliberate choice", async () => {
  let calls = 0;
  const search = createSmartCatalogSearch(
    async () =>
      Response.json(
        ++calls === 1
          ? empty
          : {
              ...empty,
              courses: [
                { subject: "MATH", catalogNumber: "1151", title: "Calculus I" },
                { subject: "MATH", catalogNumber: "4500", title: "Unrelated" },
              ],
            },
      ),
    facets,
  );
  const result = await search("/api/catalog?q=MATH%2011011");
  assert.equal(calls, 2);
  assert.deepEqual(result.courses, []);
  assert.equal(
    result.searchInfo.suggestions.find((item) => item.kind === "course").query,
    "MATH 1151",
  );
  assert(
    !result.searchInfo.suggestions.some((item) => item.query.includes("4500")),
  );
});
test("a conflicting selected subject is never silently removed", async () => {
  let seen;
  const search = createSmartCatalogSearch(async (url) => {
    seen = new URL(url, "https://test");
    return Response.json(empty);
  }, facets);
  const result = await search("/api/catalog?q=PHILOS%202465&subject=MATH");
  assert.equal(seen.searchParams.get("subject"), "MATH");
  assert.equal(result.searchInfo.conflict, true);
});
test("alternative buttons are unique across campuses and bounded to two nearby result pages", async () => {
  let calls = 0;
  const search = createSmartCatalogSearch(async () => {
    calls++;
    if (calls === 1) return Response.json(empty);
    return Response.json({
      ...empty,
      courses: [
        { subject: "MATH", catalogNumber: "1151", title: "Calculus I" },
        { subject: "MATH", catalogNumber: "1151", title: "Calculus I" },
      ],
      hasMore: true,
      nextCursor: "r:1:24",
    });
  }, facets);
  const result = await search("/api/catalog?q=MATH%2011011");
  assert.equal(calls, 3);
  assert.equal(
    result.searchInfo.suggestions.filter((item) => item.kind === "course")
      .length,
    1,
  );
});
test("cancellation exits even if the shared subject request is still pending", async () => {
  const controller = new AbortController();
  let calls = 0;
  const search = createSmartCatalogSearch(
    async () => {
      calls++;
      return Response.json(empty);
    },
    () => new Promise(() => {}),
  );
  const pending = search("/api/catalog?q=philosophy", {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending);
  assert.equal(calls, 0);
});
test("main errors and simulated empties never fan out into suggestion requests", async () => {
  for (const status of [200, 429, 503]) {
    let calls = 0;
    const search = createSmartCatalogSearch(async () => {
      calls++;
      return Response.json({ ...empty, debug: true }, { status });
    }, facets);
    if (status === 200)
      assert.equal(
        (await search("/api/catalog?q=MATH%2011011")).searchInfo,
        undefined,
      );
    else await assert.rejects(search("/api/catalog?q=MATH%2011011"));
    assert.equal(calls, 1);
  }
});

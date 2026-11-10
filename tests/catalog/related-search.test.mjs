import assert from "node:assert/strict";
import test from "node:test";
import {
  suggestRelatedQuery,
  createRelatedCatalogSearch,
} from "../../src/lib/catalog/related-search.ts";

const subjects = ["CSE", "MATH", "CHEM", "CSFRST", "ECE"];
test("corrects abbreviated and mistyped subjects while preserving exact course numbers", () => {
  for (const input of [
    "CS1100",
    "cs 1100",
    "CSED1100",
    "CSED 1100",
    "CES1100",
  ]) {
    assert.deepEqual(suggestRelatedQuery(input, subjects), {
      query: input.trim(),
      matchedQuery: "CSE 1100",
      subject: "CSE",
    });
  }
  assert.equal(suggestRelatedQuery("CS", subjects).matchedQuery, "CSE");
  assert.equal(
    suggestRelatedQuery("MAT 1151.01H", subjects).matchedQuery,
    "MATH 1151.01H",
  );
  assert.equal(suggestRelatedQuery("CS1100", subjects, "CSE").subject, "CSE");
  for (const input of [
    "CSE1100",
    "MATH 1100",
    "1100",
    "computer science",
    "C",
    "CS 11",
    "CS 110000",
    "<script>",
  ]) {
    assert.equal(suggestRelatedQuery(input, subjects), null);
  }
  assert.equal(
    suggestRelatedQuery("CSD", ["CSE", "CST"]),
    null,
    "ambiguous typos are not guessed",
  );
  assert.equal(
    suggestRelatedQuery("CS1100", subjects, "MATH"),
    null,
    "selected subject is respected",
  );
});
const empty = {
  courses: [],
  terms: [{ code: "1268" }],
  capped: false,
  hasMore: false,
};
const facets = async () => [
  { slug: "subject", items: subjects.map((value) => ({ value })) },
];
test("searches once exactly, then at most once with a real subject, preserving all filters", async () => {
  const seen = [];
  const search = createRelatedCatalogSearch(async (input) => {
    seen.push(new URL(input, "https://test"));
    return Response.json(
      seen.length === 1 ? empty : { ...empty, courses: [{ id: "official" }] },
    );
  }, facets);
  const result = await search(
    "/api/catalog?q=CS1100&term=1268&campus=all&academic-career=ugrd",
  );
  assert.equal(seen.length, 2);
  assert.equal(seen[0].searchParams.get("q"), "CS1100");
  assert.equal(seen[1].searchParams.get("q"), "CSE 1100");
  assert.equal(seen[1].searchParams.get("campus"), "all");
  assert.equal(seen[1].searchParams.get("academic-career"), "ugrd");
  assert.equal(result.relatedMatch.query, "CS1100");
});
test("errors, actual matches, partial results, pagination, and mock empties do not trigger correction", async () => {
  for (const body of [
    { ...empty, courses: [{}] },
    { ...empty, capped: true },
    { ...empty, hasMore: true },
    { ...empty, debug: true },
  ]) {
    let calls = 0;
    const search = createRelatedCatalogSearch(
      async () => {
        calls++;
        return Response.json(body);
      },
      async () => {
        throw Error("must not load facets");
      },
    );
    await search("/api/catalog?q=CS1100");
    assert.equal(calls, 1);
  }
  for (const suffix of ["&cursor=2:0", "&page=2"]) {
    let calls = 0;
    await createRelatedCatalogSearch(async () => {
      calls++;
      return Response.json(empty);
    }, facets)(`/api/catalog?q=CS1100${suffix}`);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const search = createRelatedCatalogSearch(async () => {
    calls++;
    return Response.json({}, { status: 503 });
  }, facets);
  await assert.rejects(search("/api/catalog?q=CS1100"), /unavailable/);
  assert.equal(calls, 1);
});
test("failed or empty related searches keep the exact empty result and do not recurse", async () => {
  for (const failure of [false, true]) {
    let calls = 0;
    const search = createRelatedCatalogSearch(async () => {
      calls++;
      return calls === 2 && failure
        ? Response.json({}, { status: 429 })
        : Response.json(empty);
    }, facets);
    const result = await search("/api/catalog?q=CSED1100");
    assert.equal(result.relatedMatch, undefined);
    assert.deepEqual(result.courses, []);
    assert.equal(calls, 2);
  }
});
test("an aborted search cannot issue a subsequent correction", async () => {
  const controller = new AbortController();
  let calls = 0;
  const search = createRelatedCatalogSearch(
    async () => {
      calls++;
      return Response.json(empty);
    },
    async () => {
      controller.abort();
      return facets();
    },
  );
  await assert.rejects(
    search("/api/catalog?q=CS1100", { signal: controller.signal }),
  );
  assert.equal(calls, 1);
});

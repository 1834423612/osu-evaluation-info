import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requirementSearch,
  courseFamilyQueries,
} from "../../src/lib/planning/requirement-search.ts";
test("requirement search selects exact GEN facets without guessing combined constraints", () => {
  assert.equal(
    requirementSearch("Placeholder: Historical and Cultural Studies"),
    "GEN Foundation: Historical and Cultural Studies",
  );
  assert.equal(requirementSearch("Natural Science and Math courses"), null);
  assert.equal(
    requirementSearch("GE Launch Seminar"),
    "GEN Bookend: Launch Seminar",
  );
});
test("course families only use catalog-supplied variants of the exact requested number", () => {
  assert.deepEqual(
    courseFamilyQueries("ECON 2001", [
      { query: "ECON 2001.01" },
      { query: "ECON 2002.01" },
      { query: "ECON 2001.01" },
      { query: "MATH 2001.01" },
    ]),
    ["ECON 2001.01"],
  );
  assert.deepEqual(
    courseFamilyQueries("ECON 2001.01", [{ query: "ECON 2001.03H" }]),
    [],
  );
});

test("base-code recovery keeps every exact decimal family member and excludes other numbers and subjects", async () => {
  const { courseFamilyCandidates } =
    await import("../../src/lib/planning/requirement-search.ts");
  const courses = Array.from({ length: 8 }, (_, i) => ({
    id: String(i),
    subject: "EXAMPLE",
    catalogNumber: `2200.0${i + 1}`,
  }));
  assert.equal(
    courseFamilyCandidates("EXAMPLE", "2200", [
      ...courses,
      { subject: "OTHER", catalogNumber: "2200.01" },
      { subject: "EXAMPLE", catalogNumber: "22001" },
    ]).length,
    8,
  );
  assert.deepEqual(courseFamilyCandidates("EXAMPLE", "2200.01", courses), []);
});

test("base family recovery follows every pinned page beyond twenty-four variants", async () => {
  const { readCourseFamilyCandidates } =
    await import("../../src/lib/planning/requirement-search.ts");
  const pages = [];
  const all = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    subject: "EXAMPLE",
    catalogNumber: `2200.${String(i + 1).padStart(2, "0")}`,
  }));
  const result = await readCourseFamilyCandidates(
    { subject: "EXAMPLE", number: "2200", campus: "COL", term: "1272" },
    async (url) => {
      const params = new URL(url, "https://local").searchParams;
      pages.push(params);
      return {
        sourceMode: "index",
        courses: params.get("cursor") ? all.slice(24) : all.slice(0, 24),
        hasMore: !params.get("cursor"),
        nextCursor: params.get("cursor") ? null : "s:pinned-page",
      };
    },
    new AbortController().signal,
  );
  assert.equal(result.length, 30);
  assert.equal(pages[1].get("cursor"), "s:pinned-page");
  assert.ok(
    pages.every(
      (p) =>
        p.get("q") === "EXAMPLE 2200" &&
        p.get("term") === "1272" &&
        p.get("campus") === "col",
    ),
  );
});

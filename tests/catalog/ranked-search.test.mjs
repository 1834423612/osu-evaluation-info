import assert from "node:assert/strict";
import test from "node:test";
import { searchRankedCatalog } from "../../src/lib/catalog/ranked-search.ts";
const course = (number, title = "Course", description = "") => ({
  id: number,
  subject: "CSE",
  subjectName: "Computer Science",
  catalogNumber: number,
  title,
  description,
  sections: [{ classNumber: number, instructors: [] }],
});
const response = (courses, hasMore = false) => ({
  courses,
  hasMore,
  totalItems: 200,
  totalPages: 10,
  capped: false,
  filters: [],
  terms: [],
  fetchedAt: "now",
  evaluationStatus: "unavailable",
});
const merge = (a) => a;
test("uses AND and keeps direct title matches ahead of description-only hits", async () => {
  const result = await searchRankedCatalog(
    { q: "american experiment", campus: "all", filters: { component: "lec" } },
    async (input) => {
      assert.equal(input.q, "american AND experiment");
      assert.equal(input.campus, "all");
      assert.equal(input.filters.component, "lec");
      return response([
        course("2110", "The American Experiment"),
        course("1181", "Engineering Foundations", "american experiment"),
        course("3446", "Asian American Film"),
      ]);
    },
    merge,
  );
  assert.deepEqual(
    result.courses.map((item) => item.id),
    ["2110"],
  );
  assert.equal(result.totalCourses, 1);
  assert.equal(result.totalItems, 1);
});
test("ranked pagination does not repeat or lose candidates within a window", async () => {
  const all = Array.from({ length: 30 }, (_, index) =>
    course(String(2200 + index)),
  );
  const read = async () => response(all);
  const first = await searchRankedCatalog({ q: "22" }, read, merge);
  const second = await searchRankedCatalog(
    { q: "22", cursor: first.nextCursor },
    read,
    merge,
  );
  assert.equal(first.courses.length, 12);
  assert.equal(second.courses.length, 12);
  assert.equal(
    new Set([...first.courses, ...second.courses].map((item) => item.id)).size,
    24,
  );
  assert.equal(first.nextCursor, "r:1:12");
});
test("broad unmatched searches remain bounded and expose a continuation rather than a false final zero", async () => {
  let calls = 0;
  const result = await searchRankedCatalog(
    { q: "animation" },
    async () => {
      calls++;
      return response([course("3300", "Accounting")], true);
    },
    merge,
  );
  assert.equal(calls, 3);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "r:4:0");
  assert.equal(result.searchInfo.complete, false);
  assert.equal(result.totalCourses, null);
});
test("the upstream page ceiling never produces an unusable continuation cursor", async () => {
  const result = await searchRankedCatalog(
    { q: "22", cursor: "r:49:0" },
    async () => response([course("2221")], true),
    merge,
  );
  assert.equal(result.nextCursor, null);
  assert.equal(result.capped, true);
  assert.equal(result.searchInfo.complete, false);
});

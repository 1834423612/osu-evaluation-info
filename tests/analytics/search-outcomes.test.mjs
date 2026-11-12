import assert from "node:assert/strict";
import test from "node:test";
import { courseSearchOutcome } from "../../src/lib/catalog/search-analytics.ts";
const empty = {
  courses: [],
  hasMore: false,
  capped: false,
  totalCourses: 0,
  terms: [{ code: "1272" }],
  searchInfo: { complete: true, kind: "keyword" },
};
const params = () =>
  new URLSearchParams(
    "q=american+experiment&campus=all&component=lec&instruction-mode=dl",
  );
test("distinguishes confirmed empties, incomplete windows, conflicts and request errors", () => {
  assert.equal(courseSearchOutcome(params(), empty, 20).status, "no_matches");
  assert.equal(
    courseSearchOutcome(params(), { ...empty, hasMore: true }, 20).status,
    "continuation",
  );
  assert.equal(
    courseSearchOutcome(params(), { ...empty, capped: true }, 20).status,
    "continuation",
  );
  assert.equal(
    courseSearchOutcome(
      params(),
      { ...empty, searchInfo: { complete: false } },
      20,
    ).status,
    "continuation",
  );
  assert.equal(
    courseSearchOutcome(
      params(),
      { ...empty, searchInfo: { ...empty.searchInfo, conflict: true } },
      20,
    ).status,
    "filter_conflict",
  );
  assert.equal(courseSearchOutcome(params(), null, 20).status, "error");
});
test("records page-sized counts separately from totals and contains no visitor or exception details", () => {
  const event = courseSearchOutcome(
    params(),
    { ...empty, courses: [{}], totalCourses: null, hasMore: true },
    25.4,
  );
  assert.equal(event.status, "matches");
  assert.equal(event.result_count, 1);
  assert.equal(event.total_courses, -1);
  assert.equal(event.filter_count, 3);
  assert.equal(event.term, "1272");
  assert.equal(event.duration_ms, 25);
  assert.equal(event.search_term, "american experiment");
  assert(!("error" in event));
  assert(!("visitor" in event));
});
test("omits browsing, pagination and simulated responses", () => {
  assert.equal(courseSearchOutcome(new URLSearchParams(), empty, 0), null);
  assert.equal(
    courseSearchOutcome(new URLSearchParams("q=math&cursor=r:1:12"), empty, 0),
    null,
  );
  assert.equal(
    courseSearchOutcome(params(), { ...empty, debug: true }, 0),
    null,
  );
});

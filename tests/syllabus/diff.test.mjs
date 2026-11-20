import test from "node:test";
import assert from "node:assert/strict";
import { syllabusDiff, syllabusLines } from "../../src/lib/syllabus/diff.ts";
test("syllabus diff retains exact old and new text and line numbers", () => {
  const before = ["Course", "Midterm 20%", "Final 40%"],
    after = ["Course", "Midterm 30%", "Project 10%", "Final 40%"];
  const result = syllabusDiff(before, after);
  assert.deepEqual(
    result.filter((r) => r.kind !== "added").map((r) => r.text),
    before,
  );
  assert.deepEqual(
    result.filter((r) => r.kind !== "removed").map((r) => r.text),
    after,
  );
  assert.deepEqual(
    result.filter((r) => r.kind === "removed").map((r) => r.before),
    [2],
  );
  assert.deepEqual(
    result.filter((r) => r.kind === "added").map((r) => r.after),
    [2, 3],
  );
});
test("large replacements stay exact without an unbounded quadratic matrix", () => {
  const before = Array.from({ length: 1600 }, (_, i) => `old ${i}`),
    after = Array.from({ length: 1600 }, (_, i) => `new ${i}`);
  const result = syllabusDiff(before, after);
  assert.deepEqual(
    result.filter((r) => r.kind !== "added").map((r) => r.text),
    before,
  );
  assert.deepEqual(
    result.filter((r) => r.kind !== "removed").map((r) => r.text),
    after,
  );
});
test("HTML formatting changes do not become content changes or active markup", () => {
  const make = (html) => ({ components: [{ order: 0, html }] });
  const before = syllabusLines(make("<p>Read chapter 2</p>")),
    after = syllabusLines(
      make("<p><strong>Read</strong> chapter 2</p><script>alert(1)</script>"),
    );
  assert.deepEqual(
    syllabusDiff(before, after).map((r) => r.kind),
    ["same"],
  );
  assert.ok(after.every((line) => !line.includes("alert")));
});

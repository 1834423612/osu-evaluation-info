import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshot } from "../user-data/fixtures.mjs";
import { emptyPlan } from "../../src/lib/planning/model.ts";
import {
  favoritePlanCourses,
  importFavoriteCourses,
} from "../../src/lib/planning/favorites.ts";
import { boardCourses } from "../../src/lib/planning/workspace.ts";
test("mixed favorites import one course per identity and leave existing semester placement intact", () => {
  const choices = favoritePlanCourses(snapshot.items);
  assert.equal(choices.length, 1);
  assert.equal(choices[0].subject, "MATH");
  let n = 0;
  const imported = importFavoriteCourses(
    emptyPlan(),
    snapshot.items,
    "Spring2027",
    () => "course-" + ++n,
  );
  assert.equal(imported.added, 1);
  const row = boardCourses(imported.plan)[0];
  assert.equal(row.term, "Spring2027");
  assert.equal(row.course.title, "Calculus I");
  assert.equal(row.course.credits, 5);
  const repeated = importFavoriteCourses(
    imported.plan,
    snapshot.items,
    "Autumn2027",
    () => "course-" + ++n,
  );
  assert.equal(repeated.added, 0);
  assert.equal(repeated.skipped, 1);
  assert.equal(boardCourses(repeated.plan)[0].term, "Spring2027");
});
test("a retake import leaves historical course titles and credits unchanged", () => {
  const prior = importFavoriteCourses(
    emptyPlan(),
    snapshot.items,
    "Autumn2026",
    () => "old",
  ).plan;
  const recorded = prior.semesters[0].courses[0];
  recorded.status = "failed";
  recorded.title = "Recorded course title";
  recorded.credits = 0;
  const original = structuredClone(recorded);
  let n = 0;
  const next = importFavoriteCourses(
    prior,
    snapshot.items,
    "Spring2027",
    () => "new-" + ++n,
  ).plan;
  assert.deepEqual(next.semesters[0].courses[0], original);
  assert.equal(
    boardCourses(next).find((r) => r.term === "Spring2027").course.credits,
    5,
  );
});

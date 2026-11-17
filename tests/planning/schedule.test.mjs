import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanLines } from "../../src/lib/planning/parser.ts";
import { planSchema } from "../../src/lib/planning/model.ts";
import {
  mergeSnapshots,
  removeSnapshot,
} from "../../src/lib/planning/snapshots.ts";
import {
  placeCourse,
  scheduledTerm,
  semesterCredits,
  termOrder,
} from "../../src/lib/planning/schedule.ts";
const fixture = () =>
  parsePlanLines(
    ["Autumn 2028", "CSE 2999 3h Planned", "Placeholder -"].map((text) => ({
      text,
      page: 1,
    })),
    "student-plan",
  ).plan;
test("moving a plan card preserves imported evidence and remaps on backup merges", () => {
  const source = fixture(),
    id = source.semesters[0].courses[0].id;
  const result = placeCourse(source, id, "Spring2029");
  assert.equal(result.semesters[0].term, "Autumn2028");
  assert.equal(scheduledTerm(result, id, "Autumn2028"), "Spring2029");
  assert.equal(source.schedule.placements.length, 0);
  const merged = mergeSnapshots(result, result);
  assert.equal(merged.schedule.placements.length, 2);
  assert.notEqual(
    merged.schedule.placements[0].courseId,
    merged.schedule.placements[1].courseId,
  );
  assert.equal(
    removeSnapshot(merged, result.documents[0].id).schedule.placements.length,
    1,
  );
  assert.equal(
    planSchema.safeParse({
      ...result,
      schedule: {
        ...result.schedule,
        placements: [{ courseId: "missing", term: null }],
      },
    }).success,
    false,
  );
});
test("completed, transfer and alternative records cannot be moved into future attendance", () => {
  for (const kind of ["completed", "option", "transfer"]) {
    const source = fixture(),
      course = source.semesters[0].courses[0];
    if (kind === "completed") course.status = "completed";
    if (kind === "option") course.evidenceRole = "option";
    if (kind === "transfer") {
      source.semesters[0].creditOrigin = "transfer";
      source.semesters[0].term = null;
    }
    assert.throws(() => placeCourse(source, course.id, "Spring2029"));
  }
});
test("semester credit lower bounds exclude duplicate codes and retain unknown placeholders", () => {
  const courses = fixture().semesters[0].courses;
  assert.deepEqual(semesterCredits([...courses, courses[0]]), {
    known: 3,
    unknown: 1,
    distinctCourses: 1,
    placeholders: 1,
  });
  assert.equal(
    semesterCredits([...courses, { ...courses[0], credits: 4 }]).unknown,
    2,
  );
  assert.deepEqual(["Autumn2028", "Spring2028", "Summer2028"].sort(termOrder), [
    "Spring2028",
    "Summer2028",
    "Autumn2028",
  ]);
});

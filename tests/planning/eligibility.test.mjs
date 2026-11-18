import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan } from "../../src/lib/planning/model.ts";
import { addPlanningCourse } from "../../src/lib/planning/workspace.ts";
import { courseEligibility } from "../../src/lib/planning/eligibility.ts";
test("a prerequisite planned in the target semester cannot unlock the higher course", () => {
  let i = 0;
  const plan = addPlanningCourse(
    emptyPlan(),
    { subject: "MATH", number: "1151" },
    "Spring2027",
    () => "synthetic-" + ++i,
  );
  const subjects = [{ code: "MATH", title: "Mathematics" }];
  assert.equal(
    courseEligibility(
      plan,
      "Spring2027",
      "Prereq: Math 1151.",
      "MATH",
      subjects,
    ),
    "blocked",
  );
  plan.semesters[0].courses[0].status = "completed";
  plan.semesters[0].term = "Autumn2026";
  assert.equal(
    courseEligibility(
      plan,
      "Spring2027",
      "Prereq: Math 1151.",
      "MATH",
      subjects,
    ),
    "eligible",
  );
  assert.equal(
    courseEligibility(
      plan,
      "Spring2027",
      "Prereq: Math 1151 and sophomore standing.",
      "MATH",
      subjects,
    ),
    "unknown",
  );
});
test("explicit higher-course ranges and OR placement preserve valid evidence without unlocking an exact successor", () => {
  let sequence = 0;
  const plan = addPlanningCourse(
      emptyPlan(),
      { subject: "MATH", number: "1131" },
      "Autumn2026",
      () => `range-${++sequence}`,
    ),
    subjects = [
      { code: "MATH", title: "Math" },
      { code: "CSE", title: "Computer Science and Engineering" },
    ];
  plan.semesters[0].courses[0].status = "in-progress";
  assert.equal(
    courseEligibility(
      plan,
      "Spring2027",
      "Prereq: Math 1130 or above, or Math Placement Level L.",
      "CSE",
      subjects,
    ),
    "conditional",
  );
  assert.equal(
    courseEligibility(
      plan,
      "Spring2027",
      "Prereq: Math 1151.",
      "MATH",
      subjects,
    ),
    "blocked",
  );
  plan.semesters[0].courses[0].status = "completed";
  assert.equal(
    courseEligibility(
      plan,
      "Spring2027",
      "Prereq: Math 1130 or above, or Math Placement Level L.",
      "CSE",
      subjects,
    ),
    "eligible",
  );
  assert.equal(
    courseEligibility(
      plan,
      "Spring2027",
      "Not open to students with credit for Math 1131.",
      "MATH",
      subjects,
    ),
    "blocked",
  );
});

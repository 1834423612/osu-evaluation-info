import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePlanLines,
  detectPlanLayout,
} from "../../src/lib/planning/parser.ts";
import { requirementProgress } from "../../src/lib/planning/snapshots.ts";
const lines = (...values) => values.map((text) => ({ text, page: 1 }));

test("audit alternatives cannot masquerade as completed personal courses", () => {
  const { plan } = parsePlanLines(
    lines(
      "Program: SYNTHETIC-BA",
      "Requirement 1: Choose 1 course",
      "CSE 2998 or MATH 2999",
      "CSE 2998 Synthetic course 3 HOURS CURRENTLY TAKING IN AUTUMN '28",
    ),
    "expanded-audit",
  );
  const [course, option] = plan.semesters[0].courses;
  assert.equal(course.evidenceRole, "observation");
  assert.equal(course.credits, 3);
  assert.equal(course.status, "in-progress");
  assert.equal(option.evidenceRole, "option");
  plan.requirements[0].hierarchyReviewed = true;
  plan.allocations.forEach((a) => {
    a.confirmed = true;
  });
  assert.equal(
    requirementProgress(plan, plan.requirements[0].id).state,
    "planned",
  );
  course.status = "completed";
  assert.equal(
    requirementProgress(plan, plan.requirements[0].id).state,
    "satisfied",
  );
});

test("standard audit preserves explicit hierarchy and academic titles", () => {
  const { plan } = parsePlanLines(
    lines(
      "Synthetic program - CPTRTEST-BA (not declared)",
      "Applied Version: AU2022",
      "Major Core (Courses: (2 remaining))",
      "–– CSE 2998 Synthetic course (4 hours) remaining",
      "–––– CSE 2999 (through CSE 2999 Synthetic course (3 hours))",
    ),
    "standard-audit",
  );
  assert.equal(plan.programs[0].code, "CPTRTEST-BA");
  assert.equal(plan.programs[0].appliedVersion, "AU2022");
  assert.equal(plan.requirements.length, 3);
  assert.equal(plan.requirements[2].parentId, plan.requirements[1].id);
  assert.equal(plan.semesters[0].courses[0].credits, 4);
  assert.equal(plan.semesters[0].courses[0].evidenceRole, "option");
  assert.ok(plan.requirements.every((r) => r.hierarchyReviewed === true));
  assert.doesNotMatch(JSON.stringify(plan), /remaining\)\)/);
});

test("layout hints never persist filenames and unknown layouts require a choice", () => {
  assert.equal(
    detectPlanLayout([], "private_Planned-standard-all.pdf"),
    "standard-audit",
  );
  assert.equal(
    detectPlanLayout(lines("Course or Activity Hours Status")),
    "student-plan",
  );
  assert.equal(detectPlanLayout(lines("unrecognized")), null);
});

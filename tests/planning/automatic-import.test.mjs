import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlanLines } from "../../src/lib/planning/parser.ts";
import { mergeSnapshots } from "../../src/lib/planning/snapshots.ts";
import { boardCourses } from "../../src/lib/planning/workspace.ts";
import { recommendCourses } from "../../src/lib/planning/recommendation.ts";
import { serializePlan } from "../../src/lib/planning/model.ts";
import { academicRoster, compareAcademicRoster } from "./private-har.mjs";
const lines = (...values) => values.map((text) => ({ text, page: 1 }));
test("local import resolves plan registrations and earned credit without a review gate", () => {
  const student = parsePlanLines(
    lines(
      "Autumn 2028 - 3 hours attempted",
      "CSE 2998 Synthetic course (0010) 3 Planned",
      "Spring 2029 - 3 hours attempted",
      "GE Launch Seminar - Placeholder",
      "Transfer Credits",
      "ENGLISH 2999 Synthetic course 3 KA",
      "Exam Credits",
      "ART 2999 Synthetic course 3 EM",
    ),
    "student-plan",
  ).plan;
  const audit = parsePlanLines(
    lines(
      "Program: SYNTHETIC-BA",
      "Requirement 1: Choose 1 course",
      "CSE 2998 Synthetic course 3 HOURS CURRENTLY TAKING IN AUTUMN '28",
      "ENGLISH 2999 Synthetic course 3 HOURS TRANSFERRED AUTUMN '28 KA",
      "ART 2999 Synthetic course 3 HOURS TAKEN IN AUTUMN '28 EM",
    ),
    "expanded-audit",
  ).plan;
  const merged = mergeSnapshots(student, audit),
    rows = boardCourses(merged);
  assert.equal(rows.length, 4);
  assert.equal(
    rows.find((r) => r.course.subject === "CSE").course.status,
    "in-progress",
  );
  assert.equal(rows.filter((r) => r.course.status === "completed").length, 2);
  assert.equal(
    rows.find((r) => r.course.kind === "placeholder").course.title,
    "GE Launch Seminar",
  );
  assert.equal(
    rows.find((r) => r.course.kind === "placeholder").course.status,
    "planned",
  );
  assert.doesNotThrow(() => serializePlan(merged));
  const result = recommendCourses(merged, {
    programId: merged.programs[0].id,
    currentTerm: "Autumn2028",
    targetTerm: "Spring2029",
    sampleYear: 1,
    maxCredits: 15,
    maxQuantitative: 2,
    quantitativeSubjects: [],
  });
  assert.equal(result.candidates.length, 0);
  const roster = academicRoster([
    {
      course_plan_info: {
        a: [
          {
            code: "CSE 2998",
            status: "planned",
            progress_status: "in_progress",
            is_registered: true,
            year: 2028,
            semester: 3,
            units: 3,
          },
        ],
        b: [{ code: "ART 2999", progress_status: "taken", units: 3 }],
      },
    },
  ]);
  assert.equal(compareAcademicRoster(rows, roster).matchingStatus, 2);
});
test("wrapped standard audit rows distinguish requirement alternatives from credited courses", () => {
  const plan = parsePlanLines(
    lines(
      "Synthetic Degree -",
      "SYNTHETIC-BA",
      "Major Core (Courses: (1 remaining, 1 taken))",
      "–– Writing (through ENGLISH 2999 Synthetic Composition Autumn '28 KA",
      "(3 hours))",
      "–– CSE 2998 Synthetic systems (4",
      "hours) remaining",
    ),
    "standard-audit",
  ).plan;
  assert.equal(plan.programs[0].code, "SYNTHETIC-BA");
  assert.equal(plan.requirements[1].title, "Writing");
  assert.equal(
    plan.semesters[0].courses.find((c) => c.subject === "ENGLISH").status,
    "completed",
  );
  assert.equal(
    plan.semesters[0].courses.find((c) => c.subject === "CSE").credits,
    4,
  );
  assert.equal(plan.requirements[2].reportedStatus, "remaining");
});
test("academic labels cannot retain identity headers or URL credentials", () => {
  const plan = parsePlanLines(
    lines(
      "Student Name: Private Person",
      "student@example.test",
      "Autumn 2028",
      "CSE 2998 Synthetic course 3 Planned",
      "https://example.test/?token=private-token",
    ),
    "student-plan",
  ).plan;
  assert.doesNotMatch(
    serializePlan(plan),
    /Private Person|example.test|private-token/,
  );
});

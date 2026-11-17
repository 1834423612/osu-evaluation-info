import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan } from "../../src/lib/planning/model.ts";
import {
  addPlanningCourse,
  boardCourses,
  nextSemester,
  currentSemester,
} from "../../src/lib/planning/workspace.ts";
import { placeCourse } from "../../src/lib/planning/schedule.ts";

test("same-page add reuses course identities and preserves original semester evidence", () => {
  let count = 0;
  const id = () => "manual-" + ++count;
  const code = { subject: "CSE", number: "2221" };
  const first = addPlanningCourse(emptyPlan(), code, "Spring2027", id);
  const next = addPlanningCourse(first, code, "Autumn2027", id);
  assert.equal(boardCourses(next).length, 1);
  assert.equal(boardCourses(next)[0].term, "Autumn2027");
  assert.deepEqual(next.semesters, first.semesters);
  next.semesters[0].courses[0].status = "in-progress";
  assert.throws(() => addPlanningCourse(next, code, "Spring2028", id));
  assert.throws(() =>
    placeCourse(next, next.semesters[0].courses[0].id, "Spring2028"),
  );
});

test("semester defaults follow the current season across year boundaries", () => {
  assert.equal(currentSemester(new Date(2026, 1, 1)), "Spring2026");
  assert.equal(nextSemester(new Date(2026, 1, 1)), "Summer2026");
  assert.equal(currentSemester(new Date(2026, 5, 1)), "Summer2026");
  assert.equal(nextSemester(new Date(2026, 10, 1)), "Spring2027");
});

test("Student Plan placement cannot hide protected audit observations", () => {
  let count = 0;
  const id = () => "row-" + ++count;
  const code = { subject: "CSE", number: "2221" };
  const plan = addPlanningCourse(emptyPlan(), code, "Spring2027", id);
  plan.documents.push({
    id: "audit",
    source: "expanded-audit",
    auditMode: "official",
    pdfOrigin: "export",
    catalogTerm: null,
  });
  plan.semesters.push({
    documentId: "audit",
    term: null,
    reportedCredits: null,
    courses: [
      {
        ...plan.semesters[0].courses[0],
        id: "audit-row",
        documentId: "audit",
        status: "in-progress",
      },
    ],
  });
  assert.equal(boardCourses(plan).length, 1);
  assert.equal(boardCourses(plan)[0].protectedRecord, true);
  assert.throws(() =>
    placeCourse(plan, plan.semesters[0].courses[0].id, "Autumn2027"),
  );
  assert.throws(() => addPlanningCourse(plan, code, "Autumn2027", id));
});

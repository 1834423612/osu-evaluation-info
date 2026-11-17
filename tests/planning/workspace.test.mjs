import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan } from "../../src/lib/planning/model.ts";
import {
  addPlanningCourse,
  boardCourses,
  nextSemester,
  currentSemester,
  removeEmptySemester,
  semesterCampus,
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


test("empty summer removal preserves occupied terms and per-term campus through moves", () => {
  let count = 0;
  const id = () => "summer-" + ++count;
  let plan = addPlanningCourse(emptyPlan(), { subject: "CSE", number: "2221" }, "Spring2027", id);
  plan.schedule.terms.push("Summer2027");
  plan.schedule.campuses = { Spring2027: "MNS", Summer2027: "COL" };
  plan = removeEmptySemester(plan, "Summer2027");
  assert.ok(!plan.schedule.terms.includes("Summer2027"));
  assert.equal(plan.schedule.campuses.Summer2027, undefined);
  assert.equal(semesterCampus(plan, "Spring2027"), "MNS");
  const moved = placeCourse(plan, plan.semesters[0].courses[0].id, "Summer2027");
  assert.equal(semesterCampus(moved, "Spring2027"), "MNS");
  assert.equal(removeEmptySemester(moved, "Summer2027"), moved);
});

test("withdrawn attempt remains historical when planning a retake", () => {
  let count = 0;
  const id = () => "attempt-" + ++count;
  const code = { subject: "MATH", number: "1131" };
  const plan = addPlanningCourse(emptyPlan(), code, "Autumn2026", id);
  plan.semesters[0].courses[0].status = "withdrawn";
  assert.throws(() => placeCourse(plan, plan.semesters[0].courses[0].id, "Spring2027"));
  const retake = addPlanningCourse(plan, code, "Spring2027", id);
  const rows = boardCourses(retake);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].course.status, "withdrawn");
  assert.equal(rows[0].term, "Autumn2026");
  assert.equal(rows[1].course.status, "planned");
  assert.equal(rows[1].course.repeated, true);
});

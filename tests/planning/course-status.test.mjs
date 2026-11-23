import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan, planSchema } from "../../src/lib/planning/model.ts";
import { addPlanningCourse } from "../../src/lib/planning/workspace.ts";
import { setCourseUserStatus } from "../../src/lib/planning/course-status.ts";
import { planShareSnapshot } from "../../src/lib/planning/share-snapshot.ts";
import { replaceImportedReports } from "../../src/lib/planning/reimport.ts";
test("personal enrollment labels preserve source statuses, alternative groups and private sync fields", () => {
  let n = 0;
  let p = addPlanningCourse(
    emptyPlan(),
    { subject: "PSYCH", number: "1100" },
    "Spring2027",
    () => "item-" + ++n,
  );
  p = addPlanningCourse(
    p,
    { subject: "MATH", number: "1151" },
    "Spring2027",
    () => "item-" + ++n,
  );
  const [first, second] = p.semesters[0].courses;
  p.schedule.groups = [
    {
      id: "options",
      kind: "alternatives",
      term: "Spring2027",
      courseIds: [first.id, second.id],
      selectedCourseId: first.id,
    },
  ];
  const original = structuredClone(p);
  for (const status of ["registered", "dropped-no-w", "withdrawn-w"]) {
    p = setCourseUserStatus(p, first.id, status);
    assert.equal(p.semesters[0].courses[0].status, "planned");
    assert.equal(p.semesters[0].courses[0].userStatus, status);
    assert.deepEqual(p.schedule.groups, original.schedule.groups);
    assert.equal(
      planSchema.parse(p).semesters[0].courses[0].userStatus,
      status,
    );
    assert.doesNotMatch(
      JSON.stringify(planShareSnapshot(p, "Public", ["Spring2027"])),
      /userStatus|withdrawn-w/,
    );
  }
  p = setCourseUserStatus(p, first.id, undefined);
  assert.equal(p.semesters[0].courses[0].userStatus, undefined);
  assert.equal(p.semesters[0].courses[0].status, "planned");
  assert.throws(
    () => setCourseUserStatus(p, "removed", "registered"),
    /course_removed/,
  );
});
test("fresh academic reports retain personal annotations on matching course identities", () => {
  let n = 0;
  const id = () => "row-" + ++n;
  let original = addPlanningCourse(
    emptyPlan(),
    { subject: "PSYCH", number: "1100" },
    "Spring2027",
    id,
  );
  original.documents[0].source = "student-plan";
  original = setCourseUserStatus(
    original,
    original.semesters[0].courses[0].id,
    "registered",
  );
  const incoming = addPlanningCourse(
    emptyPlan(),
    { subject: "PSYCH", number: "1100" },
    "Spring2027",
    id,
  );
  incoming.documents[0].source = "student-plan";
  const updated = replaceImportedReports(original, incoming);
  assert.equal(
    updated.semesters
      .flatMap((s) => s.courses)
      .find((c) => c.subject === "PSYCH").userStatus,
    "registered",
  );
  assert.equal(
    updated.semesters
      .flatMap((s) => s.courses)
      .find((c) => c.subject === "PSYCH").status,
    "planned",
  );
});

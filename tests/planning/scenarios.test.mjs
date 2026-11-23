import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyPlan, planSchema } from "../../src/lib/planning/model.ts";
import {
  addPlanningCourse,
  boardCourses,
} from "../../src/lib/planning/workspace.ts";
import {
  createScenario,
  scenarioPlan,
  editScenario,
} from "../../src/lib/planning/scenarios.ts";
import { reconcilePlans } from "../../src/lib/planning/reconcile.ts";
import {
  planShareSnapshot,
  copyPlanShare,
  planShareSchema,
} from "../../src/lib/planning/share-snapshot.ts";

const ids = () => {
  let n = 0;
  return () => `course-${++n}`;
};
test("independent scenarios preserve personal courses and other scenarios through save and reconcile", () => {
  const personal = addPlanningCourse(
    emptyPlan(),
    { subject: "PSYCH", number: "1100" },
    "Spring2027",
    ids(),
  );
  const initial = createScenario(personal, "For a friend", "friend");
  assert.equal(boardCourses(scenarioPlan(initial, "friend")).length, 0);
  const edited = editScenario(initial, "friend", (p) =>
    addPlanningCourse(
      p,
      { subject: "MATH", number: "1151" },
      "Autumn2027",
      ids(),
    ),
  );
  assert.equal(boardCourses(edited)[0].course.subject, "PSYCH");
  assert.equal(
    boardCourses(scenarioPlan(edited, "friend"))[0].course.subject,
    "MATH",
  );
  const remote = createScenario(initial, "Another plan", "other");
  const merged = reconcilePlans(initial, edited, remote);
  assert.equal(merged.scenarios.length, 2);
  assert.equal(
    boardCourses(scenarioPlan(merged, "friend"))[0].course.subject,
    "MATH",
  );
  assert.throws(() =>
    planSchema.parse({
      ...edited,
      scenarios: [...edited.scenarios, edited.scenarios[0]],
    }),
  );
  const invalid = structuredClone(edited);
  invalid.scenarios[0].plan.schedule.placements = [
    { courseId: "missing", term: "Autumn2027" },
  ];
  assert.equal(planSchema.safeParse(invalid).success, false);
});

test("selective public plans strip academic reports, grades, notes, calendars, identities and other plans", () => {
  const id = ids();
  let p = addPlanningCourse(
    emptyPlan(),
    { subject: "PSYCH", number: "1100" },
    "Spring2027",
    id,
  );
  p = addPlanningCourse(
    p,
    { subject: "MATH", number: "1151" },
    "Autumn2027",
    id,
  );
  p = createScenario(p, "Private friend name", "secret");
  p.semesters[0].courses[0].title = "Introduction to Psychology";
  const s = planShareSnapshot(p, "My spring", ["Spring2027"]);
  assert.equal(s.semesters.length, 1);
  assert.equal(s.semesters[0].courses.length, 1);
  const raw = JSON.stringify(s);
  for (const key of [
    "documents",
    "allocations",
    "scenarios",
    "calendars",
    "documentId",
    "status",
    "page",
    "auditMode",
    "Private friend",
  ])
    assert.equal(raw.includes(key), false, key);
  const parsed = planShareSchema.parse({
    ...s,
    ownerId: "secret",
    documents: ["private"],
  });
  assert.equal("ownerId" in parsed, false);
  const copied = copyPlanShare(p, s, "copied", ids());
  assert.equal(boardCourses(copied).length, 2);
  const next = scenarioPlan(copied, "copied");
  assert.equal(boardCourses(next).length, 1);
  assert.equal(boardCourses(next)[0].course.status, "planned");
  assert.equal(next.documents[0].source, "manual");
});

test("independent simulation saves to the account calendar without copying personal records", async () => {
  const { calendarSchema } = await import("../../src/lib/calendar/model.ts");
  const calendar = calendarSchema.parse({
    id: "timetable",
    title: "Friend timetable",
    kind: "simulation",
    events: [],
    updatedAt: "2026-11-23",
  });
  const base = createScenario(emptyPlan(), "Friend", "friend");
  const edited = editScenario(base, "friend", (p) => ({
    ...p,
    schedule: { ...p.schedule, calendars: [calendar] },
  }));
  assert.equal(edited.schedule.calendars[0].id, "timetable");
  assert.equal(
    editScenario(edited, "friend", () => emptyPlan()).schedule.calendars[0].id,
    "timetable",
  );
  assert.equal(edited.scenarios[0].plan.schedule.calendars, undefined);
  assert.equal(
    scenarioPlan(edited, "friend").schedule.calendars[0].title,
    "Friend timetable",
  );
});
test("first device merge preserves independent plans on both sides, and public copies preserve elective slots and section choices", () => {
  let n = 0;
  const id = () => "item-" + ++n;
  const course = (subject) =>
    addPlanningCourse(
      emptyPlan(),
      { subject, number: "1100" },
      "Spring2027",
      id,
    );
  const a = createScenario(course("PSYCH"), "Friend A", "friend-a");
  const b = createScenario(course("CSE"), "Friend B", "friend-b");
  assert.equal(reconcilePlans(null, a, b).scenarios.length, 2);
  a.schedule.sectionChoices = {
    Spring2027: { "PSYCH 1100": ["12345", "12346"] },
  };
  a.semesters.push({
    documentId: a.documents[0].id,
    term: "Spring2027",
    reportedCredits: null,
    courses: [
      {
        id: id(),
        subject: null,
        number: null,
        kind: "placeholder",
        title: "Elective",
        credits: 3,
        status: "planned",
        page: null,
      },
    ],
  });
  const snapshot = planShareSnapshot(a, "Spring", ["Spring2027"]);
  const copy = scenarioPlan(
    copyPlanShare(emptyPlan(), snapshot, "copy", id),
    "copy",
  );
  assert.equal(boardCourses(copy).length, 2);
  assert.deepEqual(copy.schedule.sectionChoices.Spring2027["PSYCH 1100"], [
    "12345",
    "12346",
  ]);
  assert.equal(
    boardCourses(copy).find((r) => r.course.kind === "placeholder").course
      .title,
    "Elective",
  );
});

test("older backups remain readable while outdated writers cannot strip new workspace fields", async () => {
  const { planUploadSchema } = await import("../../src/lib/planning/model.ts");
  for (const schemaVersion of [1, 2]) {
    const old = { ...emptyPlan(), schemaVersion };
    assert.equal(planSchema.parse(old).schemaVersion, 3);
    assert.equal(planUploadSchema.safeParse(old).success, false);
  }
  assert.equal(planUploadSchema.safeParse(emptyPlan()).success, true);
});

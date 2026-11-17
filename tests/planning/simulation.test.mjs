import { test } from "node:test";
import assert from "node:assert/strict";
import {
  simulateSchedule,
  simulationDiagnostics,
  semesterCatalogCode,
} from "../../src/lib/planning/simulation.ts";
import { emptyPlan, planSchema } from "../../src/lib/planning/model.ts";
import { mergeSnapshots } from "../../src/lib/planning/snapshots.ts";
const preferences = { compact: true, buffer: 10, blocked: [] };
const section = (id, start, end, day = 0, dates = {}) => ({
  classNumber: id,
  section: id,
  component: "Lecture",
  enrollmentStatus: "Open",
  meetings: [{ days: [day], startTime: start, endTime: end, ...dates }],
});
const course = (number, sections) => ({
  subject: "CSE",
  catalogNumber: number,
  sections,
});
test("semester codes use OSU Spring, Summer and Autumn identifiers", () => {
  assert.equal(semesterCatalogCode("Spring2027"), "1272");
  assert.equal(semesterCatalogCode("Autumn2026"), "1268");
  assert.equal(semesterCatalogCode("Summer2027"), "1274");
  assert.throws(() => semesterCatalogCode("unassigned"));
});
test("simulation fills an unselected section around fixed classes", () => {
  const result = simulateSchedule(
    [
      course("1111", [section("a", "09:00", "10:00")]),
      course("2222", [
        section("b", "09:30", "10:30"),
        section("c", "10:10", "11:10"),
      ]),
    ],
    { "CSE 1111": ["a"] },
    preferences,
  );
  assert.equal(result.choices[1].sections[0].classNumber, "c");
  assert.equal(result.conflicts.length, 0);
});
test("fixed conflicting classes remain fixed and identify both courses", () => {
  const result = simulateSchedule(
    [
      course("1111", [section("a", "09:00", "10:00")]),
      course("2222", [
        section("b", "09:30", "10:30"),
        section("c", "12:00", "13:00"),
      ]),
    ],
    { "CSE 2222": ["b"] },
    preferences,
  );
  assert.equal(result.choices[1].sections[0].classNumber, "b");
  assert.equal(result.conflicts.length, 1);
});
test("blocked days and compact preferences select a suitable alternative", () => {
  const courses = [
    course("1111", [section("a", "09:00", "10:00", 1)]),
    course("2222", [
      section("b", "10:10", "11:00", 0),
      section("c", "10:10", "11:00", 1),
      section("d", "15:00", "16:00", 1),
    ]),
  ];
  const result = simulateSchedule(
    courses,
    {},
    { ...preferences, blocked: [{ days: [0], start: 0, end: 1440 }] },
  );
  assert.equal(result.choices[1].sections[0].classNumber, "c");
  assert.equal(result.conflicts.length, 0);
});
test("different sessions can share a time and missing times remain unknown", () => {
  const first = section("a", "09:00", "10:00", 0, {
    startDate: "2027-01-01",
    endDate: "2027-02-28",
  });
  const second = section("b", "09:00", "10:00", 0, {
    startDate: "2027-03-01",
    endDate: "2027-04-30",
  });
  assert.equal(
    simulationDiagnostics(
      [
        { key: "a", sections: [first] },
        { key: "b", sections: [second] },
      ],
      preferences,
    ).conflicts.length,
    0,
  );
  const result = simulateSchedule(
    [course("1111", [{ ...first, meetings: [] }]), course("2222", [])],
    {},
    preferences,
  );
  assert.deepEqual(result.unknown, ["CSE 1111"]);
  assert.deepEqual(result.unavailable, ["CSE 2222"]);
});
test("simulation preferences and selected sections survive validation and imports", () => {
  const plan = emptyPlan();
  plan.schedule.sectionChoices = { Spring2027: { "CSE 1111": ["12345"] } };
  plan.schedule.simulationPreferences = { Spring2027: preferences };
  assert.deepEqual(
    mergeSnapshots(planSchema.parse(plan), emptyPlan()).schedule.sectionChoices,
    plan.schedule.sectionChoices,
  );
  assert.throws(() =>
    planSchema.parse({
      ...plan,
      schedule: {
        ...plan.schedule,
        simulationPreferences: {
          Spring2027: {
            ...preferences,
            blocked: [{ days: [0], start: 900, end: 800 }],
          },
        },
      },
    }),
  );
});

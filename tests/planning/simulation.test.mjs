import { test } from "node:test";
import assert from "node:assert/strict";
import {
  simulateSchedule,
  simulationDiagnostics,
  semesterCatalogCode,
  sessionSectionsForTerm,
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
test("cached course details do not treat credit or unassigned planner buckets as semesters", () => {
  const cached = {
    ...course("2111", [section("0010", "09:00", "10:00")]),
    termCode: "1272",
  };
  for (const bucket of [
    "credit",
    "unassigned",
    "Transfer Credits",
    "Exam Credits",
    "",
  ])
    assert.deepEqual(sessionSectionsForTerm(cached, bucket), []);
  assert.equal(sessionSectionsForTerm(cached, "Spring2027").length, 1);
  assert.deepEqual(sessionSectionsForTerm(cached, "Autumn2026"), []);
  assert.deepEqual(sessionSectionsForTerm(cached, "Spring2027", "missing"), []);
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
test("simulation exposes ranked, distinct compatible timetables without fixing automatic sections", () => {
  const result = simulateSchedule(
    [
      course("1111", [section("fixed", "09:00", "10:00")]),
      course("2222", [
        section("overlap", "09:30", "10:30"),
        section("near", "10:10", "11:00"),
        section("later", "12:00", "13:00"),
      ]),
    ],
    { "CSE 1111": ["fixed"] },
    preferences,
  );
  assert.equal(result.alternatives.length, 2);
  assert.deepEqual(result.choices, result.alternatives[0].choices);
  assert.deepEqual(
    result.alternatives.map(
      (option) => option.choices[1].sections[0].classNumber,
    ),
    ["near", "later"],
  );
  assert.ok(
    result.alternatives.every((option) => option.conflicts.length === 0),
  );
  assert.ok(
    result.alternatives.every(
      (option) => option.choices[0].sections[0].classNumber === "fixed",
    ),
  );
  const pinned = simulateSchedule(
    [
      course("2222", [
        section("near", "10:10", "11:00"),
        section("later", "12:00", "13:00"),
      ]),
    ],
    { "CSE 2222": ["later"] },
    preferences,
  );
  assert.equal(pinned.alternatives.length, 1);
  assert.equal(pinned.choices[0].sections[0].classNumber, "later");
});
test("simulation alternatives stay bounded and retain a diagnosed result when every choice conflicts", () => {
  const result = simulateSchedule(
    [
      course(
        "1111",
        Array.from({ length: 80 }, (_, i) =>
          section(String(i), "09:00", "10:00", i % 5),
        ),
      ),
    ],
    {},
    preferences,
  );
  assert.ok(result.alternatives.length > 1);
  assert.ok(result.alternatives.length <= 24);
  assert.equal(
    new Set(
      result.alternatives.map((a) => a.choices[0].sections[0].classNumber),
    ).size,
    result.alternatives.length,
  );
  assert.equal(result.capped, true);
  const blocked = simulateSchedule(
    [
      course("1111", [
        section("a", "09:00", "10:00"),
        section("b", "11:00", "12:00"),
      ]),
    ],
    {},
    { ...preferences, blocked: [{ days: [0], start: 0, end: 1440 }] },
  );
  assert.equal(blocked.alternatives.length, 1);
  assert.equal(blocked.alternatives[0].conflicts.length, 1);
  assert.deepEqual(simulateSchedule([], {}, preferences).alternatives, []);
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

test("invalid dates do not crash the simulator and closed sections remain flagged", () => {
  const a = section("a", "09:00", "10:00", 0, {
    startDate: "invalid",
    endDate: "invalid",
  });
  a.enrollmentStatus = "Closed";
  a.availabilityState = "ready";
  a.availability = {
    source: "official-availability",
    fetchedAt: "2026-11-23T12:00:00Z",
    isOpen: false,
    enrollmentStatus: "Closed",
    enrollmentCapacity: null,
    enrollmentTotal: null,
    availableSeats: 0,
    waitlistCapacity: null,
    waitlistTotal: null,
  };
  const result = simulateSchedule(
    [course("1111", [a]), course("2222", [section("b", "09:30", "10:30")])],
    {},
    preferences,
  );
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.restricted, ["CSE 1111"]);
});

test("verified zero seats and waitlists remain restricted even with missing status text", () => {
  const current = (id, availability) => ({
    ...section(id, "09:00", "10:00"),
    enrollmentStatus: "Open",
    availabilityState: "ready",
    availability: {
      source: "official-availability",
      fetchedAt: "2026-11-23T12:00:00Z",
      isOpen: null,
      enrollmentStatus: "",
      enrollmentCapacity: 30,
      enrollmentTotal: 30,
      availableSeats: 0,
      waitlistCapacity: 10,
      waitlistTotal: 0,
      ...availability,
    },
  });
  const result = simulateSchedule(
    [
      course("1111", [current("full", {})]),
      course("2222", [
        current("wait", { enrollmentStatus: "Wait List", waitlistTotal: 3 }),
      ]),
    ],
    {},
    { ...preferences, buffer: 0 },
  );
  assert.deepEqual(result.restricted, ["CSE 1111", "CSE 2222"]);
});

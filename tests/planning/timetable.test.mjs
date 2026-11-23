import assert from "node:assert/strict";
import { test } from "node:test";
import {
  meetingDelivery,
  timetableMeetings,
  timetableFrame,
  timetableLanes,
} from "../../src/lib/planning/timetable.ts";
import { simulationCourseColors } from "../../src/lib/planning/simulation-colors.ts";

const meeting = (
  location,
  days = [0],
  startTime = "09:00",
  endTime = "10:00",
) => ({
  location,
  days,
  startTime,
  endTime,
  startDate: "2027-01-11",
  endDate: "2027-04-26",
});
const section = (meetings, instructionMode = "Hybrid") => ({
  classNumber: "12345",
  section: "0010",
  component: "LEC",
  instructionMode,
  meetings,
});
test("comparison frames include all candidate times and keep weekend columns stable", () => {
  const courses = [
    {
      sections: [
        section([meeting("Hall", [0], "07:20", "08:10")]),
        section([meeting("Hall", [6], "21:30", "22:15")]),
      ],
    },
  ];
  assert.deepEqual(timetableFrame(courses), { start: 420, end: 1380, days: 7 });
  assert.deepEqual(timetableFrame([]), { start: 480, end: 1200, days: 5 });
});
test("overlapping timetable events share lanes only for their connected time group", () => {
  const events = [
    { id: "later", day: 0, start: 660, end: 720 },
    { id: "b", day: 0, start: 570, end: 660 },
    { id: "a", day: 0, start: 540, end: 600 },
    { id: "other-day", day: 1, start: 540, end: 600 },
  ];
  const placed = timetableLanes(events);
  assert.equal(placed.find((event) => event.id === "a").lanes, 2);
  assert.equal(placed.find((event) => event.id === "b").lane, 1);
  assert.equal(placed.find((event) => event.id === "later").lanes, 1);
  assert.equal(placed.find((event) => event.id === "other-day").lanes, 1);
  assert.deepEqual(
    events.map((event) => event.id),
    ["later", "b", "a", "other-day"],
  );
});
test("a timetable gives neighboring courses distinct colors regardless of source ordering", () => {
  const keys = Array.from(
    { length: 8 },
    (_, i) => `CSE ${String(i + 1).repeat(4)}`,
  );
  const colors = simulationCourseColors(keys);
  assert.equal(new Set(Object.values(colors)).size, 8);
  assert.deepEqual(simulationCourseColors([...keys].reverse()), colors);
  assert.deepEqual(simulationCourseColors([...keys, keys[0]]), colors);
});

test("mixed-delivery sections retain the location and mode of each meeting", () => {
  const rows = timetableMeetings([
    {
      key: "ECON 2001.01",
      sections: [section([meeting("Ovalwood 015"), meeting("Online", [2])])],
    },
  ]);
  assert.deepEqual(
    rows.map((row) => row.delivery),
    ["in-person", "online"],
  );
  assert.deepEqual(
    rows.map((row) => row.slots[0].day),
    [0, 2],
  );
  assert.equal(rows[0].location, "Ovalwood 015");
  assert.notEqual(rows[0].id, rows[1].id);
  assert.equal(rows[1].slots[0].start, 540);
});

test("missing times stay unscheduled and do not imply online delivery", () => {
  const rows = timetableMeetings([
    {
      key: "TEST 1000",
      sections: [
        section([
          meeting(null, [], null, null),
          meeting("Online", [], null, null),
          meeting("Science 100", [0], null, null),
        ]),
      ],
    },
  ]);
  assert.deepEqual(
    rows.map((row) => row.delivery),
    ["unknown", "online", "in-person"],
  );
  assert.ok(rows.every((row) => row.slots.length === 0));
  for (const location of [null, "", "TBA", "TBD", "N/A", "Arranged"])
    assert.equal(meetingDelivery({ location }), "unknown");
});

test("sections with no meetings remain visible with their published mode", () => {
  const rows = timetableMeetings([
    { key: "TEST 1000", sections: [section([], "Distance Learning")] },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].delivery, "online");
  assert.deepEqual(rows[0].slots, []);
  assert.equal(meetingDelivery(undefined, "In Person"), "in-person");
  assert.equal(meetingDelivery(undefined, "Hybrid"), "unknown");
});

test("weekends and multiple days retain every timed slot without duplicating identity", () => {
  const rows = timetableMeetings([
    {
      key: "TEST 1000",
      sections: [
        section([
          meeting("Online", [0, 5, 6]),
          meeting("Hall 110", [0], "14:00", "15:00"),
        ]),
      ],
    },
  ]);
  assert.deepEqual(
    rows[0].slots.map((slot) => slot.day),
    [0, 5, 6],
  );
  assert.equal(new Set(rows.map((row) => row.id)).size, 2);
  assert.equal(rows[0].slots[0].from, "2027-01-11");
});

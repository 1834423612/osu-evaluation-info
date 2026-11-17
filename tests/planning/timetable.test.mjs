import assert from "node:assert/strict";
import { test } from "node:test";
import {
  meetingDelivery,
  timetableMeetings,
} from "../../src/lib/planning/timetable.ts";

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

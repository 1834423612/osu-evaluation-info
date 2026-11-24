import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compactCourseCode,
  calendarEventWhen,
  activeSharedCalendarIds,
} from "../../src/lib/calendar/presentation.ts";

const meeting = {
  title: "ECON 2001.01 · Principles of Microeconomics",
  start: "2027-01-12T22:00:00Z",
  end: "2027-01-12T23:00:00Z",
  allDay: false,
};

test("compact calendar labels retain the complete course number and suffix", () => {
  assert.equal(compactCourseCode("CSE 2111 · Modeling"), "CSE2111");
  assert.equal(compactCourseCode(meeting.title), "ECON2001.01");
  assert.equal(compactCourseCode("MATH1151H"), "MATH1151H");
  assert.equal(compactCourseCode("ACCTMIS 2200"), "ACCTMIS2200");
  assert.equal(compactCourseCode("Project meeting"), null);
  assert.equal(compactCourseCode("Room 2001"), null);
});

test("same-day event details show one Eastern date and a separate time range", () => {
  const when = calendarEventWhen(meeting, "en");
  assert.equal(when.date, "Tue, Jan 12, 2027");
  assert.match(when.time, /5:00.*6:00.*PM/);
  assert.equal(/Jan|2027/.test(when.time), false);
  const point = calendarEventWhen({ ...meeting, end: meeting.start }, "en");
  assert.equal(point.time, "5:00 PM");
});

test("event detail dates honor Eastern midnight and exclusive all-day ends", () => {
  const overnight = calendarEventWhen(
    {
      ...meeting,
      start: "2027-01-13T04:30:00Z",
      end: "2027-01-13T05:30:00Z",
    },
    "en",
  );
  assert.match(overnight.date, /Jan 12.*13.*2027/);
  const allDay = calendarEventWhen(
    {
      ...meeting,
      allDay: true,
      start: "2027-01-12",
      end: "2027-01-13",
    },
    "en",
  );
  assert.equal(allDay.date, "Tue, Jan 12, 2027");
  assert.equal(allDay.time, null);
  assert.match(calendarEventWhen(meeting, "zh").date, /2027.*1.*12/);
});

test("shared calendar marks require a current active link to an owned calendar", () => {
  const now = Date.parse("2027-01-12T22:00:00Z");
  const links = [
    { calendarIds: ["owned", "removed", "official-academic"], expiresAt: null },
    { calendarIds: ["expired"], expiresAt: "2027-01-12T21:59:59Z" },
    { calendarIds: ["boundary"], expiresAt: "2027-01-12T22:00:00Z" },
    { calendarIds: ["future"], expiresAt: "2027-01-12T22:00:01Z" },
    { calendarIds: ["invalid"], expiresAt: "invalid" },
    { calendarIds: ["revoked"], expiresAt: null, revokedAt: "2027-01-12" },
  ];
  const owned = [
    "owned",
    "expired",
    "boundary",
    "future",
    "invalid",
    "revoked",
  ];
  assert.deepEqual(
    [...activeSharedCalendarIds(links, owned, now)],
    ["owned", "future"],
  );
  assert.deepEqual(
    [...activeSharedCalendarIds(links, owned, now + 1000)],
    ["owned"],
  );
  assert.equal(activeSharedCalendarIds(links, [], now).size, 0);
});

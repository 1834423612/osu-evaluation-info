import test from "node:test";
import assert from "node:assert/strict";
import { academicEvents } from "../../src/lib/calendar/academic.ts";
import { calendarEventSchema } from "../../src/lib/calendar/model.ts";
import * as week from "../../src/lib/calendar/week.ts";

const official = academicEvents([
  {
    id: "break",
    date: "2027-03-14",
    end: "2027-03-20",
    title: "Spring break — no classes",
    categories: ["Spring"],
    noClasses: true,
    kind: "holiday",
  },
  {
    id: "offices",
    date: "2027-03-21",
    end: "2027-03-21",
    title: "Offices closed",
    categories: [],
    noClasses: false,
    kind: "holiday",
  },
]);

test("official no-class metadata survives calendar validation without treating office closures as class holidays", () => {
  assert.equal(calendarEventSchema.parse(official[0]).noClasses, true);
  assert.equal(calendarEventSchema.parse(official[1]).noClasses, false);
});

test("only official all-day no-class dates shade a week column, using exclusive date-only boundaries", () => {
  const personal = { ...official[0], id: "personal", noClasses: undefined };
  const timed = {
    ...official[0],
    id: "official-timed",
    allDay: false,
    start: "2027-03-14T23:00:00Z",
    end: "2027-03-15T02:00:00Z",
  };
  const events = [...official, personal, timed];
  assert.deepEqual(week.noClassEventsForDate?.(events, "2027-03-13"), []);
  assert.deepEqual(week.noClassEventsForDate?.(events, "2027-03-14"), [
    official[0],
  ]);
  assert.deepEqual(week.noClassEventsForDate?.(events, "2027-03-20"), [
    official[0],
  ]);
  assert.deepEqual(week.noClassEventsForDate?.(events, "2027-03-21"), []);
  assert.deepEqual(week.noClassEventsForDate?.(events, "2028-03-14"), []);
});

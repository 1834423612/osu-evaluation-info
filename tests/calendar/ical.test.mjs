import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCalendar, exportCalendar } from "../../src/lib/calendar/ical.ts";
import {
  normalizeAcademicEntries,
  isNoClassDate,
  officialCalendars,
  OFFICIAL_CALENDAR_IDS,
} from "../../src/lib/calendar/academic.ts";
import {
  calendarFromSimulation,
  newYorkTime,
} from "../../src/lib/calendar/schedules.ts";
import { emptyPlan } from "../../src/lib/planning/model.ts";
import {
  calendarSchema,
  calendarEventSchema,
  combinedEvents,
  applyCalendarRefresh,
  availableSourceIds,
} from "../../src/lib/calendar/model.ts";
import { newYorkDate, eventInDateRange } from "../../src/lib/calendar/dates.ts";
const envelope = (events) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR\r\n`;
const bounds = [new Date("2027-01-01"), new Date("2028-01-01")];
test("multiple display reminders survive ICS export and import without duplicate alarms", async () => {
  const event = calendarEventSchema.parse({
    id: "reminders",
    title: "Class",
    start: "2027-01-12T14:00:00Z",
    end: "2027-01-12T15:00:00Z",
    allDay: false,
    category: "class",
    reminders: [1440, 10, 10, 0],
  });
  const text = exportCalendar("Test", [event], "test");
  assert.equal((text.match(/BEGIN:VALARM/g) ?? []).length, 3);
  assert.ok(text.includes("TRIGGER:-PT1440M"));
  assert.ok(text.includes("TRIGGER:PT0M"));
  const [parsed] = await parseCalendar(text, ...bounds);
  assert.deepEqual(parsed.reminders, [0, 10, 1440]);
});
test("combined calendars inherit source reminders, honor event overrides and preserve refresh preferences", () => {
  const event = {
    id: "one",
    title: "Class",
    start: "2027-01-12T14:00:00Z",
    end: "2027-01-12T15:00:00Z",
    allDay: false,
    category: "class",
  };
  const source = calendarSchema.parse({
    id: "source",
    title: "Source",
    kind: "personal",
    events: [event, { ...event, id: "muted", reminders: [] }],
    reminders: [30, 10],
    updatedAt: "now",
  });
  const combined = calendarSchema.parse({
    id: "combined",
    title: "Combined",
    kind: "combined",
    sourceIds: ["source"],
    events: [],
    updatedAt: "now",
  });
  assert.deepEqual(
    combinedEvents([source, combined], combined).map((item) => item.reminders),
    [[10, 30], []],
  );
  assert.deepEqual(
    applyCalendarRefresh(source, { ...source, reminders: [] }).reminders,
    [10, 30],
  );
  assert.equal(
    calendarEventSchema.safeParse({ ...event, reminders: [-1] }).success,
    false,
  );
  assert.equal(
    calendarEventSchema.safeParse({ ...event, reminders: [43201] }).success,
    false,
  );
});
test("nested combined calendars carry middle reminder defaults and preserve explicit event overrides", () => {
  const event = {
    id: "inherited",
    title: "Class",
    start: "2027-01-12T14:00:00Z",
    end: "2027-01-12T15:00:00Z",
    allDay: false,
    category: "class",
  };
  const leaf = calendarSchema.parse({
    id: "leaf",
    title: "Leaf",
    kind: "personal",
    reminders: [15],
    events: [event, { ...event, id: "explicit", reminders: [5] }],
    updatedAt: "now",
  });
  const middle = calendarSchema.parse({
    id: "middle",
    title: "Middle",
    kind: "combined",
    reminders: [],
    sourceIds: ["leaf"],
    events: [],
    updatedAt: "now",
  });
  const outer = calendarSchema.parse({
    id: "outer",
    title: "Outer",
    kind: "combined",
    sourceIds: ["middle"],
    events: [],
    updatedAt: "now",
  });
  const reminders = (mid = middle, root = outer) =>
    combinedEvents([leaf, mid, root], root).map((item) => item.reminders);
  assert.deepEqual(
    reminders(),
    [[], [5]],
    "a middle calendar can keep its entire subtree silent",
  );
  assert.deepEqual(
    reminders({ ...middle, reminders: [30] }),
    [[30], [5]],
    "a middle default reaches nested sources",
  );
  assert.deepEqual(
    reminders(middle, { ...outer, reminders: [60] }),
    [[60], [5]],
    "outer explicit defaults take priority while event overrides still win",
  );
});
test("imported alarms retain only bounded passive display reminders before the start", async () => {
  const alarm = (action, trigger, extra = "") =>
    `BEGIN:VALARM\r\nACTION:${action}\r\nTRIGGER${trigger}\r\n${extra}END:VALARM\r\n`;
  const text = envelope(
    "BEGIN:VEVENT\r\nUID:alarm-safety\r\nDTSTART:20270112T140000Z\r\nDTEND:20270112T150000Z\r\nSUMMARY:Safe reminders\r\n" +
      alarm("DISPLAY", ":-PT10M") +
      alarm("DISPLAY", ":-PT10M") +
      alarm("EMAIL", ":-PT5M", "ATTENDEE:mailto:test@example.edu\r\n") +
      alarm("DISPLAY", ";RELATED=END:-PT30M") +
      alarm("DISPLAY", ":PT15M") +
      alarm("DISPLAY", ";VALUE=DATE-TIME:20270112T130000Z") +
      "END:VEVENT",
  );
  const [event] = await parseCalendar(text, ...bounds);
  assert.deepEqual(event.reminders, [10]);
  const exported = exportCalendar("Safe", [event], "safe");
  assert.equal((exported.match(/BEGIN:VALARM/g) ?? []).length, 1);
  assert.ok(!exported.includes("ATTENDEE"));
});
test("ICS export rejects URL property injection while preserving ordinary URI punctuation", async () => {
  const event = {
    id: "one",
    title: "Due",
    start: "2027-01-12T14:00:00Z",
    end: "2027-01-12T14:00:00Z",
    allDay: false,
    category: "assignment",
    description: "",
    location: "",
  };
  const malicious = exportCalendar(
    "Test",
    [
      {
        ...event,
        url: "https://example.edu/\r\nATTENDEE:mailto:test@example.edu",
      },
    ],
    "test",
  );
  assert.ok(!malicious.includes("\r\nATTENDEE:"));
  assert.ok(!malicious.includes("\r\nURL:"));
  const url = "https://example.edu/task?a=1&b=2#assignment_3";
  const [roundTrip] = await parseCalendar(
    exportCalendar("Test", [{ ...event, url }], "test"),
    ...bounds,
  );
  assert.equal(roundTrip.url, url);
});
test("Canvas assignment fragments are categorized and ICS round trips retain category and source link", async () => {
  const source = envelope(
    "BEGIN:VEVENT\r\nUID:assignment-test\r\nDTSTART:20270112T140000Z\r\nDTEND:20270112T140000Z\r\nSUMMARY:Reading due\r\nURL:https://osu.instructure.com/calendar#assignment_123\r\nEND:VEVENT",
  );
  const [event] = await parseCalendar(source, ...bounds);
  assert.equal(event.category, "assignment");
  const [roundTrip] = await parseCalendar(
    exportCalendar("Test", [{ ...event, category: "exam" }], "test"),
    ...bounds,
  );
  assert.equal(roundTrip.category, "exam");
  assert.equal(roundTrip.url, event.url);
});

test("Today and range boundaries use Eastern dates and exclusive all-day ends", () => {
  assert.equal(newYorkDate(new Date("2026-12-01T01:00:00Z")), "2026-11-30");
  assert.equal(newYorkDate(new Date("2027-07-01T02:00:00Z")), "2027-06-30");
  const event = calendarEventSchema.parse({
    id: "holiday",
    title: "January holiday",
    start: "2027-01-31",
    end: "2027-02-01",
    allDay: true,
    category: "holiday",
  });
  assert.equal(eventInDateRange(event, "2027-02-01", "2027-02-28"), false);
  assert.equal(eventInDateRange(event, "2027-01-01", "2027-01-31"), true);
  const meeting = {
    ...event,
    allDay: false,
    start: "2027-02-01T15:00:00Z",
    end: "2027-02-01T16:00:00Z",
  };
  assert.equal(eventInDateRange(meeting, "2027-02-01", "2027-02-28"), true);
});

test("missing combined sources do not consume replacement capacity", () => {
  const calendar = calendarSchema.parse({
    id: "combined",
    title: "Combined",
    kind: "combined",
    events: [],
    updatedAt: "",
    sourceIds: Array.from({ length: 30 }, (_, i) => "missing-" + i),
  });
  const source = { ...calendar, id: "available", sourceIds: [] };
  assert.deepEqual(availableSourceIds(calendar, [calendar, source]), []);
  assert.deepEqual(
    availableSourceIds(
      {
        ...calendar,
        sourceIds: ["combined", "available", "available", "missing"],
      },
      [calendar, source],
    ),
    ["available"],
  );
});

test("default official calendars partition shared dates and retain stable source identities", () => {
  const days = ["term", "exam", "holiday", "deadline"].map((kind, index) => ({
    id: String(index),
    date: "2027-01-18",
    end: "2027-01-18",
    title: kind,
    categories: [],
    noClasses: kind === "holiday",
    kind,
  }));
  const defaults = officialCalendars(days);
  assert.deepEqual(
    defaults.map((calendar) => calendar.id),
    OFFICIAL_CALENDAR_IDS,
  );
  assert.deepEqual(
    defaults.map((calendar) => calendar.events.length),
    [2, 1, 1],
  );
  assert.ok(
    defaults.every((calendar) => calendarSchema.safeParse(calendar).success),
  );
  assert.equal(defaults[1].events[0].end, "2027-01-19");
  assert.match(defaults[1].events[0].url, /^https:\/\/registrar.osu.edu\//);
  assert.deepEqual(
    officialCalendars([], "zh").map((calendar) => calendar.id),
    OFFICIAL_CALENDAR_IDS,
  );
  const combined = calendarSchema.parse({
    id: "combined",
    title: "My dates",
    kind: "combined",
    sourceIds: [...OFFICIAL_CALENDAR_IDS],
    events: [],
    updatedAt: "2027-01-01",
  });
  assert.equal(combinedEvents([...defaults, combined], combined).length, 4);
});

test("a remote refresh preserves settings saved while its request was pending", () => {
  const original = calendarSchema.parse({
    id: "feed",
    title: "Original",
    kind: "feed",
    feedUrl: "https://example.edu/calendar.ics",
    events: [],
    updatedAt: "2027-01-01",
  });
  const edited = {
    ...original,
    title: "Renamed",
    includeAcademic: false,
    active: false,
    range: { start: "2027-02-01", end: "2027-03-01" },
    icon: "star",
    color: "mint",
  };
  const incoming = {
    ...original,
    refreshedAt: "2027-01-02",
    updatedAt: "2027-01-02",
    events: [{ id: "new", title: "New source event" }],
  };
  const result = applyCalendarRefresh(edited, incoming);
  assert.deepEqual(
    {
      ...result,
      events: [],
      refreshedAt: undefined,
      updatedAt: edited.updatedAt,
    },
    { ...edited, refreshedAt: undefined },
  );
  assert.deepEqual(result.events, incoming.events);
  assert.equal(result.refreshedAt, incoming.refreshedAt);
});
test("IANA time zones without VTIMEZONE preserve local time across DST", async () => {
  const events = await parseCalendar(
    envelope(
      "BEGIN:VEVENT\r\nUID:dst\r\nDTSTART;TZID=America/New_York:20270307T100000\r\nDTEND;TZID=America/New_York:20270307T110000\r\nRRULE:FREQ=WEEKLY;COUNT=2\r\nSUMMARY:DST\r\nEND:VEVENT",
    ),
    ...bounds,
  );
  assert.equal(events[0].start, "2027-03-07T15:00:00.000Z");
  assert.equal(events[1].start, "2027-03-14T14:00:00.000Z");
});
test("invalid dates and negative durations are rejected, combined calendars retain distinct event identities", () => {
  const event = {
    id: "same",
    title: "Synthetic",
    start: "2027-02-28",
    end: "2027-03-01",
    allDay: true,
    category: "event",
    description: "",
    location: "",
  };
  assert.equal(
    calendarEventSchema.safeParse({ ...event, start: "2027-02-30" }).success,
    false,
  );
  assert.equal(
    calendarEventSchema.safeParse({ ...event, end: "2027-02-01" }).success,
    false,
  );
  const make = (id) =>
    calendarSchema.parse({
      id,
      title: id,
      kind: "personal",
      events: [event],
      updatedAt: "2027-01-01",
    });
  const a = make("a"),
    b = make("b"),
    parent = { ...make("c"), events: [], sourceIds: ["a", "b"] };
  const merged = combinedEvents([a, b, parent], parent);
  assert.equal(merged.length, 2);
  assert.equal(new Set(merged.map((e) => e.id)).size, 2);
});
test("ICS recurrence excludes exceptions, preserves dates and stable identities", async () => {
  const event =
    "BEGIN:VEVENT\r\nUID:synthetic-weekly\r\nDTSTART:20270111T150000Z\r\nDTEND:20270111T160000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nEXDATE:20270118T150000Z\r\nSUMMARY:Weekly class\r\nEND:VEVENT";
  const events = await parseCalendar(envelope(event), ...bounds);
  assert.equal(events.length, 2);
  assert.equal(events[1].start, "2027-01-25T15:00:00.000Z");
  const again = await parseCalendar(envelope(event), ...bounds);
  assert.deepEqual(again, events);
  assert.equal(
    (
      await parseCalendar(
        exportCalendar("Calendar", events, "synthetic"),
        ...bounds,
      )
    ).length,
    2,
  );
});
test("all-day duplicate VALUE parameters and folded UTF-8 titles round trip", async () => {
  const events = await parseCalendar(
    envelope(
      "BEGIN:VEVENT\r\nUID:due\r\nDTSTART;VALUE=DATE;VALUE=DATE:20270202\r\nSUMMARY:作业截止\r\nEND:VEVENT",
    ),
    ...bounds,
  );
  assert.equal(events[0].allDay, true);
  assert.equal(events[0].start, "2027-02-02");
  events[0].title = "日历课程".repeat(50);
  const exported = exportCalendar("日程", events, "synthetic");
  assert.ok(
    exported.split("\r\n").every((line) => Buffer.byteLength(line) <= 75),
  );
  assert.equal(
    (await parseCalendar(exported, ...bounds))[0].title,
    events[0].title,
  );
});
test("academic dates distinguish closures from no-class days and suppress class occurrences", () => {
  const days = normalizeAcademicEntries([
    {
      ID: 1,
      DateTime: "2027-01-18T12:00:00Z",
      EndDateTime: "0001-01-01T00:00:00",
      Title: "Martin Luther King Jr. Day; no classes, offices closed",
      Type: ["Holidays"],
    },
  ]);
  assert.equal(isNoClassDate("2027-01-18", days), true);
  const plan = emptyPlan();
  const calendar = calendarFromSimulation(
    plan,
    "Spring2027",
    [
      {
        key: "TEST 1000",
        sections: [
          {
            classNumber: "1",
            section: "0010",
            component: "LEC",
            session: "Regular Academic Term",
            instructionMode: "In Person",
            meetings: [
              {
                days: [0],
                startTime: "10:00",
                endTime: "11:00",
                startDate: "2027-01-11",
                endDate: "2027-01-25",
                location: "Room",
              },
            ],
          },
        ],
      },
    ],
    days,
    "synthetic",
  );
  assert.equal(calendar.events.length, 2);
  assert.ok(
    !calendar.events.some((event) => event.start.startsWith("2027-01-18")),
  );
  assert.equal(newYorkTime("2027-01-11", 600), "2027-01-11T15:00:00.000Z");
  assert.equal(newYorkTime("2027-04-12", 600), "2027-04-12T14:00:00.000Z");
});

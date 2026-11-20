import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publicCalendarAddress,
  readRemoteCalendar,
  pinnedCalendarLookup,
} from "../../src/lib/calendar/remote.ts";
import { weekSegments } from "../../src/lib/calendar/week.ts";
import { parseCalendar } from "../../src/lib/calendar/ical.ts";
test("pinned DNS lookup supports Node auto-family selection without resolving unverified addresses", () => {
  const addresses = [
    { address: "1.1.1.1", family: 4 },
    { address: "2606:4700::1111", family: 6 },
  ];
  const pinned = pinnedCalendarLookup(addresses);
  pinned("example.com", { all: true }, (error, result) => {
    assert.equal(error, null);
    assert.deepEqual(result, addresses);
  });
  pinned("example.com", {}, (error, address, family) => {
    assert.equal(error, null);
    assert.equal(address, "1.1.1.1");
    assert.equal(family, 4);
  });
});
test("remote feeds reject private and reserved addresses and unsupported URLs without fetching", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "100.106.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "198.18.0.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "::1",
    "fe80::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "2001:db8::1",
    "2002:7f00:1::1",
  ])
    assert.equal(publicCalendarAddress(address), false, address);
  for (const address of ["8.8.8.8", "1.1.1.1", "2606:4700::1111"])
    assert.equal(publicCalendarAddress(address), true, address);
  for (const url of [
    "http://example.com/a.ics",
    "https://user:pass@example.com/a.ics",
    "https://example.com:444/a.ics",
    "file:///tmp/a.ics",
  ])
    await assert.rejects(readRemoteCalendar(url));
});
test("overnight events split at Eastern midnight while preserving the original event", () => {
  const event = {
    id: "night",
    start: "2027-03-14T04:00:00.000Z",
    end: "2027-03-14T08:00:00.000Z",
    allDay: false,
  };
  const rows = weekSegments([event], ["2027-03-13", "2027-03-14"]);
  assert.deepEqual(
    rows.map(({ date, from, to }) => ({ date, from, to })),
    [
      { date: "2027-03-13", from: 1380, to: 1440 },
      { date: "2027-03-14", from: 0, to: 240 },
    ],
  );
  assert.equal(rows[0].event, event);
});
test("old unbounded recurrence fails explicitly instead of silently importing an empty partial calendar", async () => {
  await assert.rejects(
    parseCalendar(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:old\r\nDTSTART:19000101T090000Z\r\nDTEND:19000101T100000Z\r\nRRULE:FREQ=DAILY\r\nSUMMARY:Old\r\nEND:VEVENT\r\nEND:VCALENDAR",
      new Date("2027-01-01"),
      new Date("2028-01-01"),
    ),
    /Recurrence/,
  );
});

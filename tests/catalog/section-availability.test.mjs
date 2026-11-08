import assert from "node:assert/strict";
import test from "node:test";
import {
  availabilityKey,
  normalizeSectionAvailability,
  sectionAvailabilityQuery,
  validAvailabilityQuery,
} from "../../src/lib/catalog/section-availability.ts";
import { feesForCampus } from "../../src/lib/catalog/fees.ts";
import { createAvailabilityStore } from "../../src/lib/catalog/availability-store.ts";
import { watchIntervalMs } from "../../src/lib/catalog/watch-selection.ts";
const query = {
  courseId: "151332",
  courseOfferingNumber: "1",
  classSection: "0040",
  sessionCode: "1",
  termCode: "1268",
};
const section = {
  id: "1268-15047",
  classNumber: "15047",
  section: "0040",
  sessionCode: "1",
  courseId: "151332",
  courseOfferingNumber: "1",
  termCode: "1268",
  enrollmentTotal: 777,
  enrollmentStatus: "Open",
};
const course = {
  id: "1268-ANTHROP-2200-COL",
  courseId: "151332",
  termCode: "1268",
  sections: [section],
};
const payload = (total = 44) => ({
  status: "success",
  data: {
    availability: {
      isOpen: true,
      enrollmentStatus: "Open",
      enrollmentCapacity: 70,
      enrollmentTotal: total,
      availableSeats: 70 - total,
      waitlistCapacity: 999,
      waitlistTotal: 0,
    },
  },
});

test("uses the exact availability identifiers, retaining leading zeroes and offering/session identity", () => {
  assert.deepEqual(sectionAvailabilityQuery(section, course), query);
  assert.equal(
    new URLSearchParams(availabilityKey(query)).get("classSection"),
    "0040",
  );
  assert.notEqual(
    availabilityKey(query),
    availabilityKey({ ...query, courseOfferingNumber: "2" }),
  );
  assert.notEqual(
    availabilityKey(query),
    availabilityKey({ ...query, termCode: "1272" }),
  );
  assert.equal(
    validAvailabilityQuery({ ...query, courseId: "https://other.example" }),
    false,
  );
  assert.equal(
    sectionAvailabilityQuery(
      { ...section, courseOfferingNumber: undefined },
      course,
    ),
    null,
  );
});

test("normalizes genuine availability and preserves zeroes, closed and waitlist counts", () => {
  const normalized = normalizeSectionAvailability(payload());
  assert.equal(normalized.enrollmentTotal, 44);
  assert.equal(normalized.availableSeats, 26);
  assert.equal(normalized.waitlistTotal, 0);
  assert.equal(normalized.source, "official-availability");
  const waiting = normalizeSectionAvailability({
    status: "success",
    data: {
      availability: {
        isOpen: false,
        enrollmentStatus: "Waitlist",
        enrollmentCapacity: 20,
        enrollmentTotal: 20,
        availableSeats: 0,
        waitlistCapacity: 5,
        waitlistTotal: 3,
      },
    },
  });
  assert.equal(waiting.availableSeats, 0);
  assert.equal(waiting.waitlistTotal, 3);
  assert.equal(waiting.isOpen, false);
  assert.throws(() =>
    normalizeSectionAvailability({ data: { enrollmentTotal: 69 } }),
  );
  assert.equal(
    normalizeSectionAvailability({
      status: "success",
      data: { availability: { isOpen: false, enrollmentStatus: "Closed" } },
    }).enrollmentTotal,
    null,
  );
});

test("filters campus alternatives and keeps textbook fees scoped to their source", () => {
  const fees = [
    { name: "CRSF", value: "CF150", description: "COL Course Fee $150" },
    { name: "CRSF", value: "CFA50", description: "ATI Course Fee $50" },
    {
      name: "CRSF",
      value: "CFR30",
      description: "NWK LMA MNS MRN Course Fee $30",
    },
    {
      name: "ALX",
      value: "110.39",
      description: "Digital Txtbook Fee(s):$110.39",
    },
  ];
  assert.deepEqual(
    feesForCampus(fees, "COL").map((f) => f.amount),
    [150, 110.39],
  );
  assert.deepEqual(
    feesForCampus(fees, "LMA").map((f) => f.amount),
    [30, 110.39],
  );
  assert.deepEqual(
    feesForCampus(fees, "WST").map((f) => f.amount),
    [50, 110.39],
  );
  assert.equal(
    feesForCampus(
      [
        {
          name: "CRSF",
          value: "unknown",
          description: "Course Fee: see department",
        },
      ],
      "COL",
    )[0].amount,
    null,
  );
});

test("the client cannot render search placeholders, retains verified reads, and flags a failed refresh", async () => {
  let fail = false,
    calls = 0;
  const store = createAvailabilityStore(async (url, options) => {
    calls++;
    assert.equal(options.cache, "no-store");
    assert.equal(
      new URL(url, "https://local.test").searchParams.get("classSection"),
      "0040",
    );
    return fail
      ? new Response("", { status: 503 })
      : Response.json({
          availability: normalizeSectionAvailability(payload()),
        });
  });
  assert.equal(store.merge(course).sections[0].enrollmentTotal, null);
  await store.read(query);
  assert.equal(store.merge(course).sections[0].enrollmentTotal, 44);
  assert.equal(store.merge(course).sections[0].availability.availableSeats, 26);
  fail = true;
  await assert.rejects(store.read(query));
  assert.equal(store.merge(course).sections[0].enrollmentTotal, 44);
  assert.equal(store.merge(course).sections[0].availabilityState, "error");
  assert.equal(calls, 2);
});

test("watch focus cancels queued background work without recording a false service failure", async () => {
  const store = createAvailabilityStore(async () =>
    Response.json({ availability: normalizeSectionAvailability(payload()) }),
  );
  const work = store.read(query, { priority: 10 });
  const rejected = assert.rejects(work, { name: "AbortError" });
  store.setFocus("other-course");
  await rejected;
  assert.equal(store.entryFor(section, course).state, "idle");
  store.setFocus(null);
  await store.read(query);
  assert.equal(store.entryFor(section, course).state, "ready");
});

test("large selections automatically lengthen the watch interval", () => {
  assert.equal(watchIntervalMs(10, 2), 10000);
  assert.equal(watchIntervalMs(10, 45), 45000);
  assert.equal(watchIntervalMs(30, 2), 30000);
});

test("a cancelled loader cannot overwrite a new queued read or a later successful response", async () => {
  let finishOld;
  let calls = 0;
  const store = createAvailabilityStore(async () => {
    calls++;
    if (calls === 1)
      return new Promise((resolve) => {
        finishOld = resolve;
      });
    return Response.json({
      availability: normalizeSectionAvailability(payload(45)),
    });
  });
  const abort = new AbortController();
  const old = store.read(query, { signal: abort.signal });
  const rejected = assert.rejects(old, { name: "AbortError" });
  while (!finishOld) await new Promise((resolve) => setTimeout(resolve, 1));
  abort.abort();
  await rejected;
  const newer = store.read(query);
  finishOld(
    Response.json({ availability: normalizeSectionAvailability(payload(44)) }),
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(store.entryFor(section, course).state, "queued");
  await newer;
  assert.equal(store.entryFor(section, course).state, "ready");
  assert.equal(store.merge(course).sections[0].enrollmentTotal, 45);
});

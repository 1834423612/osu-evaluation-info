import assert from "node:assert/strict";
import { test } from "node:test";
import {
  refreshSimulationAvailability,
  simulationAvailability,
  simulationAvailabilityLabel,
  simulationAvailabilityName,
} from "../../src/lib/planning/simulation-availability.ts";
import { course, section } from "../user-data/fixtures.mjs";

const live = (overrides = {}) => ({
  source: "official-availability",
  fetchedAt: "2026-11-23T12:00:00Z",
  isOpen: true,
  enrollmentStatus: "Open",
  enrollmentCapacity: 30,
  enrollmentTotal: 22,
  availableSeats: 8,
  waitlistCapacity: 10,
  waitlistTotal: 0,
  ...overrides,
});
const offering = (id, sections) => ({ ...course, courseId: id, sections });
const enrollmentSection = (id, overrides = {}) => ({
  ...section,
  classNumber: id,
  section: id,
  courseOfferingNumber: "1",
  availabilityState: "ready",
  availability: live(),
  ...overrides,
});

test("every run refreshes all section components and flexible courses with bounded concurrency", async () => {
  const courses = [
    offering("1111", [
      enrollmentSection("FIXED"),
      enrollmentSection("LAB", { component: "Laboratory" }),
    ]),
    offering("2222", [
      enrollmentSection("ASYNC", {
        instructionMode: "Distance Learning",
        meetings: [],
      }),
    ]),
    offering("3333", [enrollmentSection("OPTION")]),
  ];
  let active = 0,
    peak = 0;
  const reads = [];
  const read = async (query, { signal }) => {
    assert.equal(signal.aborted, false);
    reads.push(query);
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return live({
      isOpen: false,
      enrollmentStatus: "Closed",
      availableSeats: 0,
    });
  };
  const controller = new AbortController();
  const first = await refreshSimulationAvailability(
    courses,
    controller.signal,
    { read },
  );
  assert.equal(peak, 2);
  assert.deepEqual(reads.map((query) => query.classSection).sort(), [
    "ASYNC",
    "FIXED",
    "LAB",
    "OPTION",
  ]);
  assert.ok(
    reads.every(
      (query) =>
        query.termCode === "1268" && query.courseOfferingNumber === "1",
    ),
  );
  assert.ok(
    first
      .flatMap((c) => c.sections)
      .every((s) => simulationAvailability(s) === "full"),
  );
  assert.equal(
    courses[0].sections[0].availability.availableSeats,
    8,
    "source metadata is not mutated",
  );
  await refreshSimulationAvailability(first, controller.signal, { read });
  assert.equal(
    reads.length,
    8,
    "successful previous reads never skip the next simulation refresh",
  );
});

test("failed, invalid, and missing live reads discard cached availability", async () => {
  const courses = [
    offering("1111", [
      enrollmentSection("FAILED"),
      enrollmentSection("NOQUERY", { courseOfferingNumber: undefined }),
      enrollmentSection("INVALID"),
      enrollmentSection("WAIT"),
    ]),
  ];
  const refreshed = await refreshSimulationAvailability(
    courses,
    new AbortController().signal,
    {
      read: async (query) => {
        if (query.classSection === "FAILED") throw Error("Offline");
        if (query.classSection === "INVALID")
          return { ...live(), availableSeats: -1 };
        return live({
          isOpen: false,
          enrollmentStatus: "Wait List",
          availableSeats: 0,
          waitlistTotal: 3,
        });
      },
    },
  );
  for (const result of refreshed[0].sections.slice(0, 3)) {
    assert.equal(simulationAvailability(result), "unknown");
    assert.equal(result.availability, undefined);
    assert.equal(result.enrollmentStatus, "");
    assert.equal(result.enrollmentTotal, null);
    assert.equal(result.waitlistTotal, null);
  }
  const waitlist = refreshed[0].sections[3];
  assert.equal(simulationAvailability(waitlist), "waitlist");
  assert.equal(
    simulationAvailabilityLabel(waitlist, "en"),
    "Waitlist available · 0 seats · 3/10 (7 left)",
  );
  assert.equal(
    simulationAvailabilityLabel(waitlist, "zh"),
    "可候补 · 余位 0 · 3/10（余 7 位）",
  );
});

test("full seats, waitlisting, and unavailable counts have distinct truthful labels", () => {
  assert.equal(
    simulationAvailability(
      enrollmentSection("CACHED", { availabilityState: "error" }),
    ),
    "unknown",
  );
  assert.equal(
    simulationAvailabilityLabel(
      enrollmentSection("CACHED", { availabilityState: "error" }),
      "en",
    ),
    "Seats unknown",
  );
  assert.equal(
    simulationAvailability(
      enrollmentSection("ZERO", {
        availability: live({
          enrollmentStatus: "",
          isOpen: null,
          availableSeats: 0,
        }),
      }),
    ),
    "full",
  );
  assert.equal(
    simulationAvailabilityLabel(enrollmentSection("OPEN"), "en"),
    "Open · 8 seats · waitlist available 0/10 (10 left)",
  );
  assert.equal(
    simulationAvailabilityLabel(
      enrollmentSection("NOCONTS", {
        availability: live({
          isOpen: true,
          availableSeats: null,
          waitlistTotal: null,
          waitlistCapacity: null,
        }),
      }),
      "en",
    ),
    "Open · waitlist unknown",
  );
});

test("aborting a simulation stops queued section reads without publishing stale success", async () => {
  const controller = new AbortController();
  let reads = 0;
  const courses = [
    offering(
      "1111",
      Array.from({ length: 8 }, (_, index) => enrollmentSection(String(index))),
    ),
  ];
  await assert.rejects(
    refreshSimulationAvailability(courses, controller.signal, {
      read: async () => {
        reads++;
        controller.abort(new DOMException("Cancelled", "AbortError"));
        return live();
      },
    }),
    { name: "AbortError" },
  );
  assert.ok(reads <= 2);
});

test("waitlist labels distinguish available, exhausted, absent, and unreported places", () => {
  for (const [capacity, total, want, short] of [
    [0, 0, "no waitlist", "Full"],
    [10, 3, "3/10 (7 left)", "Waitlist available"],
    [10, 10, "10/10", "Waitlist full"],
    [10, 12, "12/10", "Waitlist full"],
    [10, null, "waitlist seats unknown ?/10", "Waitlist unknown"],
    [null, 3, "waitlist seats unknown 3/?", "Waitlist unknown"],
    [null, null, "0 seats", "Waitlist unknown"],
  ]) {
    const item = enrollmentSection("WAIT", {
      availability: live({
        isOpen: false,
        enrollmentStatus: "Wait List",
        availableSeats: 0,
        waitlistCapacity: capacity,
        waitlistTotal: total,
      }),
    });
    assert.equal(simulationAvailabilityName(item, "en"), short);
    assert.ok(simulationAvailabilityLabel(item, "en").endsWith(want));
  }
});

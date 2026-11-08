import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AVAILABILITY_TTL_MS,
  hasOfficialAvailability,
  isAvailabilityFresh,
  stripEnrollmentFields,
  withoutCourseAvailability,
} from "../../src/lib/catalog/availability.ts";
import { migrateSavedAvailability } from "../../src/lib/catalog/saved-storage.ts";
const now = Date.parse("2026-11-06T00:00:00Z");
function fixture() {
  return {
    id: "course",
    title: "Calculus",
    availability: {
      source: "official",
      fetchedAt: new Date(now).toISOString(),
    },
    sections: [
      {
        id: "section",
        classNumber: "1",
        enrollmentStatus: "Open",
        enrollmentTotal: 29,
        waitlistTotal: 4,
      },
    ],
  };
}

describe("live-only enrollment availability", () => {
  it("retains a successful one-time read after its watch freshness window", () => {
    const course = fixture();
    assert.equal(hasOfficialAvailability(course), true);
    assert.equal(isAvailabilityFresh(course, now + 60 * 60 * 1000), false);
    assert.equal(hasOfficialAvailability(course), true);
    assert.equal(
      hasOfficialAvailability(withoutCourseAvailability(course)),
      false,
    );
    for (const fetchedAt of [null, "", "invalid"]) {
      assert.equal(
        hasOfficialAvailability({
          ...course,
          availability: { source: "official", fetchedAt },
        }),
        false,
      );
    }
  });
  it("expires official values and rejects snapshots, invalid timestamps, and clock skew", () => {
    const course = fixture();
    assert.equal(
      isAvailabilityFresh(course, now + AVAILABILITY_TTL_MS - 1),
      true,
    );
    assert.equal(isAvailabilityFresh(course, now + AVAILABILITY_TTL_MS), false);
    assert.equal(
      isAvailabilityFresh(withoutCourseAvailability(course), now),
      false,
    );
    assert.equal(
      isAvailabilityFresh(
        {
          ...course,
          availability: { source: "official", fetchedAt: "invalid" },
        },
        now,
      ),
      false,
    );
    assert.equal(isAvailabilityFresh(course, now - 6000), false);
  });
  it("removes enrollment from archived JSON without mutating live input", () => {
    const data = {
      classNumber: "1",
      meetings: [],
      enrollmentStatus: "Open",
      enrollmentTotal: 2,
      waitlistTotal: 1,
      enrollmentCapacity: 30,
      seatsAvailable: 28,
    };
    assert.deepEqual(stripEnrollmentFields(data), {
      classNumber: "1",
      meetings: [],
    });
    assert.equal(data.enrollmentTotal, 2);
  });
  it("scrubs legacy favorites idempotently without losing saved courses or sections", () => {
    const values = new Map([
      ["course-atlas:saved:v1", JSON.stringify([fixture()])],
      [
        "course-atlas:saved-sections:v1",
        JSON.stringify([{ id: "saved", section: fixture().sections[0] }]),
      ],
    ]);
    let writes = 0;
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        writes++;
        values.set(key, value);
      },
    };
    migrateSavedAvailability(storage);
    const course = JSON.parse(values.get("course-atlas:saved:v1"))[0];
    assert.equal(course.id, "course");
    assert.equal(course.sections[0].enrollmentTotal, null);
    assert.equal(course.sections[0].enrollmentStatus, "");
    assert.equal(course.availability.source, "unavailable");
    assert.equal(
      JSON.parse(values.get("course-atlas:saved-sections:v1"))[0].section
        .waitlistTotal,
      null,
    );
    migrateSavedAvailability(storage);
    assert.equal(writes, 2);
  });
});

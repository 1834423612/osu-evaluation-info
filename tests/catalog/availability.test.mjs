import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasOfficialAvailability,
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
        availability: {
          source: "official-availability",
          fetchedAt: new Date(now).toISOString(),
          isOpen: true,
          enrollmentStatus: "Open",
          enrollmentCapacity: 30,
          enrollmentTotal: 29,
          availableSeats: 1,
          waitlistCapacity: 10,
          waitlistTotal: 4,
        },
      },
    ],
  };
}

describe("live-only enrollment availability", () => {
  it("retains a successful one-time read without an automatic expiration clock", () => {
    const course = fixture();
    assert.equal(
      hasOfficialAvailability({
        ...course,
        sections: [{ ...course.sections[0], availability: undefined }],
      }),
      false,
    );
    assert.equal(hasOfficialAvailability(course), true);
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

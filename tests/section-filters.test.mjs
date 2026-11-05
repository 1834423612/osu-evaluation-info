import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  componentKind,
  getSectionFilterOptions,
  sectionMatchesFilters,
} from "../src/lib/catalog/section-filters.ts";

function section(overrides = {}) {
  return {
    id: "1272:10001",
    classNumber: "10001",
    section: "0010",
    component: "Lecture",
    instructionMode: "In Person",
    enrollmentStatus: "Open",
    enrollmentTotal: 25,
    waitlistTotal: 0,
    session: "Regular Academic Session",
    sessionCode: "1",
    instructors: [],
    meetings: [meeting()],
    ...overrides,
  };
}

function meeting(overrides = {}) {
  return {
    days: [0, 2, 4],
    startTime: "09:00",
    endTime: "09:55",
    startDate: null,
    endDate: null,
    location: null,
    ...overrides,
  };
}

function filters(overrides = {}) {
  return {
    components: new Set(),
    instructionModes: new Set(),
    days: new Set(),
    excludeEarly: false,
    excludeLate: false,
    excludeWeekends: false,
    ...overrides,
  };
}

describe("section filter choices", () => {
  it("normalizes official component names and legacy abbreviations", () => {
    assert.equal(componentKind("Lecture"), "Lecture");
    assert.equal(componentKind("LEC"), "Lecture");
    assert.equal(componentKind("Laboratory"), "Lab");
    assert.equal(componentKind("LAB"), "Lab");
    assert.equal(componentKind("Recitation"), "Recitation");
    assert.equal(componentKind("REC"), "Recitation");
    assert.equal(componentKind("Seminar"), null);
  });

  it("offers only components, modes, days, and exclusions present in loaded sections", () => {
    const choices = getSectionFilterOptions([
      section(),
      section({
        component: "Laboratory",
        instructionMode: "Distance Enhanced",
        meetings: [
          meeting({ days: [5], startTime: "08:30", endTime: "19:00" }),
        ],
      }),
    ]);
    assert.deepEqual(choices.components, ["Lecture", "Lab"]);
    assert.deepEqual(choices.instructionModes, [
      "Distance Enhanced",
      "In Person",
    ]);
    assert.deepEqual(choices.days, [0, 2, 4, 5]);
    assert.equal(choices.hasEarlyMeetings, true);
    assert.equal(choices.hasLateMeetings, true);
    assert.equal(choices.hasWeekendMeetings, true);
    assert.deepEqual(getSectionFilterOptions([]), {
      components: [],
      instructionModes: [],
      days: [],
      hasEarlyMeetings: false,
      hasLateMeetings: false,
      hasWeekendMeetings: false,
    });
  });
});

describe("section row matching", () => {
  it("uses OR within one choice group and AND across groups", () => {
    const selected = filters({
      components: new Set(["Lecture", "Lab"]),
      instructionModes: new Set(["In Person"]),
      days: new Set([1, 2]),
    });
    assert.equal(sectionMatchesFilters(section(), selected), true);
    assert.equal(
      sectionMatchesFilters(section({ component: "Laboratory" }), selected),
      true,
    );
    assert.equal(
      sectionMatchesFilters(section({ component: "Recitation" }), selected),
      false,
    );
    assert.equal(
      sectionMatchesFilters(
        section({ instructionMode: "Distance Learning" }),
        selected,
      ),
      false,
    );
    assert.equal(
      sectionMatchesFilters(
        section({ meetings: [meeting({ days: [0, 4] })] }),
        selected,
      ),
      false,
    );
  });

  it("evaluates every meeting and keeps the 9 AM and 6 PM boundaries inclusive", () => {
    const selected = filters({
      excludeEarly: true,
      excludeLate: true,
      excludeWeekends: true,
    });
    assert.equal(
      sectionMatchesFilters(
        section({
          meetings: [meeting({ startTime: "09:00", endTime: "18:00" })],
        }),
        selected,
      ),
      true,
    );
    assert.equal(
      sectionMatchesFilters(
        section({ meetings: [meeting(), meeting({ startTime: "08:59" })] }),
        selected,
      ),
      false,
    );
    assert.equal(
      sectionMatchesFilters(
        section({ meetings: [meeting(), meeting({ endTime: "18:01" })] }),
        selected,
      ),
      false,
    );
    assert.equal(
      sectionMatchesFilters(
        section({ meetings: [meeting(), meeting({ days: [6] })] }),
        selected,
      ),
      false,
    );
    assert.equal(
      sectionMatchesFilters(
        section({
          meetings: [meeting({ startTime: "8:30 AM", endTime: "9:25 AM" })],
        }),
        selected,
      ),
      false,
    );
    assert.equal(
      sectionMatchesFilters(
        section({
          meetings: [meeting({ startTime: "5:00 PM", endTime: "7:00 PM" })],
        }),
        selected,
      ),
      false,
    );
    assert.equal(
      sectionMatchesFilters(
        section({ meetings: [meeting({ startTime: "19:00", endTime: null })] }),
        selected,
      ),
      false,
    );
  });

  it("does not invent a time for unscheduled sections", () => {
    const unscheduled = section({ meetings: [] });
    assert.equal(
      sectionMatchesFilters(
        unscheduled,
        filters({
          excludeEarly: true,
          excludeLate: true,
          excludeWeekends: true,
        }),
      ),
      true,
    );
    assert.equal(
      sectionMatchesFilters(unscheduled, filters({ days: new Set([0]) })),
      false,
    );
    assert.equal(
      sectionMatchesFilters(
        section({ meetings: [meeting({ startTime: null, endTime: null })] }),
        filters({ excludeEarly: true, excludeLate: true }),
      ),
      true,
    );
  });
});

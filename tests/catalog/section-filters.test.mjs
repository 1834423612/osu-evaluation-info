import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  componentKind,
  getSectionFilterOptions,
  rankSectionsForFilters,
  sectionMatchesFilters,
} from "../../src/lib/catalog/section-filters.ts";

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
    earlyCutoffMinute: 9 * 60,
    lateCutoffMinute: 18 * 60,
    ...overrides,
  };
}

describe("section filter choices", () => {
  it("keeps source component names and abbreviations intact", () => {
    assert.equal(componentKind("Lecture"), "Lecture");
    assert.equal(componentKind("LEC"), "LEC");
    assert.equal(componentKind("Laboratory"), "Laboratory");
    assert.equal(componentKind("LAB"), "LAB");
    assert.equal(componentKind("Recitation"), "Recitation");
    assert.equal(componentKind("REC"), "REC");
    assert.equal(componentKind("Seminar"), "Seminar");
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
      section({ component: "Seminar" }),
    ]);
    assert.deepEqual(choices.components, ["Laboratory", "Lecture", "Seminar"]);
    assert.deepEqual(choices.instructionModes, [
      "Distance Enhanced",
      "In Person",
    ]);
    assert.deepEqual(choices.days, [0, 2, 4, 5]);
    assert.equal(choices.hasEarlyMeetings, true);
    assert.equal(choices.hasLateMeetings, true);
    assert.equal(choices.hasWeekendMeetings, true);
    assert.equal(choices.hasTimedMeetings, true);
    assert.deepEqual(getSectionFilterOptions([]), {
      components: [],
      instructionModes: [],
      days: [],
      hasEarlyMeetings: false,
      hasLateMeetings: false,
      hasWeekendMeetings: false,
      hasTimedMeetings: false,
    });
  });
});

describe("section row matching", () => {
  it("moves all matching sections first without removing or mutating rows", () => {
    const rows = [
      section({ id: "rec", component: "Recitation" }),
      section({ id: "lec-1" }),
      section({ id: "lab", component: "Laboratory" }),
      section({ id: "lec-2" }),
    ];
    const ranked = rankSectionsForFilters(
      rows,
      filters({ components: new Set(["Lecture"]) }),
    );
    assert.deepEqual(
      ranked.map(({ section }) => section.id),
      ["lec-1", "lec-2", "rec", "lab"],
    );
    assert.deepEqual(
      ranked.map(({ matches }) => matches),
      [true, true, false, false],
    );
    assert.deepEqual(
      rows.map(({ id }) => id),
      ["rec", "lec-1", "lab", "lec-2"],
    );
  });

  it("places inactive sections after active sections in each matching group", () => {
    const ranked = rankSectionsForFilters(
      [
        section({ id: "inactive-match", enrollmentStatus: "Inactive" }),
        section({
          id: "cancelled-other",
          enrollmentStatus: "Cancelled",
          component: "Recitation",
        }),
        section({ id: "active-other", component: "Recitation" }),
        section({ id: "active-match" }),
      ],
      filters({ components: new Set(["Lecture"]) }),
    );
    assert.deepEqual(
      ranked.map(({ section }) => section.id),
      ["active-match", "inactive-match", "active-other", "cancelled-other"],
    );
    assert.deepEqual(
      rankSectionsForFilters(
        [
          section({ id: "inactive", enrollmentStatus: "Inactive" }),
          section({ id: "active" }),
        ],
        filters(),
      ).map(({ section }) => section.id),
      ["active", "inactive"],
    );
  });

  it("uses OR within one choice group and AND across groups", () => {
    const selected = filters({
      components: new Set(["Lecture", "Laboratory"]),
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

  it("matches exact source component labels instead of normalizing abbreviations", () => {
    const selected = filters({ components: new Set(["Lecture"]) });
    assert.equal(
      sectionMatchesFilters(section({ component: "Lecture" }), selected),
      true,
    );
    assert.equal(
      sectionMatchesFilters(section({ component: "LEC" }), selected),
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

  it("supports custom 15-minute time cutoffs with inclusive boundaries", () => {
    assert.equal(
      sectionMatchesFilters(
        section({ meetings: [meeting({ startTime: "09:00" })] }),
        filters({ excludeEarly: true, earlyCutoffMinute: 9 * 60 + 15 }),
      ),
      false,
    );
    assert.equal(
      sectionMatchesFilters(
        section({ meetings: [meeting({ startTime: "09:15" })] }),
        filters({ excludeEarly: true, earlyCutoffMinute: 9 * 60 + 15 }),
      ),
      true,
    );
    assert.equal(
      sectionMatchesFilters(
        section({
          meetings: [meeting({ startTime: "17:45", endTime: "18:15" })],
        }),
        filters({ excludeLate: true, lateCutoffMinute: 18 * 60 + 15 }),
      ),
      true,
    );
    assert.equal(
      sectionMatchesFilters(
        section({
          meetings: [meeting({ startTime: "18:15", endTime: "19:00" })],
        }),
        filters({ excludeLate: true, lateCutoffMinute: 18 * 60 + 15 }),
      ),
      false,
    );
  });
});

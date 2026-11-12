import test from "node:test";
import assert from "node:assert/strict";
import {
  syllabusChoices,
  DEFAULT_SYLLABUS_FILTERS,
} from "../../src/lib/syllabus/choices.ts";
const section = (id, emails) => ({
  classNumber: id,
  instructors: emails.map((name) => ({ name, email: `${name}@osu.edu` })),
});
const sections = [
  section("1", ["one.1", "two.2"]),
  section("2", ["three.3"]),
  section("3", []),
];
const items = sections
  .slice(0, 2)
  .map((section) => ({ section, entry: { code: section.classNumber } }));
const data = {
  "one.1": {
    rmp: { quality: 5 },
    SEI: { score: 2 },
    roles: [{ category: "professor" }],
  },
  "two.2": { rmp: { quality: null } },
  "three.3": {
    rmp: { quality: 3 },
    SEI: { score: 4 },
    roles: [{ category: "teaching-assistant" }],
  },
};

test("default order is stable; unavailable syllabi remain after available sections", () => {
  assert.deepEqual(
    syllabusChoices(
      items,
      sections,
      data,
      new Set(),
      DEFAULT_SYLLABUS_FILTERS,
    ).map((row) => row.section.classNumber),
    ["1", "2", "3"],
  );
  assert.deepEqual(
    syllabusChoices(
      items,
      sections,
      data,
      new Set(["1"]),
      DEFAULT_SYLLABUS_FILTERS,
    ).map((row) => row.section.classNumber),
    ["2", "1", "3"],
  );
});
test("staff/score nonmatches remain visible below, while scores never mix sources or invent zeroes", () => {
  const result = syllabusChoices(items, sections, data, new Set(), {
    ...DEFAULT_SYLLABUS_FILTERS,
    role: "assistant",
  });
  assert.equal(result[0].section.classNumber, "2");
  assert.equal(result.length, 3);
  const descending = syllabusChoices(items, sections, data, new Set(), {
    ...DEFAULT_SYLLABUS_FILTERS,
    source: "SEI",
    sort: "desc",
  });
  assert.equal(descending[0].section.classNumber, "2");
  const rating = syllabusChoices(items, sections, data, new Set(), {
    ...DEFAULT_SYLLABUS_FILTERS,
    minimum: 4,
  });
  assert.equal(rating[0].score, 5);
  assert.equal(rating[1].matches, false);
  assert.equal(rating[2].score, null);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildCatalogCorpus,
  hydrateSearchPage,
  loadCatalogCorpus,
} from "../../src/lib/search/catalog-source.ts";
import { searchCorpus } from "../../src/lib/search/results.ts";
import { sectionAvailabilityQuery } from "../../src/lib/catalog/section-availability.ts";

const snapshot = {
  run: "12345678-1234-1234-1234-123456789012",
  term: "1272",
  snapshotAt: "2026-11-12T00:00:00Z",
  terms: [{ code: "1272", label: "Spring 2027" }],
};
function wire(value) {
  const bytes = Buffer.from(JSON.stringify(value));
  return {
    data: bytes.toString("base64"),
    digest: createHash("sha256").update(bytes).digest("hex"),
  };
}
function rows(count = 1) {
  const courses = [],
    sections = [];
  for (let i = 0; i < count; i++) {
    const identity = {
      subject: "EXAMPLE",
      catalog_number: String(2200 + i),
      campus_code: "COL",
    };
    courses.push({
      ...identity,
      data: {
        subject: "EXAMPLE",
        subjectDesc: "Experimental Sciences",
        catalogNumber: identity.catalog_number,
        campusCode: "COL",
        courseId: String(100 + i),
        offeringNumber: "1",
        title: "Laboratory Methods",
        description: "Research methods for experimental science.",
        academicCareer: "Undergraduate",
      },
    });
    for (const [mode, component, number] of [
      ["In Person", "Lecture", 1],
      ["Distance Learning", "Laboratory", 2],
    ])
      sections.push({
        ...identity,
        data: {
          classNumber: `${i}${number}`,
          section: `${i}${number}`,
          sessionCode: "1",
          termCode: "1272",
          courseId: String(100 + i),
          courseOfferingNumber: 1,
          career: "UGRD",
          mode,
          instructionMode: mode,
          component,
          attributes: [],
          meetings: [],
        },
      });
  }
  return { courses, sections };
}
test("all selected facets must match the same section, and seats retain exact offering identifiers", () => {
  const source = rows(),
    corpus = buildCatalogCorpus(source.courses, source.sections, snapshot);
  const result = searchCorpus(corpus, {
    q: "laboratry methods",
    filters: { component: "lab", "instruction-mode": "dl" },
  });
  assert.equal(result.courses.length, 1);
  assert.equal(result.courses[0].sections.length, 1);
  assert(
    result.filters.some(
      (facet) => facet.slug === "subject" && facet.items[0].value === "example",
    ),
  );
  assert(
    result.filters.some(
      (facet) =>
        facet.slug === "instruction-mode" &&
        facet.items.some((item) => item.value === "dl"),
    ),
  );
  assert.equal(
    sectionAvailabilityQuery(result.courses[0].sections[0], result.courses[0])
      .courseOfferingNumber,
    "1",
  );
  assert.equal(
    searchCorpus(corpus, {
      q: "laboratory",
      filters: { component: "lec", "instruction-mode": "dl" },
    }).totalCourses,
    0,
  );
  assert.throws(
    () =>
      searchCorpus(corpus, {
        q: "laboratory",
        filters: { evening: "Evening" },
      }),
    /Unsupported/,
  );
});
test("pagination pins query, filters and generation; ranking never mutates the source corpus", () => {
  const source = rows(30),
    corpus = buildCatalogCorpus(source.courses, source.sections, snapshot);
  const input = { q: "laboratory methods", term: "1272", limit: 12 };
  const first = searchCorpus(corpus, input),
    second = searchCorpus(corpus, { ...input, cursor: first.nextCursor });
  assert.equal(first.totalCourses, 30);
  assert.equal(first.totalItems, 60);
  assert.equal(
    new Set([...first.courses, ...second.courses].map((course) => course.id))
      .size,
    24,
  );
  assert.throws(
    () =>
      searchCorpus(corpus, {
        ...input,
        q: "changed",
        cursor: first.nextCursor,
      }),
    /query/,
  );
  assert.throws(
    () =>
      searchCorpus(corpus, {
        ...input,
        campus: "all",
        cursor: first.nextCursor,
      }),
    /query/,
  );
  assert.equal(corpus.courses.values().next().value.searchMatch, undefined);
});
test("bulk decoding fails closed and visible timetable hydration leaves the index untouched", async () => {
  const source = rows();
  const reader = {
    query: async (sql) => ({
      rows: (sql.includes("course_snapshots")
        ? source.courses
        : source.sections
      ).map((row) => ({ ...row, ...wire(row.data) })),
    }),
  };
  const corpus = await loadCatalogCorpus(reader, snapshot);
  const result = searchCorpus(corpus, { q: "laboratory methods" });
  await hydrateSearchPage(
    {
      query: async () => ({
        rows: source.sections.map((row) => ({
          class_number: row.data.classNumber,
          ...wire({
            ...row.data,
            meetings: [
              {
                monday: true,
                startTime: "10:00 AM",
                endTime: "11:00 AM",
                instructors: [],
              },
            ],
          }),
        })),
      }),
    },
    corpus,
    result,
  );
  assert.deepEqual(result.courses[0].sections[0].meetings[0].days, [0]);
  assert.equal(
    corpus.courses.values().next().value.sections[0].meetings.length,
    0,
  );
  await assert.rejects(
    loadCatalogCorpus(
      {
        query: async () => ({ rows: [{ ...source.courses[0], ...wire([]) }] }),
      },
      snapshot,
    ),
    /Invalid published/,
  );
  await assert.rejects(
    loadCatalogCorpus(
      {
        query: async () => ({
          rows: [
            {
              ...source.courses[0],
              ...wire(source.courses[0].data),
              digest: "0".repeat(64),
            },
          ],
        }),
      },
      snapshot,
    ),
    /integrity/,
  );
});

test("field filters are applied before pagination and inspect full prerequisite text", () => {
  const source = rows(30);
  for (const [i, row] of source.courses.entries())
    row.data.description =
      i % 2
        ? "Prereq: MATH 1151.01. Not open to students with credit for MATH 1151.02."
        : "Discusses MATH 1151.01. Prereq: MATH 1151.02.";
  const corpus = buildCatalogCorpus(source.courses, source.sections, snapshot);
  const first = searchCorpus(corpus, { q: 'prereq:"MATH 1151.01"', limit: 12 });
  assert.equal(first.totalCourses, 15);
  assert.equal(first.courses.length, 12);
  assert.ok(first.nextCursor);
  const next = searchCorpus(corpus, {
    q: 'prereq:"MATH 1151.01"',
    limit: 12,
    cursor: first.nextCursor,
  });
  assert.equal(next.courses.length, 3);
  assert.equal(
    new Set([...first.courses, ...next.courses].map((c) => c.id)).size,
    15,
  );
});
test("base course recommendation resolves every decimal variant in the selected campus", () => {
  const source = rows(8);
  for (const [i, row] of source.courses.entries()) {
    row.catalog_number = `2200.${String(i + 1).padStart(2, "0")}`;
    row.data.catalogNumber = row.catalog_number;
  }
  for (const row of source.sections)
    row.catalog_number =
      source.courses[Number(row.data.classNumber.slice(0, -1))].catalog_number;
  const corpus = buildCatalogCorpus(source.courses, source.sections, snapshot);
  const result = searchCorpus(corpus, { q: "EXAMPLE 2200", limit: 24 });
  assert.equal(result.totalCourses, 8);
  assert.ok(result.courses.every((c) => c.catalogNumber.startsWith("2200.")));
  assert.equal(
    searchCorpus(corpus, { q: "EXAMPLE 2200.02" }).courses[0].catalogNumber,
    "2200.02",
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { describe, it } from "node:test";

// Exercise the server adapter with controlled upstream responses, without Next's
// server-only marker or a live network/database dependency.
const source = await readFile(
  new URL("../../src/lib/catalog/official.ts", import.meta.url),
  "utf8",
);
const adapterSource = source
  .replace('import "server-only";', "")
  .replace(
    '"./exact-search"',
    JSON.stringify(
      new URL("../../src/lib/catalog/exact-search.ts", import.meta.url).href,
    ),
  )
  .replace(
    '"./fees"',
    JSON.stringify(
      new URL("../../src/lib/catalog/fees.ts", import.meta.url).href,
    ),
  );
const { searchOfficialCatalog, getOfficialCourse, normalizeOfficialCourse } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(stripTypeScriptTypes(adapterSource)).toString("base64")
  );

function course(catalogNumber, campusCode, classNumber, component = "Lecture") {
  return {
    course: {
      subject: "MATH",
      catalogNumber,
      campusCode,
      campus: campusCode,
      minUnits: 5,
      maxUnits: 5,
    },
    sections: [{ classNumber, termCode: "1272", component, meetings: [] }],
  };
}

describe("exact course upstream reconciliation", () => {
  it("normalizes campus casing in detail requests", async () => {
    const originalFetch = globalThis.fetch;
    const campuses = [];
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("searchableTermsV2"))
        return Response.json({
          data: {
            data: [{ classSearch: "Y", strm: "1272", descr: "Spring 2027" }],
          },
        });
      campuses.push(parsed.searchParams.get("campus"));
      return Response.json({
        data: {
          totalPages: 1,
          totalItems: 1,
          courses: [course("1151", "COL", "2")],
        },
      });
    };
    try {
      const result = await getOfficialCourse({
        subject: "MATH",
        catalog: "1151",
        term: "1272",
        campus: "COL",
      });
      assert.equal(result.course.catalogNumber, "1151");
      assert.deepEqual(campuses, ["col"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps filters, rejects approximate numbers, merges pages, and separates campuses", async () => {
    const originalFetch = globalThis.fetch;
    const searches = [];
    globalThis.fetch = async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith("searchableTermsV2"))
        return Response.json({
          data: {
            data: [{ classSearch: "Y", strm: "1272", descr: "Spring 2027" }],
          },
        });
      searches.push(parsed.searchParams);
      const page = parsed.searchParams.get("p");
      return Response.json({
        data: {
          totalPages: 2,
          totalItems: 5,
          courses:
            page === "1"
              ? [
                  course("1140", "COL", "1"),
                  course("1151", "COL", "2"),
                  course("1151", "NWK", "3"),
                ]
              : [course("1151H", "COL", "4"), course("1151", "COL", "5")],
        },
      });
    };
    try {
      const result = await searchOfficialCatalog({
        q: "math1151",
        term: "1272",
        campus: "all",
        filters: { component: "lec" },
      });
      assert.equal(result.totalCourses, 2);
      assert.equal(result.matchedSections, 3);
      assert.deepEqual(
        result.courses.map((entry) => [
          entry.catalogNumber,
          entry.campusCode,
          entry.sections.length,
        ]),
        [
          ["1151", "COL", 2],
          ["1151", "NWK", 1],
        ],
      );
      assert.ok(searches.every((params) => params.get("component") === "lec"));
      assert.ok(searches.every((params) => !params.has("campus")));
      assert.ok(result.courses.every((entry) => !entry.sectionsPartial));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns no course for conflicting explicit subject and course code", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      Response.json({
        data: {
          data: [{ classSearch: "Y", strm: "1272", descr: "Spring 2027" }],
        },
      });
    try {
      const result = await searchOfficialCatalog({
        q: "MATH 1151",
        subject: "CHEM",
      });
      assert.deepEqual(result.courses, []);
      assert.equal(result.totalCourses, 0);
      assert.equal(result.matchedSections, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("official availability provenance", () => {
  it("never presents search placeholders as verified seat counts", () => {
    const entry = course("2200", "COL", "1");
    entry.course.courseId = "151332";
    entry.course.enrollmentTotal = 999;
    entry.sections = [21, 37, 0].map((enrollmentTotal, index) => ({
      ...entry.sections[0],
      classNumber: String(index + 1),
      section: `00${index}0`,
      enrollmentTotal,
      waitlistTotal: index,
      courseId: "151332",
      courseOfferingNumber: 1,
      sessionCode: "1",
    }));
    const normalized = normalizeOfficialCourse(entry, "1272", {
      source: "official",
      fetchedAt: new Date().toISOString(),
    });
    assert.deepEqual(
      normalized.sections.map((s) => s.enrollmentTotal),
      [null, null, null],
    );
    assert.deepEqual(
      normalized.sections.map((s) => s.enrollmentStatus),
      ["", "", ""],
    );
    assert.equal(normalized.availability.source, "unavailable");
    assert.equal(normalized.courseId, "151332");
    assert.equal(normalized.sections[0].courseOfferingNumber, "1");
    assert.equal(normalized.sections[0].section, "0000");
  });
  it("never exposes archived enrollment through the default normalizer", () => {
    const entry = course("1151", "COL", "1");
    Object.assign(entry.sections[0], {
      enrollmentStatus: "Open",
      enrollmentTotal: 25,
      waitlistTotal: 2,
    });
    const snapshot = normalizeOfficialCourse(entry, "1272");
    assert.equal(snapshot.availability.source, "unavailable");
    assert.equal(snapshot.sections[0].enrollmentStatus, "");
    assert.equal(snapshot.sections[0].enrollmentTotal, null);
    assert.equal(snapshot.sections[0].waitlistTotal, null);
  });
  it("fetches official enrollment again on every completed request", async () => {
    const originalFetch = globalThis.fetch;
    let searches = 0;
    globalThis.fetch = async (url, options) => {
      assert.equal(options.cache, "no-store");
      if (new URL(url).pathname.endsWith("searchableTermsV2"))
        return Response.json({
          data: {
            data: [{ classSearch: "Y", strm: "1272", descr: "Spring 2027" }],
          },
        });
      const entry = course("1151", "COL", "1");
      Object.assign(entry.sections[0], {
        enrollmentStatus: ++searches === 1 ? "Open" : "Closed",
        enrollmentTotal: searches,
        waitlistTotal: 0,
      });
      return Response.json({
        data: { totalPages: 1, totalItems: 1, courses: [entry] },
      });
    };
    try {
      const input = { subject: "MATH", catalog: "1151", term: "1272" };
      assert.equal(
        (await getOfficialCourse(input)).course.sections[0].enrollmentStatus,
        "",
      );
      const next = await getOfficialCourse(input);
      assert.equal(next.course.sections[0].enrollmentStatus, "");
      assert.equal(next.course.availability.source, "unavailable");
      assert.equal(next.course.availability.fetchedAt, null);
      assert.equal(searches, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

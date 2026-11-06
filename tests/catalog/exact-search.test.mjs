import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExactCourseQuery } from "../../src/lib/catalog/exact-search.ts";

describe("exact course code parsing", () => {
  it("recognizes spaced and compact subject/catalog forms", () => {
    for (const query of ["MATH 1151", "MATH1151", " math   1151 "]) {
      assert.deepEqual(parseExactCourseQuery(query), {
        subject: "MATH",
        catalogNumber: "1151",
      });
    }
  });

  it("uses a selected subject only with a complete catalog number", () => {
    assert.deepEqual(parseExactCourseQuery("1151", "math"), {
      subject: "MATH",
      catalogNumber: "1151",
    });
    assert.equal(parseExactCourseQuery("11", "math"), null);
    assert.equal(parseExactCourseQuery("math 1151", "BIOL"), null);
  });

  it("retains decimal and suffix course identifiers without widening them", () => {
    assert.deepEqual(parseExactCourseQuery("CSE 2231H"), {
      subject: "CSE",
      catalogNumber: "2231H",
    });
    assert.deepEqual(parseExactCourseQuery("MATH 1075.01"), {
      subject: "MATH",
      catalogNumber: "1075.01",
    });
    assert.equal(parseExactCourseQuery("MATH 11"), null);
  });
});

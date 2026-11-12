import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCourseSearch } from "../../src/lib/analytics.ts";

describe("Umami course search labels", () => {
  it("recognizes long subject names, separators and incomplete numbers consistently", () => {
    assert.deepEqual(normalizeCourseSearch("PHILOSOPHY 2465"), {
      searchTerm: "PHILOSOPHY 2465",
      searchType: "course_code",
    });
    assert.equal(normalizeCourseSearch("cse 22").searchType, "course_code");
    assert.equal(normalizeCourseSearch("math-1151").searchTerm, "MATH 1151");
  });
  it("normalizes spaced and compact course codes to one label", () => {
    assert.deepEqual(normalizeCourseSearch(" math1151 "), {
      searchTerm: "MATH 1151",
      searchType: "course_code",
    });
    assert.deepEqual(normalizeCourseSearch("cse 2221a"), {
      searchTerm: "CSE 2221A",
      searchType: "course_code",
    });
  });

  it("keeps decimal course identifiers canonical", () => {
    assert.deepEqual(normalizeCourseSearch("math 1151.01"), {
      searchTerm: "MATH 1151.01",
      searchType: "course_code",
    });
  });

  it("normalizes keyword spacing and casing without changing the meaning", () => {
    assert.deepEqual(normalizeCourseSearch("  ＣＡＬＣＵＬＵＳ   I "), {
      searchTerm: "calculus i",
      searchType: "keyword",
    });
  });

  it("omits empty searches and bounds event property length", () => {
    assert.equal(normalizeCourseSearch("   "), null);
    assert.equal(normalizeCourseSearch("x".repeat(120))?.searchTerm.length, 80);
  });
});

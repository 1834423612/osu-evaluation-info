import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requirementSearch,
  courseFamilyQueries,
} from "../../src/lib/planning/requirement-search.ts";
test("requirement search selects exact GEN facets without guessing combined constraints", () => {
  assert.equal(
    requirementSearch("Placeholder: Historical and Cultural Studies"),
    "GEN Foundation: Historical and Cultural Studies",
  );
  assert.equal(requirementSearch("Natural Science and Math courses"), null);
  assert.equal(
    requirementSearch("GE Launch Seminar"),
    "GEN Bookend: Launch Seminar",
  );
});
test("course families only use catalog-supplied variants of the exact requested number", () => {
  assert.deepEqual(
    courseFamilyQueries("ECON 2001", [
      { query: "ECON 2001.01" },
      { query: "ECON 2002.01" },
      { query: "ECON 2001.01" },
      { query: "MATH 2001.01" },
    ]),
    ["ECON 2001.01"],
  );
  assert.deepEqual(
    courseFamilyQueries("ECON 2001.01", [{ query: "ECON 2001.03H" }]),
    [],
  );
});

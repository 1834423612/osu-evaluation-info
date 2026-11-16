import { test } from "node:test";
import assert from "node:assert/strict";
import { activeCatalogFilters } from "../../src/lib/catalog/active-filters.ts";
test("effective campus selection is visible before any URL filters exist", () => {
  const params = new URLSearchParams();
  assert.deepEqual(activeCatalogFilters(params), [["campus", "col"]]);
  assert.equal(params.toString(), "");
});
test("all-campus selection clears the campus filter while metadata stays out of the count", () => {
  assert.deepEqual(
    activeCatalogFilters(
      new URLSearchParams(
        "campus=all&q=test&term=1272&course=x&detailTab=syllabus&sort=relevance&via=x",
      ),
    ),
    [],
  );
});
test("selected campuses and actual facets are counted once with their effective values", () => {
  assert.deepEqual(
    activeCatalogFilters(
      new URLSearchParams(
        "campus=nwk&subject=math&instruction-mode=dl&subject=math&evening=",
      ),
    ),
    [
      ["campus", "nwk"],
      ["subject", "math"],
      ["instruction-mode", "dl"],
    ],
  );
});

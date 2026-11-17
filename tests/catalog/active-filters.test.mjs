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

import {
  catalogPreferences,
  restoreCatalogPreferences,
} from "../../src/lib/catalog/filter-preferences.ts";
test("catalog preferences restore campus before a new query, preserve explicit URLs and honor reset", () => {
  const raw = JSON.stringify({
    campus: "mns",
    subject: "CSE",
    q: "private",
    cursor: "old",
  });
  const restored = restoreCatalogPreferences("q=MATH+1131", raw);
  assert.equal(restored.get("campus"), "mns");
  assert.equal(restored.get("q"), "MATH 1131");
  assert.equal(restored.has("cursor"), false);
  assert.equal(
    restoreCatalogPreferences("campus=nwk", raw).get("campus"),
    "nwk",
  );
  assert.equal(
    restoreCatalogPreferences("filters=1&campus=col", raw).has("subject"),
    false,
  );
  assert.deepEqual(catalogPreferences(restored), {
    campus: "mns",
    subject: "CSE",
  });
  assert.equal(restoreCatalogPreferences("q=test", "bad").get("q"), "test");
});

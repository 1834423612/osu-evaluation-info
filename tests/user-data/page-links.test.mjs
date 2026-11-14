import assert from "node:assert/strict";
import { test } from "node:test";
import {
  pageShareHref,
  courseShareHref,
} from "../../src/lib/saved/page-link.ts";
import { snapshot } from "./fixtures.mjs";
test("public page links remove secrets, foreign origins, paging and private workspace routes", () => {
  for (const value of [
    "https://foreign.test/",
    "//foreign.test/",
    "/\\foreign.test/",
    "/account",
    "/saved",
    "/share/123",
    "/transfer/123",
    "/history",
    "/diagnostics",
    "/?q=password%3Dsecret",
  ])
    assert.throws(() => pageShareHref(value));
  assert.equal(
    pageShareHref("/?q=MATH+1151&cursor=private&token=secret&via=old#k=secret"),
    "/?q=MATH+1151",
  );
  assert.equal(
    pageShareHref("/reference#instruction-modes"),
    "/reference#instruction-modes",
  );
  assert.equal(pageShareHref("/reference#k=secret"), "/reference");
});
test("course sharing preserves its exact identity, term, campus and selected detail context", () => {
  const c = snapshot.items[0].payload;
  const url = new URL(
    courseShareHref(
      c,
      "course=" +
        c.id +
        "&detailTab=ratings&ratingSource=rmp&focusSection=12345&cursor=old",
    ),
    "https://site.test",
  );
  assert.equal(url.searchParams.get("course"), c.id);
  assert.equal(url.searchParams.get("term"), c.termCode);
  assert.equal(url.searchParams.get("campus"), c.campusCode.toLowerCase());
  assert.equal(url.searchParams.get("detailTab"), "ratings");
  assert.equal(url.searchParams.get("cursor"), null);
  assert.equal(
    new URL(
      courseShareHref(c, "course=other&detailTab=syllabus"),
      "https://site.test",
    ).searchParams.get("detailTab"),
    null,
  );
});

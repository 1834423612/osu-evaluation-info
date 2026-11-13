import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseRmpLibraryInput,
  rmpProfessorId,
  rmpSearchTokens,
} from "../../src/lib/rmp/library-input.ts";
test("library filters bound source queries without excluding unconfirmed profiles", () => {
  assert.deepEqual(parseRmpLibraryInput(new URLSearchParams()), {
    query: "",
    campus: "ALL",
    identity: "all",
    offset: 0,
  });
  assert.equal(
    parseRmpLibraryInput(new URLSearchParams("campus=mns&identity=unverified"))
      .campus,
    "MNS",
  );
  for (const value of [
    "offset=-1",
    "offset=100001",
    "campus=OTHER",
    "identity=candidate",
    "q=" + encodeURIComponent("\u0000"),
  ])
    assert.throws(
      () => parseRmpLibraryInput(new URLSearchParams(value)),
      RangeError,
    );
  assert.equal(rmpProfessorId("123"), "123");
  for (const value of ["0", "-1", "1 OR 1=1", "12x"])
    assert.throws(() => rmpProfessorId(value), RangeError);
});
test("literal percent, underscore and backslash never become search wildcards", () => {
  assert.deepEqual(rmpSearchTokens("Alex 100% test_name"), [
    "alex",
    "100\\%",
    "test\\_name",
  ]);
});

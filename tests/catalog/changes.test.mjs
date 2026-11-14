import assert from "node:assert/strict";
import test from "node:test";
import {
  parseChangeFilters,
  readChangeCursor,
  changeSignature,
} from "../../src/lib/catalog/changes.ts";
test("update filters bound campus, term, period, text and duplicate parameters", () => {
  assert.deepEqual(parseChangeFilters(new URLSearchParams()), {
    term: undefined,
    campus: "ALL",
    kind: "all",
    q: "",
    days: 30,
    cursor: undefined,
  });
  assert.equal(
    parseChangeFilters(
      new URLSearchParams(
        "term=1272&campus=MNS&kind=restored&days=7&q=+MATH+1151+",
      ),
    ).q,
    "MATH 1151",
  );
  for (const value of [
    "term=bad",
    "campus=whatever",
    "kind=brand-new",
    "days=100",
    "days=NaN",
    "q=" + "x".repeat(81),
    "term=1272&term=1268",
    "cursor=" + "a".repeat(801),
  ])
    assert.throws(() => parseChangeFilters(new URLSearchParams(value)));
});
test("update cursors pin filters, a finite page boundary and the original event horizon", () => {
  const f = parseChangeFilters(new URLSearchParams("term=1272"));
  const cursor = {
    v: 1,
    signature: changeSignature(f),
    id: "10",
    anchor: "100",
    time: "2026-11-13T12:00:00.000123Z",
    since: "2026-10-14T12:00:00.000Z",
  };
  const enc = (c) => Buffer.from(JSON.stringify(c)).toString("base64url");
  assert.deepEqual(readChangeCursor({ ...f, cursor: enc(cursor) }), cursor);
  assert.throws(() =>
    readChangeCursor({ ...f, campus: "MNS", cursor: enc(cursor) }),
  );
  for (const value of [
    { ...cursor, id: "101" },
    { ...cursor, anchor: "9999999999999999999" },
    { ...cursor, id: 10 },
    { ...cursor, time: "1" },
    { ...cursor, time: "invalid" },
    null,
  ])
    assert.throws(() => readChangeCursor({ ...f, cursor: enc(value) }));
  assert.equal(readChangeCursor(f), null);
});

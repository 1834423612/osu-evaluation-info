import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeRmpInput } from "../src/lib/rmp/input.ts";

const selection = {
  subject: "CSE",
  catalogNumber: "2221",
  campus: "COL",
  usernames: ["example.12"],
};

describe("RMP course selection", () => {
  it("normalizes official identities and deduplicates before querying", () => {
    assert.deepEqual(
      normalizeRmpInput({
        subject: " cse ",
        catalogNumber: " 2221 ",
        campus: "col",
        usernames: ["Example.12", "example.12", "other.9"],
      }),
      { ...selection, usernames: ["example.12", "other.9"] },
    );
  });

  it("never matches display names or arbitrary email addresses", () => {
    for (const identity of [
      "Example Teacher",
      "example.12@gmail.com",
      "example.12@osu.edu",
      "example",
      "example.12,other.9",
    ])
      assert.throws(
        () => normalizeRmpInput({ ...selection, usernames: [identity] }),
        RangeError,
      );
  });

  it("bounds selections at 120 instructors and rejects unrecognized campuses and malformed course keys", () => {
    for (const invalid of [
      {
        ...selection,
        usernames: Array.from(
          { length: 121 },
          (_, index) => `example.${index}`,
        ),
      },
      { ...selection, campus: "ALL" },
      { ...selection, catalogNumber: "2221;SELECT" },
      { ...selection, subject: "CSE'" },
    ])
      assert.throws(() => normalizeRmpInput(invalid), RangeError);
    assert.equal(
      normalizeRmpInput({
        ...selection,
        usernames: Array.from(
          { length: 120 },
          (_, index) => `example.${index}`,
        ),
      }).usernames.length,
      120,
    );
  });

  it("allows missing official identities without guessing a match", () => {
    assert.deepEqual(
      normalizeRmpInput({ ...selection, usernames: [] }).usernames,
      [],
    );
  });
});

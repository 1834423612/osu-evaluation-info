import assert from "node:assert/strict";
import test from "node:test";
import { selectReadableSyllabus } from "../../src/lib/syllabus/selection.ts";
const entries = [
  { code: "missing", classNumber: "17826" },
  { code: "available", classNumber: "17850" },
  { code: "later", classNumber: "17855" },
];
const doc = { data: { components: [{ html: "<p>Course content</p>" }] } };
test("default skips missing, empty and failed documents while preserving source order", () => {
  assert.equal(
    selectReadableSyllabus(entries, {
      missing: null,
      available: doc,
      later: doc,
    }).code,
    "available",
  );
  assert.equal(
    selectReadableSyllabus(entries, {
      missing: { data: { components: [] } },
      available: doc,
    }).code,
    "available",
  );
  assert.equal(
    selectReadableSyllabus(entries, {
      missing: null,
      available: null,
      later: doc,
    }).code,
    "later",
  );
  assert.equal(
    selectReadableSyllabus(entries, {
      missing: null,
      available: null,
      later: null,
    }),
    undefined,
  );
});
test("slow earlier documents cannot cause the selection to jump as requests finish", () => {
  assert.equal(
    selectReadableSyllabus(entries, { available: doc, later: doc }),
    undefined,
  );
  assert.equal(
    selectReadableSyllabus(entries, { missing: null, later: doc }),
    undefined,
  );
});
test("manual choices remain selected and unavailable focus falls through to a readable document", () => {
  const documents = { missing: null, available: doc, later: doc };
  assert.equal(
    selectReadableSyllabus(entries, documents, "later").code,
    "later",
  );
  assert.equal(
    selectReadableSyllabus(entries, documents, "missing").code,
    "missing",
  );
  assert.equal(
    selectReadableSyllabus(entries, documents, "", "17826").code,
    "available",
  );
  assert.equal(
    selectReadableSyllabus(entries, documents, "", "17855").code,
    "later",
  );
  assert.equal(
    selectReadableSyllabus(entries, documents, "stale").code,
    "available",
  );
});

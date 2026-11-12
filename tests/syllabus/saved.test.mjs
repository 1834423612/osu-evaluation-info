import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDocument } from "../../src/lib/syllabus/normalize.ts";
import { documentFixture } from "./fixtures.mjs";
import {
  observeSyllabus,
  acknowledgeSyllabus,
  syllabusHasUpdate,
  parseSavedSyllabi,
} from "../../src/lib/syllabus/saved.ts";
const doc = normalizeDocument(documentFixture(), "example123");
const initial = {
  id: doc.entry.code,
  entry: doc.entry,
  acknowledged: null,
  latest: null,
  checkedAt: null,
};
const result = (
  version,
  source = "official-relay",
  time = "2026-11-12T12:00:00Z",
) => ({ data: { ...doc, snapshotId: version }, source, fetchedAt: time });

test("first official observation establishes a baseline; later versions require explicit acknowledgement", () => {
  const baseline = observeSyllabus(initial, result("one"));
  assert.equal(syllabusHasUpdate(baseline), false);
  const updated = observeSyllabus(baseline, result("two"));
  assert.equal(syllabusHasUpdate(updated), true);
  assert.equal(
    syllabusHasUpdate(observeSyllabus(updated, result("two"))),
    true,
  );
  assert.equal(
    syllabusHasUpdate(acknowledgeSyllabus(updated, baseline.latest)),
    true,
  );
  assert.equal(
    syllabusHasUpdate(acknowledgeSyllabus(updated, updated.latest)),
    false,
  );
});
test("archives, out-of-order responses and other sections cannot overwrite notifications", () => {
  const item = observeSyllabus(
    observeSyllabus(initial, result("one")),
    result("two"),
  );
  assert.equal(observeSyllabus(item, result("archive", "backup")), item);
  assert.equal(
    observeSyllabus(
      item,
      result("one", "official-relay", "2026-11-11T00:00:00Z"),
    ),
    item,
  );
  const wrong = result("wrong");
  wrong.data.entry = { ...doc.entry, entityId: "other" };
  assert.equal(observeSyllabus(item, wrong), item);
  assert.equal(syllabusHasUpdate(item), true);
});
test("saved syllabus reads tolerate corrupt or incomplete local data", () => {
  for (const raw of [null, "broken", "{}", '[null,{}, {"id":"x"}]'])
    assert.deepEqual(parseSavedSyllabi(raw), []);
});

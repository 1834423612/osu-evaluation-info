import assert from "node:assert/strict";
import { test } from "node:test";
import {
  snapshotSchema,
  parseSnapshot,
  publicSnapshot,
  itemHref,
  itemKey,
} from "../../src/lib/saved/exchange.ts";
import { snapshot } from "./fixtures.mjs";
test("all four item kinds round-trip with volatile enrollment and unknown HTML stripped", () => {
  const input = structuredClone(snapshot);
  input.items[0].payload.html = "<script>secret</script>";
  const parsed = parseSnapshot(JSON.stringify(input));
  assert.equal(parsed.items.length, 4);
  assert.equal(parsed.items[0].payload.sections[0].enrollmentTotal, null);
  assert.equal(parsed.items[0].payload.html, undefined);
  assert.equal(new Set(parsed.items.map(itemKey)).size, 4);
  for (const item of parsed.items) assert.ok(itemHref(item).startsWith("/?"));
});
test("public shares strip nested contact details and never transfer publisher notification acknowledgements", () => {
  const result = publicSnapshot(snapshot);
  assert.ok(!JSON.stringify(result).includes("example.1@osu.edu"));
  const item = result.items.find((x) => x.kind === "syllabus");
  assert.equal(item.payload.acknowledged, null);
  assert.equal(item.payload.latest, null);
  assert.equal(item.payload.checkedAt, null);
  assert.equal(snapshot.items[3].payload.acknowledged.snapshotId, "old");
});
test("malformed identities, corrupt structure, duplicate identities and oversized documents are rejected", () => {
  const mismatch = structuredClone(snapshot);
  mismatch.items[1].payload.id = "another-section";
  assert.throws(() => snapshotSchema.parse(mismatch));
  assert.throws(() =>
    snapshotSchema.parse({
      ...snapshot,
      items: [snapshot.items[0], snapshot.items[0]],
    }),
  );
  assert.throws(() => parseSnapshot("x".repeat(1048577)));
  assert.throws(() =>
    parseSnapshot(JSON.stringify({ ...snapshot, version: 99 })),
  );
});

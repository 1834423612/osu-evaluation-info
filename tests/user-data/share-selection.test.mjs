import assert from "node:assert/strict";
import { test } from "node:test";
import { snapshot } from "./fixtures.mjs";
import { itemKey } from "../../src/lib/saved/exchange.ts";
import {
  shareGroups,
  initialShareSelection,
  projectShareSelection,
  UNFILED_SHARE_GROUP,
  shareSelectionFingerprint,
} from "../../src/lib/saved/share-selection.ts";

const keys = snapshot.items.map(itemKey);
test("restored selections have the same draft fingerprint regardless of toggle order", () => {
  assert.equal(
    shareSelectionFingerprint({ one: ["a", "b"], two: ["c"] }),
    shareSelectionFingerprint({ two: ["c"], empty: [], one: ["b", "a"] }),
  );
});
const folders = [
  { id: "one", name: "First", tags: ["Autumn"], members: [keys[0], keys[1]] },
  {
    id: "two",
    name: "Private overlapping folder",
    tags: ["Private"],
    members: [keys[0], keys[2]],
  },
  { id: "empty", name: "Empty", tags: [], members: ["course:missing"] },
];

test("folder-first picker separates unfiled items and drops unreadable memberships", () => {
  const groups = shareGroups(snapshot.items, folders);
  assert.deepEqual(
    groups.map((group) => group.id),
    ["one", "two", UNFILED_SHARE_GROUP],
  );
  assert.deepEqual(groups[2].items.map(itemKey), [keys[3]]);
});

test("sharing an active folder selects that folder without exposing overlapping folders", () => {
  const groups = shareGroups(snapshot.items, folders);
  const projected = projectShareSelection(
    groups,
    initialShareSelection(groups, new Set(), "one"),
  );
  assert.deepEqual([...projected.keys], keys.slice(0, 2));
  assert.deepEqual(
    projected.collections.map((folder) => folder.name),
    ["First"],
  );
  assert.equal(
    JSON.stringify(projected.collections).includes("Private"),
    false,
  );
  assert.deepEqual(initialShareSelection(groups, new Set()), {});
});

test("selected items use the active folder first and share only chosen partial memberships", () => {
  const groups = shareGroups(snapshot.items, folders);
  const choice = initialShareSelection(
    groups,
    new Set([keys[0], keys[3], "course:missing"]),
    "two",
  );
  assert.deepEqual(choice, {
    two: [keys[0]],
    [UNFILED_SHARE_GROUP]: [keys[3]],
  });
  const result = projectShareSelection(groups, choice);
  assert.deepEqual(result.collections[0].members, [keys[0]]);
  assert.equal(result.keys.size, 2);
});

test("independent folder choices deduplicate items without restoring omitted memberships", () => {
  const groups = shareGroups(snapshot.items, folders);
  const both = projectShareSelection(groups, {
    one: keys.slice(0, 2),
    two: [keys[0], keys[2]],
  });
  assert.equal(both.keys.size, 3);
  assert.equal(both.duplicates, 1);
  const partial = projectShareSelection(groups, {
    one: [keys[1]],
    two: [keys[0], "course:missing"],
    empty: keys,
  });
  assert.deepEqual(
    partial.collections.map((folder) => folder.members),
    [[keys[1]], [keys[0]]],
  );
  assert.equal(partial.keys.size, 2);
});

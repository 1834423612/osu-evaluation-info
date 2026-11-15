import { test } from "node:test";
import assert from "node:assert/strict";
import { newSyncState } from "../../src/lib/sync/model.ts";
import {
  cloudHasItem,
  hasPendingSavedChanges,
} from "../../src/lib/sync/storage-status.ts";
import { snapshot } from "./fixtures.mjs";
import { itemKey } from "../../src/lib/saved/exchange.ts";
test("storage status never claims cloud persistence before an acknowledgement", () => {
  const state = newSyncState("account"),
    item = snapshot.items[0],
    key = itemKey(item);
  state.enabled = true;
  assert.equal(cloudHasItem(state, item), false);
  assert.equal(hasPendingSavedChanges(state, [item]), true);
  state.baseline[key] = { key, version: 1, item: structuredClone(item) };
  assert.equal(cloudHasItem(state, item), true);
  assert.equal(hasPendingSavedChanges(state, [item]), false);
  const changed = structuredClone(item);
  changed.payload.title = "Changed locally";
  assert.equal(cloudHasItem(state, changed), false);
  assert.equal(hasPendingSavedChanges(state, [changed]), true);
  assert.equal(hasPendingSavedChanges(state, []), true);
  state.outbox.push({ id: "pending", key, base: 1, item });
  assert.equal(cloudHasItem(state, item), false);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { snapshot } from "./fixtures.mjs";
import {
  newSyncState,
  captureChanges,
  acceptResponse,
  resolveConflict,
} from "../../src/lib/sync/model.ts";
import { itemKey } from "../../src/lib/saved/exchange.ts";
import {
  setSavedScope,
  savedScope,
  scopedSavedKey,
} from "../../src/lib/saved/scope.ts";
const item = snapshot.items[0],
  key = itemKey(item);
function response(records = [], receipts = [], cursor = 1) {
  return { accountId: "a", floor: 0, reset: false, cursor, records, receipts };
}
test("local outbox preserves edits made while an earlier request was in flight", () => {
  const state = newSyncState("a");
  captureChanges(state, [item], randomUUID);
  const op = state.outbox[0];
  const changed = structuredClone(item);
  changed.payload.title = "Changed during request";
  const record = { key, version: 1, item };
  const result = acceptResponse(
    state,
    response([record], [{ id: op.id, status: "applied", record }]),
    [changed],
  );
  assert.equal(result[0].payload.title, changed.payload.title);
  assert.equal(state.outbox.length, 0);
  captureChanges(state, result, randomUUID);
  assert.equal(state.outbox.length, 1);
  assert.equal(state.outbox[0].base, 1);
  assert.equal(state.outbox[0].item.payload.title, changed.payload.title);
});
test("remote removals apply when clean; concurrent local edits require a choice", () => {
  const state = newSyncState("a");
  state.seen[key] = item;
  state.baseline[key] = { key, item, version: 1 };
  state.cursor = 1;
  assert.deepEqual(
    acceptResponse(state, response([{ key, version: 2, item: null }], [], 2), [
      item,
    ]),
    [],
  );
  state.seen[key] = item;
  state.baseline[key] = { key, item, version: 1 };
  state.cursor = 1;
  const changed = structuredClone(item);
  changed.payload.title = "Offline edit";
  captureChanges(state, [changed], randomUUID);
  const op = state.outbox[0],
    record = { key, item: null, version: 2 };
  assert.equal(
    acceptResponse(
      state,
      response([record], [{ id: op.id, status: "conflict", record }], 2),
      [changed],
    ).length,
    1,
  );
  assert.equal(state.conflicts.length, 1);
  assert.equal(state.outbox.length, 0);
  const kept = resolveConflict(state, key, "local", [changed]);
  captureChanges(state, kept, randomUUID);
  assert.equal(state.outbox[0].base, 2);
  state.conflicts = [{ key, local: changed, remote: record }];
  state.outbox = [];
  assert.deepEqual(resolveConflict(state, key, "cloud", [changed]), []);
});
test("a full reconciliation never silently applies or discards stale offline edits", () => {
  const state = newSyncState("a");
  captureChanges(state, [item], randomUUID);
  const before = structuredClone(state.outbox);
  assert.deepEqual(
    acceptResponse(state, { ...response([], [], 10), reset: true }, [item]),
    [item],
  );
  assert.equal(state.needsReview, true);
  assert.deepEqual(state.outbox, before);
  assert.equal(state.cursor, 0);
  assert.throws(() =>
    acceptResponse(state, { ...response(), accountId: "b" }, []),
  );
});
test("unobserved local edits survive a remote pull and require an explicit choice", () => {
  const state = newSyncState("a");
  state.seen[key] = item;
  const edit = structuredClone(item);
  edit.payload.title = "Local";
  const remote = structuredClone(item);
  remote.payload.title = "Remote";
  const next = acceptResponse(
    state,
    response([{ key, version: 7, item: remote }], [], 7),
    [edit],
  );
  assert.equal(next[0].payload.title, "Local");
  captureChanges(state, next, randomUUID);
  assert.equal(state.outbox.length, 0);
  assert.equal(state.conflicts[0].remote.version, 7);
});
test("account storage keys stay separate from guest data and other accounts", () => {
  const key = "course-atlas:saved-workspace:v1";
  setSavedScope("a");
  assert.equal(savedScope(), "a");
  assert.notEqual(scopedSavedKey(key), key);
  const a = scopedSavedKey(key);
  setSavedScope("b");
  assert.notEqual(a, scopedSavedKey(key));
  setSavedScope(null);
  assert.equal(scopedSavedKey(key), key);
  assert.throws(() => setSavedScope("../bad"));
});

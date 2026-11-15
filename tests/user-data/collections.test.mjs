import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { snapshot } from "./fixtures.mjs";
import { collectionSchema } from "../../src/lib/saved/collection-schema.ts";
import { exchangeItemSchema } from "../../src/lib/saved/exchange.ts";
import { syncOperationSchema } from "../../src/lib/sync/protocol.ts";
import { syncBatch } from "../../src/lib/sync/items.ts";
import {
  newSyncState,
  initializeMerge,
  captureChanges,
  acceptResponse,
  resolveConflict,
} from "../../src/lib/sync/model.ts";
import {
  readSavedWorkspace,
  writeSavedArray,
  replaceSavedWorkspace,
  SAVED_STORAGE_KEYS,
  SAVED_WORKSPACE_KEY,
} from "../../src/lib/saved/workspace.ts";

const collection = {
  kind: "collection",
  payload: {
    id: randomUUID(),
    name: "Autumn",
    tags: ["Degree"],
    members: ["course:" + snapshot.items[0].payload.id],
  },
};
test("private collections have bounded, unique identities and never enter public snapshots", () => {
  assert.equal(exchangeItemSchema.safeParse(collection).success, false);
  const op = {
    id: randomUUID(),
    key: "collection:" + collection.payload.id,
    base: 0,
    item: collection,
  };
  assert.equal(syncOperationSchema.safeParse(op).success, true);
  assert.equal(
    syncOperationSchema.safeParse({ ...op, key: "collection:" + randomUUID() })
      .success,
    false,
  );
  for (const edit of [
    { tags: ["Degree", "Degree"] },
    { members: ["course:a", "course:a"] },
    { name: " " },
    { members: ["collection:a"] },
  ])
    assert.equal(
      collectionSchema.safeParse({ ...collection.payload, ...edit }).success,
      false,
    );
  const large = Array.from({ length: 100 }, () => ({
    ...op,
    id: randomUUID(),
    item: {
      ...collection,
      payload: {
        ...collection.payload,
        members: Array.from(
          { length: 700 },
          (_, i) => "course:" + i + "x".repeat(290),
        ),
      },
    },
  }));
  const batch = syncBatch(large);
  assert.ok(batch.length > 0 && batch.length < 100);
  assert.ok(
    new TextEncoder().encode(JSON.stringify({ operations: batch })).byteLength <
      900000,
  );
});
test("favorite edits and replacement preserve versioned organization and cached reads are isolated", () => {
  const data = new Map(),
    store = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => data.set(k, v),
      removeItem: (k) => data.delete(k),
    };
  const records = Object.fromEntries(SAVED_STORAGE_KEYS.map((k) => [k, "[]"]));
  data.set(
    SAVED_WORKSPACE_KEY,
    JSON.stringify({ version: 2, records, collections: [collection.payload] }),
  );
  const first = readSavedWorkspace(store);
  first.collections[0].name = "mutated";
  assert.equal(readSavedWorkspace(store).collections[0].name, "Autumn");
  writeSavedArray(
    store,
    SAVED_STORAGE_KEYS[0],
    JSON.stringify([snapshot.items[0].payload]),
    "[]",
  );
  replaceSavedWorkspace(store, records);
  assert.equal(readSavedWorkspace(store).collections[0].name, "Autumn");
  assert.equal(readSavedWorkspace(store).version, 2);
  data.set(
    SAVED_WORKSPACE_KEY,
    JSON.stringify({
      version: 2,
      records,
      collections: [{ ...collection.payload, members: ["invalid"] }],
    }),
  );
  assert.throws(() => readSavedWorkspace(store));
});
test("two devices sync collection membership and preserve competing renames for review", () => {
  const state = newSyncState("a"),
    key = "collection:" + collection.payload.id;
  const response = {
    accountId: "a",
    cursor: 1,
    floor: 0,
    reset: false,
    records: [{ key, version: 1, item: collection }],
    receipts: [],
  };
  const local = initializeMerge(state, response, [], randomUUID);
  const edit = structuredClone(local);
  edit[0].payload.name = "Local name";
  captureChanges(state, edit, randomUUID);
  const remote = structuredClone(collection);
  remote.payload.name = "Cloud name";
  const row = { key, version: 2, item: remote };
  const next = acceptResponse(
    state,
    {
      ...response,
      cursor: 2,
      records: [row],
      receipts: [{ id: state.outbox[0].id, status: "conflict", record: row }],
    },
    edit,
  );
  assert.equal(next[0].payload.name, "Local name");
  assert.equal(state.conflicts[0].remote.item.payload.name, "Cloud name");
  assert.equal(
    resolveConflict(state, key, "cloud", next)[0].payload.name,
    "Cloud name",
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { course } from "../user-data/fixtures.mjs";
import {
  SAVED_WORKSPACE_KEY,
  SAVED_STORAGE_KEYS,
} from "../../src/lib/saved/workspace.ts";
import { exportPlanningFavorites as exportFavorites } from "../../src/lib/saved/planning-export.ts";
import { withinSavedTransaction } from "../../src/lib/saved/mutation-context.ts";
const exportPlanningFavorites = (...args) =>
  withinSavedTransaction(() => exportFavorites(...args));
test("folder validation and storage failure never leave a partial favorites export", () => {
  const data = new Map();
  let writes = 0,
    fail = false;
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      writes++;
      if (fail) throw Error("quota");
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
  };
  globalThis.window = Object.assign(new EventTarget(), {
    localStorage: storage,
  });
  globalThis.localStorage = storage;
  const folders = Array.from({ length: 30 }, (_, n) => ({
    id: "11111111-1111-4111-8111-" + String(n).padStart(12, "0"),
    name: "Folder " + n,
    tags: [],
    members: [],
  }));
  const workspace = {
    version: 2,
    records: Object.fromEntries(SAVED_STORAGE_KEYS.map((k) => [k, null])),
    collections: folders,
  };
  const original = JSON.stringify(workspace);
  data.set(SAVED_WORKSPACE_KEY, original);
  const incoming = [{ kind: "course", payload: course }];
  assert.throws(() =>
    exportPlanningFavorites(incoming, {
      id: "22222222-2222-4222-8222-222222222222",
      name: "Overflow",
    }),
  );
  assert.equal(writes, 0);
  assert.equal(data.get(SAVED_WORKSPACE_KEY), original);
  assert.throws(
    () => exportPlanningFavorites(incoming, { id: "removed" }),
    /collection_removed/,
  );
  assert.equal(writes, 0);
  fail = true;
  assert.throws(
    () => exportPlanningFavorites(incoming, { id: folders[0].id }),
    /quota/,
  );
  assert.equal(data.get(SAVED_WORKSPACE_KEY), original);
  fail = false;
  writes = 0;
  exportPlanningFavorites(incoming, { id: folders[0].id });
  assert.equal(writes, 1);
  const result = JSON.parse(data.get(SAVED_WORKSPACE_KEY));
  assert.equal(result.collections[0].members[0], "course:" + course.id);
  assert.equal(JSON.parse(result.records[SAVED_STORAGE_KEYS[0]]).length, 1);
});

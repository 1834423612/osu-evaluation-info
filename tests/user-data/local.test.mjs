import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { snapshot, course } from "./fixtures.mjs";
import { withinSavedTransaction as transaction } from "../../src/lib/saved/mutation-context.ts";
import {
  SAVED_STORAGE_KEYS,
  SAVED_WORKSPACE_KEY,
} from "../../src/lib/saved/workspace.ts";
test("import, removal and undo preserve complete existing snapshots and intervening additions", async () => {
  const data = new Map();
  let fail = false;
  const storage = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (fail) throw Error("QuotaExceededError");
      data.set(k, String(v));
    },
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
  const win = Object.assign(new EventTarget(), {
    localStorage: storage,
    sessionStorage: storage,
  });
  globalThis.window = win;
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: storage,
    configurable: true,
  });
  const original = {
    ...course,
    extraCache: { keep: "original" },
    sections: [
      {
        ...course.sections[0],
        fees: [
          {
            kind: "course",
            description: "Retain original fee",
            amount: 20,
            campusCodes: ["COL"],
          },
        ],
      },
    ],
  };
  for (const key of SAVED_STORAGE_KEYS) data.set(key, "[]");
  data.set(SAVED_STORAGE_KEYS[0], JSON.stringify([original]));
  const {
    importLocalItems,
    removeLocalItems,
    restoreLocalRemoval,
    readLocalItems,
    createLocalBackup,
    restoreLocalBackup,
  } = await import("../../src/lib/saved/local.ts");
  transaction(() => importLocalItems([snapshot.items[2]]));
  const saved = () =>
    JSON.parse(
      JSON.parse(data.get(SAVED_WORKSPACE_KEY)).records[SAVED_STORAGE_KEYS[0]],
    )[0];
  assert.equal(saved().description, original.description);
  assert.equal(saved().sections[0].fees[0].amount, 20);
  assert.deepEqual(saved().extraCache, { keep: "original" });
  const removed = transaction(() =>
    removeLocalItems(new Set(["course:" + course.id])),
  );
  assert.equal(readLocalItems().filter((x) => x.kind === "course").length, 0);
  transaction(() =>
    importLocalItems([
      {
        kind: "instructor",
        payload: {
          ...snapshot.items[2].payload,
          id: "another.2",
          name: "Another teacher",
        },
      },
    ]),
  );
  transaction(() => restoreLocalRemoval(removed));
  assert.equal(
    readLocalItems().filter((x) => x.kind === "instructor").length,
    2,
  );
  assert.equal(saved().description, original.description);
  assert.equal(saved().sections[0].fees[0].amount, 20);
  assert.deepEqual(saved().extraCache, { keep: "original" });
  const before = data.get(SAVED_WORKSPACE_KEY);
  fail = true;
  assert.throws(() => transaction(() => importLocalItems([snapshot.items[1]])));
  assert.equal(data.get(SAVED_WORKSPACE_KEY), before);
  fail = false;
  const { saveCollection, readCollections } =
    await import("../../src/lib/saved/collections.ts");
  const group = {
    id: randomUUID(),
    name: "Original group",
    tags: ["Degree"],
    members: ["course:" + course.id],
  };
  transaction(() => saveCollection(group, null));
  const backup = createLocalBackup();
  assert.equal(backup.workspace.version, 2);
  data.delete(SAVED_WORKSPACE_KEY);
  for (const key of SAVED_STORAGE_KEYS) data.set(key, "[]");
  transaction(() => restoreLocalBackup(backup));
  assert.equal(saved().sections[0].fees[0].amount, 20);
  assert.equal(saved().description, original.description);
  assert.deepEqual(readCollections(), [group]);
  transaction(() =>
    saveCollection(
      {
        ...group,
        name: "Current name",
        members: [...group.members, "instructor:another.2"],
      },
      group,
    ),
  );
  transaction(() => restoreLocalBackup(backup));
  assert.equal(readCollections()[0].name, "Current name");
  assert.equal(readCollections()[0].members.length, 2);
  transaction(() => restoreLocalBackup(backup));
  assert.equal(readCollections().length, 1);
  const full = structuredClone(backup);
  full.workspace.collections = Array.from({ length: 30 }, (_, i) => ({
    ...group,
    id: randomUUID(),
    name: "Other " + i,
  }));
  const beforeOversize = data.get(SAVED_WORKSPACE_KEY);
  assert.throws(() => transaction(() => restoreLocalBackup(full)));
  assert.equal(data.get(SAVED_WORKSPACE_KEY), beforeOversize);
  data.set(SAVED_WORKSPACE_KEY, "{broken");
  assert.throws(() => readLocalItems());
});

import assert from "node:assert/strict";
import { test } from "node:test";
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
  data.set(SAVED_WORKSPACE_KEY, "{broken");
  assert.throws(() => readLocalItems());
});

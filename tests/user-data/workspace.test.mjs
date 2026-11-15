import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mergeSavedDelta,
  readSavedWorkspace,
  writeSavedArray,
  replaceSavedWorkspace,
  SAVED_STORAGE_KEYS,
  SAVED_WORKSPACE_KEY,
} from "../../src/lib/saved/workspace.ts";
const raw = (values) => JSON.stringify(values);

test("capacity rejects additions without evicting old favorites and still permits reducing a legacy over-limit list", () => {
  for (const key of SAVED_STORAGE_KEYS) {
    const limit = key === SAVED_STORAGE_KEYS[0] ? 100 : 200,
      items = Array.from({ length: limit }, (_, i) => ({ id: String(i) })),
      records = Object.fromEntries(
        SAVED_STORAGE_KEYS.map((k) => [k, k === key ? raw(items) : "[]"]),
      );
    const map = new Map([
        [SAVED_WORKSPACE_KEY, JSON.stringify({ version: 1, records })],
      ]),
      store = {
        getItem: (k) => map.get(k) ?? null,
        setItem: (k, v) => map.set(k, v),
        removeItem: (k) => map.delete(k),
      },
      before = map.get(SAVED_WORKSPACE_KEY);
    assert.throws(
      () =>
        writeSavedArray(
          store,
          key,
          raw([...items, { id: "extra" }]),
          raw(items),
        ),
      (e) => e.name === "SavedCapacityError" && e.limit === limit,
    );
    assert.equal(map.get(SAVED_WORKSPACE_KEY), before);
    records[key] = raw([...items, { id: "legacy-extra" }]);
    map.set(SAVED_WORKSPACE_KEY, JSON.stringify({ version: 1, records }));
    writeSavedArray(store, key, raw(items), records[key]);
    assert.equal(
      JSON.parse(readSavedWorkspace(store).records[key]).length,
      limit,
    );
  }
  const key = SAVED_STORAGE_KEYS[2],
    before = [
      {
        id: "teacher",
        courses: Array.from({ length: 30 }, (_, i) => ({ id: String(i) })),
      },
    ],
    next = [{ ...before[0], courses: [...before[0].courses, { id: "extra" }] }],
    records = Object.fromEntries(
      SAVED_STORAGE_KEYS.map((k) => [k, k === key ? raw(before) : "[]"]),
    ),
    map = new Map([
      [SAVED_WORKSPACE_KEY, JSON.stringify({ version: 1, records })],
    ]),
    store = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    };
  assert.throws(
    () => writeSavedArray(store, key, raw(next), raw(before)),
    (e) => e.name === "SavedCapacityError" && e.limit === 30,
  );
  assert.deepEqual(JSON.parse(readSavedWorkspace(store).records[key]), before);
});
test("cross-tab changes preserve unrelated additions and cannot resurrect another tab's deletion", () => {
  const base = raw([{ id: "a" }, { id: "b" }]);
  assert.deepEqual(
    mergeSavedDelta(
      base,
      raw([{ id: "a" }, { id: "b" }, { id: "c" }]),
      raw([{ id: "b" }, { id: "d" }]),
    ),
    [{ id: "b" }, { id: "d" }, { id: "c" }],
  );
});
test("instructor course edits and exact revision acknowledgements preserve unrelated concurrent fields", () => {
  const base = [{ id: "teacher", courses: [{ id: "a" }] }],
    next = [{ id: "teacher", courses: [{ id: "a" }, { id: "b" }] }],
    live = [{ id: "teacher", courses: [{ id: "a" }, { id: "c" }] }];
  assert.deepEqual(
    mergeSavedDelta(raw(base), raw(next), raw(live))[0].courses.map(
      (x) => x.id,
    ),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    mergeSavedDelta(
      raw([{ id: "s", acknowledged: "old", latest: "old" }]),
      raw([{ id: "s", acknowledged: "read", latest: "old" }]),
      raw([{ id: "s", acknowledged: "old", latest: "new" }]),
    )[0],
    { id: "s", acknowledged: "read", latest: "new" },
  );
});
test("four collection kinds commit in one storage write, preserving legacy backups on quota failure", () => {
  const map = new Map([[SAVED_STORAGE_KEYS[0], raw([{ id: "original" }])]]);
  let fail = false,
    writes = 0;
  const store = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      writes++;
      if (fail) throw Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k) => map.delete(k),
  };
  writeSavedArray(
    store,
    SAVED_STORAGE_KEYS[0],
    raw([{ id: "original" }, { id: "new" }]),
    raw([{ id: "original" }]),
  );
  assert.equal(writes, 1);
  assert.equal(map.get(SAVED_STORAGE_KEYS[0]), raw([{ id: "original" }]));
  const saved = map.get(SAVED_WORKSPACE_KEY);
  fail = true;
  assert.throws(() =>
    replaceSavedWorkspace(
      store,
      Object.fromEntries(SAVED_STORAGE_KEYS.map((k) => [k, "[]"])),
    ),
  );
  assert.equal(map.get(SAVED_WORKSPACE_KEY), saved);
  assert.equal(
    JSON.parse(readSavedWorkspace(store).records[SAVED_STORAGE_KEYS[0]]).length,
    2,
  );
});
test("corrupt workspace and corrupt arrays raise an error rather than becoming authoritative empty data", () => {
  assert.throws(() => readSavedWorkspace({ getItem: () => "{broken" }));
  assert.throws(() => mergeSavedDelta("[]", "invalid", "[]"));
});

test("cached workspace reads return independent records and observe storage changes", () => {
  let raw = JSON.stringify({
    version: 1,
    records: Object.fromEntries(SAVED_STORAGE_KEYS.map((k) => [k, "[]"])),
  });
  const store = { getItem: () => raw };
  const first = readSavedWorkspace(store);
  first.records[SAVED_STORAGE_KEYS[0]] = "mutated";
  assert.equal(readSavedWorkspace(store).records[SAVED_STORAGE_KEYS[0]], "[]");
  const next = JSON.parse(raw);
  next.records[SAVED_STORAGE_KEYS[0]] = JSON.stringify([{ id: "new" }]);
  raw = JSON.stringify(next);
  assert.equal(
    JSON.parse(readSavedWorkspace(store).records[SAVED_STORAGE_KEYS[0]])[0].id,
    "new",
  );
});

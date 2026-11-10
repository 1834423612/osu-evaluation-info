import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeStoredData,
  migrateBrowserStorage,
} from "../../src/lib/preferences/storage-migrations.ts";
import { browserStorage } from "../../src/lib/preferences/browser-storage.ts";

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
test("migrations merge identities and nested instructor-course links before removing old keys", () => {
  const store = storage({
    "course-atlas:saved-instructors:v0": JSON.stringify([
      {
        id: "teacher.1",
        name: "Old",
        courses: [{ id: "CSE2221", title: "A" }],
      },
    ]),
    "course-atlas:saved-instructors:v1": JSON.stringify([
      {
        id: "teacher.1",
        name: "New",
        courses: [{ id: "MATH1151", title: "B" }],
      },
    ]),
    "course-atlas:people-directory:v2": "{}",
    "course-atlas:unknown:v1": "keep",
    "another-app": "keep",
    "course-atlas:saved:v7": "future",
  });
  const result = migrateBrowserStorage(store);
  const saved = JSON.parse(store.getItem("course-atlas:saved-instructors:v1"));
  assert.equal(saved[0].name, "New");
  assert.deepEqual(
    saved[0].courses.map((item) => item.id),
    ["CSE2221", "MATH1151"],
  );
  assert.equal(store.getItem("course-atlas:saved-instructors:v0"), null);
  assert.equal(store.getItem("course-atlas:people-directory:v2"), null);
  assert.equal(store.getItem("course-atlas:unknown:v1"), "keep");
  assert.equal(store.getItem("another-app"), "keep");
  assert.equal(store.getItem("course-atlas:saved:v7"), "future");
  assert.equal(result.merged, 1);
  assert.equal(migrateBrowserStorage(store).merged, 0);
});
test("corrupt important data and unsuccessful writes retain all recoverable originals", () => {
  const original = JSON.stringify([{ id: "course-a", sections: [] }]);
  const corrupt = storage({
    "course-atlas:saved:v0": original,
    "course-atlas:saved:v1": "{broken",
  });
  migrateBrowserStorage(corrupt);
  assert.equal(corrupt.getItem("course-atlas:saved:v0"), original);
  assert.equal(corrupt.getItem("course-atlas:saved:v1"), "{broken");
  const quota = storage({ "course-atlas:saved:v0": original });
  quota.setItem = () => {
    throw Error("quota");
  };
  migrateBrowserStorage(quota);
  assert.equal(quota.getItem("course-atlas:saved:v0"), original);
});
test("saved array merges preserve current details and union scalar and linked identifiers", () => {
  assert.deepEqual(
    mergeStoredData(
      [{ id: "one", title: "Old", tags: ["A"] }],
      [{ id: "one", title: "New", tags: ["B"] }],
    ),
    [{ id: "one", title: "New", tags: ["A", "B"] }],
  );
});
test("factory previews and guide replays never write through to real profile data", () => {
  const local = storage({
    "course-atlas:locale:v1": "zh",
    "course-atlas:saved:v1": '[{"id":"real"}]',
    "course-atlas:translation-guide:v1": "done",
  });
  globalThis.localStorage = local;
  globalThis.sessionStorage = storage();
  globalThis.window = {
    localStorage: local,
    sessionStorage: globalThis.sessionStorage,
    __COURSE_ATLAS_DEBUG__: { factory: true },
  };
  const virtual = browserStorage();
  assert.equal(virtual.getItem("course-atlas:saved:v1"), null);
  virtual.setItem("course-atlas:saved:v1", '[{"id":"test"}]');
  assert.equal(local.getItem("course-atlas:saved:v1"), '[{"id":"real"}]');
  window.__COURSE_ATLAS_DEBUG__ = { factory: false, replayTranslation: true };
  assert.equal(virtual.getItem("course-atlas:saved:v1"), '[{"id":"real"}]');
  assert.equal(virtual.getItem("course-atlas:translation-guide:v1"), null);
  virtual.setItem("course-atlas:translation-guide:v1", "settings");
  assert.equal(local.getItem("course-atlas:translation-guide:v1"), "done");
  window.__COURSE_ATLAS_DEBUG__ = {};
  assert.equal(virtual.getItem("course-atlas:translation-guide:v1"), "done");
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
});

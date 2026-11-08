import assert from "node:assert/strict";
import test from "node:test";
import {
  getWatchSelection,
  saveWatchSelection,
  WATCH_SELECTION_KEY,
} from "../../src/lib/catalog/watch-selection.ts";

test("remembers only selected identities, scoped to course/term/campus, with stable snapshots", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  let notifications = 0;
  globalThis.window = { dispatchEvent: () => notifications++ };
  saveWatchSelection("1268:ANTHROP:2200:COL", ["100", "101", "100"]);
  const selected = getWatchSelection("1268:ANTHROP:2200:COL");
  assert.deepEqual(selected, ["100", "101"]);
  assert.equal(getWatchSelection("1268:ANTHROP:2200:COL"), selected);
  assert.deepEqual(getWatchSelection("1272:ANTHROP:2200:COL"), []);
  assert.deepEqual(getWatchSelection("1268:ANTHROP:2200:LMA"), []);
  assert.deepEqual(JSON.parse(values.get(WATCH_SELECTION_KEY)), {
    "1268:ANTHROP:2200:COL": ["100", "101"],
  });
  // An unavailable write must not discard this session's in-memory choice on read.
  globalThis.localStorage.setItem = () => {
    throw new Error("quota");
  };
  saveWatchSelection("1268:ANTHROP:2200:COL", ["102"]);
  assert.deepEqual(getWatchSelection("1268:ANTHROP:2200:COL"), ["102"]);
  assert.equal(notifications, 2);
  delete globalThis.window;
  delete globalThis.localStorage;
});

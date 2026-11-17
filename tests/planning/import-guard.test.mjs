import { test } from "node:test";
import assert from "node:assert/strict";
import { ImportGuard } from "../../src/lib/planning/import-guard.ts";
test("late import completion cannot overwrite an edit, load or deletion", async () => {
  for (const action of ["edit", "load", "delete"]) {
    const guard = new ImportGuard();
    const token = guard.start();
    let state = "original";
    let resolve;
    const work = new Promise((r) => {
      resolve = r;
    });
    const pending = work.then((value) => {
      if (guard.current(token.generation)) state = value;
    });
    guard.invalidate();
    state = action;
    resolve("stale import");
    await pending;
    assert.equal(token.signal.aborted, true);
    assert.equal(state, action);
  }
});
test("a newer import keeps its own cancellation and commit generation", () => {
  const guard = new ImportGuard();
  const first = guard.start();
  const second = guard.start();
  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, false);
  assert.equal(guard.current(first.generation), false);
  assert.equal(guard.current(second.generation), true);
});

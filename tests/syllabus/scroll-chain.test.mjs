import test from "node:test";
import assert from "node:assert/strict";
import { splitScrollDelta } from "../../src/lib/syllabus/scroll-chain.ts";

test("short and exhausted documents pass the whole gesture to the panel", () => {
  assert.deepEqual(splitScrollDelta(0, 0, 120), { next: 0, remainder: 120 });
  assert.deepEqual(splitScrollDelta(0, -10, -80), { next: 0, remainder: -80 });
  assert.deepEqual(splitScrollDelta(500, 500, 120), {
    next: 500,
    remainder: 120,
  });
});
test("only the unused portion of a boundary-crossing gesture chains", () => {
  assert.deepEqual(splitScrollDelta(470, 500, 120), {
    next: 500,
    remainder: 90,
  });
  assert.deepEqual(splitScrollDelta(30, 500, -120), {
    next: 0,
    remainder: -90,
  });
  assert.deepEqual(splitScrollDelta(200, 500, 120), {
    next: 320,
    remainder: 0,
  });
});

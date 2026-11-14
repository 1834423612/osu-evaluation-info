import test from "node:test";
import assert from "node:assert/strict";
import { createScrollOwnership } from "../../src/lib/syllabus/scroll-intent.ts";
test("fast wheel bursts stay in the hovered document, including the event that reaches its edge", () => {
  const choose = createScrollOwnership(),
    document = {};
  assert.equal(choose(240, 100, document, true), "inner");
  assert.equal(choose(500, 120, document, true), "inner");
  assert.equal(choose(800, 140, document, false), "inner");
  assert.equal(choose(160, 400, document, false), "outer");
  assert.equal(choose(-400, 420, document, true), "inner");
});
test("a fresh touch swipe at an exhausted boundary can move the panel on small screens", () => {
  const choose = createScrollOwnership(),
    document = {};
  assert.equal(choose(60, 100, document, true), "inner");
  assert.equal(choose(200, 130, document, false), "inner");
  choose.begin();
  assert.equal(choose(30, 160, document, false), "outer");
});
test("pointer changes reset ownership without requiring velocity samples", () => {
  const choose = createScrollOwnership();
  assert.equal(choose(200, 100, "one", false), "outer");
  assert.equal(choose(200, 120, "two", true), "inner");
  assert.equal(choose(NaN, 121, "two", true), "inner");
});

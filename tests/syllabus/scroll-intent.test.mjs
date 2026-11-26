import test from "node:test";
import assert from "node:assert/strict";
import {
  attachPreviewScrolling,
  canScrollBy,
} from "../../src/lib/syllabus/scroll-intent.ts";

test("an exhausted document hands movement to its parent immediately, even within the same gesture", () => {
  const document = { scrollTop: 80, scrollHeight: 200, clientHeight: 100 };
  assert.equal(canScrollBy(document, 240), true);
  document.scrollTop = 100;
  assert.equal(canScrollBy(document, 80), false);
  assert.equal(canScrollBy(document, -80), true);
  document.scrollTop = 0;
  assert.equal(canScrollBy(document, -80), false);
  assert.equal(canScrollBy(document, 0), false);
});

test("ordinary nested panels retain native wheel and touch handling", () => {
  const listeners = [];
  const reader = {
    dataset: {},
    addEventListener: (...args) => listeners.push(args),
    removeEventListener() {},
  };
  const detach = attachPreviewScrolling(reader);
  assert.equal(
    listeners.length,
    0,
    "in-document scrolling must not install event cancellation traps",
  );
  detach();
});

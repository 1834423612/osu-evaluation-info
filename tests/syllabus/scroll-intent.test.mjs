import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewScrollIntent } from "../../src/lib/syllabus/scroll-intent.ts";

test("slow scrolling stays in the document; a quick burst temporarily previews the panel", () => {
  const intent = createPreviewScrollIntent();
  assert.equal(intent(40, 100), false);
  assert.equal(intent(40, 300), false);
  assert.equal(intent(200, 600), true);
  assert.equal(intent(50, 640), true);
  assert.equal(intent(40, 900), false);
  assert.equal(intent(100, 1000), false);
  assert.equal(intent(100, 1030), false);
  assert.equal(intent(100, 1060), true);
  assert.equal(intent(-20, 1080), false);
});
test("touch intent distinguishes a fast swipe from small deliberate reading gestures", () => {
  const intent = createPreviewScrollIntent();
  assert.equal(intent(5, 100, true), false);
  assert.equal(intent(5, 130, true), false);
  assert.equal(intent(50, 150, true), true);
  assert.equal(intent(5, 400, true), false);
});

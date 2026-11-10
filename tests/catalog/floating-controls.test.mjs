import assert from "node:assert/strict";
import test from "node:test";
import { placeCornerControl } from "../../src/lib/layout/scroll-to-top.ts";

test("corner control stays within the visual viewport and clears stacked floating widgets", () => {
  for (const width of [320, 390, 768, 1440]) {
    const viewport = { left: 0, top: 0, width, height: 800 };
    const original = placeCornerControl(viewport, []);
    assert(original.x > width - 70 && original.y > 730);
    const obstacles = [
      { left: width - 310, right: width - 10, top: 600, bottom: 790 },
      { left: width - 80, right: width, top: 500, bottom: 590 },
    ];
    const result = placeCornerControl(viewport, obstacles);
    assert(result);
    assert(
      result.x >= 16 &&
        result.y >= 16 &&
        result.x + 42 <= width - 16 &&
        result.y + 42 <= 784,
    );
    obstacles.forEach((rect) =>
      assert(
        result.x + 42 <= rect.left - 12 ||
          result.x >= rect.right + 12 ||
          result.y + 42 <= rect.top - 12 ||
          result.y >= rect.bottom + 12,
      ),
    );
  }
});
test("full-screen covers hide the control, and keyboard offsets constrain placement", () => {
  assert.equal(
    placeCornerControl({ left: 0, top: 0, width: 320, height: 640 }, [
      { left: 0, top: 0, right: 320, bottom: 640 },
    ]),
    null,
  );
  const result = placeCornerControl(
    { left: 15, top: 50, width: 320, height: 300 },
    [],
  );
  assert(result.x >= 31 && result.y >= 66 && result.y + 42 <= 334);
});

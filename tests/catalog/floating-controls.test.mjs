import assert from "node:assert/strict";
import test from "node:test";
import {
  placeCornerControl,
  cornerControlMetrics,
} from "../../src/lib/layout/scroll-to-top.ts";

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

test("pinch zoom preserves screen size, edge insets and scroll visibility through panning", () => {
  for (const zoom of [0.75, 1, 1.5, 2, 3, 5]) {
    for (const [left, top] of [
      [0, 0],
      [75, 130],
    ]) {
      const viewport = { left, top, width: 390 / zoom, height: 900 / zoom };
      const metrics = cornerControlMetrics(viewport, zoom);
      const result = placeCornerControl(
        viewport,
        [],
        metrics.size,
        metrics.inset,
        metrics.gap,
      );
      assert(result);
      assert(Math.abs(metrics.size * zoom - 42) < 0.001);
      assert(
        Math.abs(
          (left + viewport.width - result.x - metrics.size) * zoom - 16,
        ) < 0.001,
      );
      assert(
        Math.abs(
          (top + viewport.height - result.y - metrics.size) * zoom - 16,
        ) < 0.001,
      );
      assert.equal(metrics.scrollThreshold, 400);
    }
  }
});

test("zoomed obstacle avoidance keeps the same visible clearance and hides behind covers", () => {
  for (const zoom of [1, 1.5, 2, 4]) {
    const viewport = {
      left: 60,
      top: 95,
      width: 390 / zoom,
      height: 800 / zoom,
    };
    const { size, inset, gap } = cornerControlMetrics(viewport, zoom);
    const right = viewport.left + viewport.width,
      bottom = viewport.top + viewport.height;
    const widget = {
      left: right - 100 / zoom,
      right,
      top: bottom - 80 / zoom,
      bottom,
    };
    const result = placeCornerControl(viewport, [widget], size, inset, gap);
    assert(result);
    assert(
      result.x + size <= widget.left - gap ||
        result.y + size <= widget.top - gap,
    );
    assert.equal(
      placeCornerControl(
        viewport,
        [{ left: viewport.left, top: viewport.top, right, bottom }],
        size,
        inset,
        gap,
      ),
      null,
    );
  }
});

test("missing or invalid visual zoom defaults to normal geometry; keyboard resize remains independent", () => {
  const viewport = { left: 0, top: 0, width: 390, height: 300 };
  for (const zoom of [undefined, 0, -1, NaN, Infinity])
    assert.deepEqual(cornerControlMetrics(viewport, zoom), {
      inverseScale: 1,
      size: 42,
      inset: 16,
      gap: 12,
      scrollThreshold: 150,
    });
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

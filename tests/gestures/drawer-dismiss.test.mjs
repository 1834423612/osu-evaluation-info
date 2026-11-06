import assert from "node:assert/strict";
import { it } from "node:test";
import {
  moveDrawerDrag,
  shouldDismissDrawer,
} from "../../src/lib/gestures/drawer-dismiss.ts";

function drag() {
  return { x: 100, y: 50, time: 0, axis: "pending", distance: 0 };
}

it("accepts a deliberate downward pull or short fast flick", () => {
  const slow = drag();
  assert.equal(moveDrawerDrag(slow, 105, 130), 80);
  assert.equal(shouldDismissDrawer(slow, 1000), true);
  const flick = drag();
  moveDrawerDrag(flick, 100, 85);
  assert.equal(shouldDismissDrawer(flick, 50), true);
});

it("rejects taps, short slow pulls, horizontal and upward starts", () => {
  for (const [x, y, time] of [
    [100, 50, 10],
    [100, 75, 20],
    [100, 90, 500],
    [180, 130, 100],
    [100, 20, 100],
  ]) {
    const gesture = drag();
    moveDrawerDrag(gesture, x, y);
    assert.equal(shouldDismissDrawer(gesture, time), false);
  }
  const sideways = drag();
  moveDrawerDrag(sideways, 150, 55);
  moveDrawerDrag(sideways, 100, 200);
  assert.equal(shouldDismissDrawer(sideways, 200), false);
});

it("rejects a downward pull that reverses or ends diagonally", () => {
  for (const [x, y] of [
    [100, 60],
    [240, 150],
  ]) {
    const gesture = drag();
    moveDrawerDrag(gesture, 100, 180);
    moveDrawerDrag(gesture, x, y);
    assert.equal(shouldDismissDrawer(gesture, 300), false);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  adjacentTabValue,
  tabSwipeDirection,
} from "../../src/lib/gestures/tab-swipe.ts";

test("swipes traverse every registered visible tab in order, including added and reordered tabs", () => {
  assert.equal(
    adjacentTabValue(["sections", "ratings", "syllabus"], "ratings", 1),
    "syllabus",
  );
  assert.equal(
    adjacentTabValue(
      ["sections", "syllabus", "future", "ratings"],
      "syllabus",
      1,
    ),
    "future",
  );
  assert.equal(
    adjacentTabValue(["sections", "syllabus", "ratings"], "ratings", -1),
    "syllabus",
  );
  assert.equal(
    adjacentTabValue(["sections", "ratings"], "ratings", 1),
    undefined,
  );
  assert.equal(
    adjacentTabValue(["sections", "ratings"], "sections", -1),
    undefined,
  );
  assert.equal(adjacentTabValue(["sections"], "missing", 1), undefined);
});

test("vertical reading, small swipes and diagonal gestures do not switch tabs", () => {
  const start = { x: 100, y: 100 };
  assert.equal(tabSwipeDirection(start, { x: 20, y: 105 }), 1);
  assert.equal(tabSwipeDirection(start, { x: 180, y: 105 }), -1);
  assert.equal(tabSwipeDirection(start, { x: 90, y: 200 }), 0);
  assert.equal(tabSwipeDirection(start, { x: 50, y: 100 }), 0);
  assert.equal(tabSwipeDirection(start, { x: 20, y: 200 }), 0);
});

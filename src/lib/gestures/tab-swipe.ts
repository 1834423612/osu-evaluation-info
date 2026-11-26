/** Vertical reading and short diagonal movements remain native gestures. */
export function tabSwipeDirection(
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x,
    dy = end.y - start.y;
  return Math.abs(dx) >= 60 && Math.abs(dx) >= Math.abs(dy) * 1.25
    ? dx < 0
      ? 1
      : -1
    : 0;
}

/** Values come from the visible registered triggers, in their rendered order. */
export function adjacentTabValue(
  values: readonly string[],
  active: string,
  direction: number,
) {
  const index = values.indexOf(active);
  return index < 0 || !direction ? undefined : values[index + direction];
}

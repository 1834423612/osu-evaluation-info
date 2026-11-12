/** Consume only the distance available in a scroller; preserve the remainder. */
export function splitScrollDelta(top: number, height: number, delta: number) {
  const next = Math.max(0, Math.min(Math.max(0, height), top + delta));
  return { next, remainder: delta - (next - top) };
}

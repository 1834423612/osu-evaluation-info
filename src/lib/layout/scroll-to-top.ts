export function scrollPageToTop() {
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

export type FloatingRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
export type FloatingViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
};
export function placeCornerControl(
  viewport: FloatingViewport,
  obstacles: FloatingRect[],
  size = 42,
  inset = 16,
) {
  const left = viewport.left + inset,
    top = viewport.top + inset;
  const right = viewport.left + viewport.width - inset - size;
  const bottom = viewport.top + viewport.height - inset - size;
  const gap = 12;
  const xs = [right, ...obstacles.map((item) => item.left - size - gap)];
  const ys = [bottom, ...obstacles.map((item) => item.top - size - gap)];
  let best: { x: number; y: number; distance: number } | null = null;
  for (const x of xs)
    for (const y of ys) {
      if (x < left || x > right || y < top || y > bottom) continue;
      if (
        obstacles.some(
          (item) =>
            x < item.right + gap &&
            x + size > item.left - gap &&
            y < item.bottom + gap &&
            y + size > item.top - gap,
        )
      )
        continue;
      const distance = (right - x) * 1.15 + bottom - y;
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  return best ? { x: best.x, y: best.y } : null;
}

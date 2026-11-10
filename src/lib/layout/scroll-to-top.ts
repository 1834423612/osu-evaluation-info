export function scrollPageToTop() {
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
  const viewport = window.visualViewport;
  if (
    viewport &&
    (viewport.scale !== 1 || viewport.offsetLeft || viewport.offsetTop)
  ) {
    // Scroll both viewports back to the origin without resetting the user's pinch zoom.
    document.documentElement.scrollIntoView({
      block: "start",
      inline: "start",
      behavior,
    });
    return;
  }
  window.scrollTo({
    top: 0,
    left: 0,
    behavior,
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

/** DOM geometry uses layout CSS pixels; pinch zoom must not enlarge this screen control. */
export function cornerControlMetrics(viewport: FloatingViewport, zoom = 1) {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const inverseScale = 1 / scale;
  return {
    inverseScale,
    size: 42 * inverseScale,
    inset: 16 * inverseScale,
    gap: 12 * inverseScale,
    // Pinching alone does not count as scrolling farther down the document.
    scrollThreshold: Math.min(400, viewport.height * scale * 0.5),
  };
}

export function placeCornerControl(
  viewport: FloatingViewport,
  obstacles: FloatingRect[],
  size = 42,
  inset = 16,
  gap = 12,
) {
  const left = viewport.left + inset,
    top = viewport.top + inset;
  const right = viewport.left + viewport.width - inset - size;
  const bottom = viewport.top + viewport.height - inset - size;
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

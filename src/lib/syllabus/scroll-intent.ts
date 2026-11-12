import { splitScrollDelta } from "./scroll-math.ts";

/** A brief gesture burst, not a persistent mode. Direction changes reset it. */
export function createPreviewScrollIntent() {
  let last = -Infinity,
    direction = 0,
    fastUntil = 0;
  let samples: { at: number; distance: number }[] = [];
  const sample = (delta: number, now: number, touch = false) => {
    const sign = Math.sign(delta);
    if (!sign || !Number.isFinite(delta)) return false;
    if (now - last > 140 || sign !== direction) {
      samples = [];
      fastUntil = 0;
    }
    const gap = now - last;
    last = now;
    direction = sign;
    samples = samples.filter((sample) => now - sample.at <= 120).slice(-63);
    samples.push({ at: now, distance: Math.abs(delta) });
    const fast = touch
      ? Math.abs(delta) >= 18 &&
        gap > 0 &&
        gap < 80 &&
        Math.abs(delta) / gap >= 1.2
      : Math.abs(delta) >= 180 ||
        (samples.length >= 3 &&
          samples.reduce((sum, sample) => sum + sample.distance, 0) >= 280);
    if (fast) fastUntil = now + 140;
    return now < fastUntil;
  };
  return Object.assign(sample, {
    begin: (now: number) => {
      last = now;
      samples = [];
      direction = 0;
      fastUntil = 0;
    },
  });
}

const intents = new WeakMap<
  Element,
  ReturnType<typeof createPreviewScrollIntent>
>();
function intentFor(anchor: Element) {
  const reader = anchor.closest("[data-syllabus-reader]");
  if (!reader || anchor.ownerDocument.fullscreenElement) return null;
  let intent = intents.get(reader);
  if (!intent) {
    intent = createPreviewScrollIntent();
    intents.set(reader, intent);
  }
  return intent;
}
export function previewScrollIntent(
  anchor: Element,
  delta: number,
  now: number,
  touch = false,
) {
  return intentFor(anchor)?.(delta, now, touch) ?? false;
}
export function beginPreviewTouch(anchor: Element, now: number) {
  intentFor(anchor)?.begin(now);
}
function panelFor(anchor: Element) {
  for (
    let node = anchor.closest<HTMLElement>("[data-syllabus-reader]");
    node;
    node = node.parentElement
  ) {
    if (
      /auto|scroll/.test(getComputedStyle(node).overflowY) &&
      node.scrollHeight > node.clientHeight + 1
    )
      return node;
  }
  return null;
}
export function scrollPreviewPanel(anchor: Element, delta: number) {
  const panel = panelFor(anchor);
  if (!panel) return false;
  const part = splitScrollDelta(
    panel.scrollTop,
    panel.scrollHeight - panel.clientHeight,
    delta,
  );
  if (Math.abs(part.next - panel.scrollTop) < 0.5) return false;
  panel.scrollTop = part.next;
  return true;
}
/** Long reading regions share preview intent; choice lists keep native gestures. */
export function attachPreviewScrolling(reader: HTMLElement) {
  const nested = (target: EventTarget | null) => {
    if (
      !(target instanceof Element) ||
      target.closest(
        "input,textarea,select,[contenteditable=true],[data-debug-tools],[data-translation-popover],[data-native-syllabus-scroll]",
      )
    )
      return null;
    const panel = panelFor(reader);
    for (
      let node: Element | null = target;
      node && node !== panel;
      node = node.parentElement
    ) {
      if (
        /auto|scroll/.test(getComputedStyle(node).overflowY) &&
        node.scrollHeight > node.clientHeight + 1
      )
        return node as HTMLElement;
    }
    return null;
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
      return;
    const target = nested(event.target);
    if (!target) return;
    const delta =
      event.deltaY *
      (event.deltaMode === 1
        ? 24
        : event.deltaMode === 2
          ? reader.clientHeight
          : 1);
    if (
      previewScrollIntent(reader, delta, performance.now()) &&
      scrollPreviewPanel(reader, delta)
    ) {
      event.preventDefault();
      return;
    }
    // Keep slow wheel gestures attached to the hovered region after previewing.
    const panel = panelFor(reader);
    let remaining = delta,
      moved = false;
    for (
      let node: HTMLElement | null = target;
      node;
      node = node.parentElement
    ) {
      if (/auto|scroll/.test(getComputedStyle(node).overflowY)) {
        const part = splitScrollDelta(
          node.scrollTop,
          node.scrollHeight - node.clientHeight,
          remaining,
        );
        moved ||= Math.abs(part.next - node.scrollTop) > 0.5;
        node.scrollTop = part.next;
        remaining = part.remainder;
      }
      if (Math.abs(remaining) < 0.5 || node === panel) break;
    }
    if (moved) event.preventDefault();
  };
  let position: { x: number; y: number } | null = null;
  const start = (event: TouchEvent) => {
    beginPreviewTouch(reader, performance.now());
    position =
      event.touches.length === 1
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
        : null;
  };
  const move = (event: TouchEvent) => {
    if (!position || event.touches.length !== 1) {
      position = null;
      return;
    }
    const next = event.touches[0],
      dy = position.y - next.clientY,
      dx = position.x - next.clientX;
    position = { x: next.clientX, y: next.clientY };
    if (
      event.cancelable &&
      Math.abs(dy) >= Math.abs(dx) &&
      nested(event.target) &&
      previewScrollIntent(reader, dy, performance.now(), true) &&
      scrollPreviewPanel(reader, dy)
    )
      event.preventDefault();
  };
  reader.addEventListener("wheel", wheel, { capture: true, passive: false });
  reader.addEventListener("touchstart", start, {
    capture: true,
    passive: true,
  });
  reader.addEventListener("touchmove", move, { capture: true, passive: false });
  return () => {
    reader.removeEventListener("wheel", wheel, true);
    reader.removeEventListener("touchstart", start, true);
    reader.removeEventListener("touchmove", move, true);
  };
}

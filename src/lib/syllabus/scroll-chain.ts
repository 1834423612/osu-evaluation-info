import { splitScrollDelta } from "./scroll-math.ts";
import {
  beginPreviewTouch,
  previewScrollIntent,
  scrollPreviewPanel,
} from "./scroll-intent.ts";
export { splitScrollDelta } from "./scroll-math.ts";

/** Browsers do not reliably chain scrolling across an iframe boundary. */
export function attachSyllabusScrollChain(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc) return () => {};
  const root = doc.scrollingElement ?? doc.documentElement;
  function forward(delta: number) {
    if (frame.ownerDocument.fullscreenElement) return false;
    const own = splitScrollDelta(
      root.scrollTop,
      root.scrollHeight - root.clientHeight,
      delta,
    );
    if (Math.abs(own.remainder) < 0.5) return false;
    let remaining = own.remainder;
    let moved = false;
    for (let node = frame.parentElement; node; node = node.parentElement) {
      if (!/auto|scroll/.test(getComputedStyle(node).overflowY)) continue;
      const part = splitScrollDelta(
        node.scrollTop,
        node.scrollHeight - node.clientHeight,
        remaining,
      );
      node.scrollTop = part.next;
      moved ||= Math.abs(remaining - part.remainder) > 0.5;
      remaining = part.remainder;
      if (Math.abs(remaining) < 0.5) break;
      // A dialog intentionally stops the chain at the page boundary.
      if (getComputedStyle(node).overscrollBehaviorY !== "auto") break;
    }
    if (moved) root.scrollTop = own.next;
    return moved;
  }
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
      return;
    const unit =
      event.deltaMode === 1
        ? 24
        : event.deltaMode === 2
          ? root.clientHeight
          : 1;
    const delta = event.deltaY * unit;
    if (
      (previewScrollIntent(frame, delta, performance.now()) &&
        scrollPreviewPanel(frame, delta)) ||
      forward(delta)
    ) {
      event.preventDefault();
      return;
    }
    // Apply ordinary wheel deltas in this document too: browser wheel latching
    // can otherwise keep targeting the outer panel after a fast gesture.
    const own = splitScrollDelta(
      root.scrollTop,
      root.scrollHeight - root.clientHeight,
      delta,
    );
    if (own.next !== root.scrollTop) {
      root.scrollTop = own.next;
      event.preventDefault();
    }
  };
  let lastY: number | null = null;
  const start = (event: TouchEvent) => {
    beginPreviewTouch(frame, performance.now());
    lastY = event.touches.length === 1 ? event.touches[0].clientY : null;
  };
  const move = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      lastY = null;
      return;
    }
    const nextY = event.touches[0].clientY;
    const delta = lastY === null ? 0 : lastY - nextY;
    if (
      lastY !== null &&
      event.cancelable &&
      ((previewScrollIntent(frame, delta, performance.now(), true) &&
        scrollPreviewPanel(frame, delta)) ||
        forward(delta))
    )
      event.preventDefault();
    lastY = nextY;
  };
  doc.addEventListener("wheel", wheel, { passive: false });
  doc.addEventListener("touchstart", start, { passive: true });
  doc.addEventListener("touchmove", move, { passive: false });
  return () => {
    doc.removeEventListener("wheel", wheel);
    doc.removeEventListener("touchstart", start);
    doc.removeEventListener("touchmove", move);
  };
}

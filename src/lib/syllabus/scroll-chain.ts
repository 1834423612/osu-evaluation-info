import { splitScrollDelta } from "./scroll-math.ts";
import {
  canScrollBy,
  createScrollOwnership,
  scrollPreviewPanel,
} from "./scroll-intent.ts";
export { splitScrollDelta } from "./scroll-math.ts";

/** Keep a swipe in its document; browsers cannot chain across an iframe reliably. */
export function attachSyllabusScrollChain(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc) return () => {};
  const root = (doc.scrollingElement ?? doc.documentElement) as HTMLElement;
  const prior = root.style.overscrollBehaviorY;
  root.style.overscrollBehaviorY = "contain";
  const ownership = createScrollOwnership();
  const wheel = (event: WheelEvent) => {
    if (
      event.ctrlKey ||
      !event.cancelable ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    )
      return;
    const delta =
      event.deltaY *
      (event.deltaMode === 1
        ? 24
        : event.deltaMode === 2
          ? root.clientHeight
          : 1);
    if (
      ownership(delta, performance.now(), root, canScrollBy(root, delta)) ===
      "inner"
    ) {
      root.scrollTop = splitScrollDelta(
        root.scrollTop,
        root.scrollHeight - root.clientHeight,
        delta,
      ).next;
      event.preventDefault();
    } else if (scrollPreviewPanel(frame, delta)) event.preventDefault();
  };
  let position: { x: number; y: number } | null = null;
  const start = (event: TouchEvent) => {
    ownership.begin();
    position =
      event.touches.length === 1
        ? { x: event.touches[0].screenX, y: event.touches[0].screenY }
        : null;
  };
  const move = (event: TouchEvent) => {
    if (!position || event.touches.length !== 1) {
      position = null;
      return;
    }
    const touch = event.touches[0],
      dy = position.y - touch.screenY,
      dx = position.x - touch.screenX;
    position = { x: touch.screenX, y: touch.screenY };
    if (Math.abs(dx) > Math.abs(dy)) return;
    const owner = ownership(dy, performance.now(), root, canScrollBy(root, dy));
    if (owner === "outer" && event.cancelable) {
      scrollPreviewPanel(frame, dy);
      event.preventDefault();
    }
  };
  doc.addEventListener("wheel", wheel, { passive: false });
  doc.addEventListener("touchstart", start, { passive: true });
  doc.addEventListener("touchmove", move, { passive: false });
  return () => {
    doc.removeEventListener("wheel", wheel);
    doc.removeEventListener("touchstart", start);
    doc.removeEventListener("touchmove", move);
    root.style.overscrollBehaviorY = prior;
  };
}

/** Consume available distance and preserve the unused portion for an ancestor. */
export function splitScrollDelta(top: number, height: number, delta: number) {
  const next = Math.max(0, Math.min(Math.max(0, height), top + delta));
  return { next, remainder: delta - (next - top) };
}

export function canScrollBy(node: Element, delta: number) {
  return delta > 0
    ? node.scrollTop < node.scrollHeight - node.clientHeight - 0.5
    : delta < 0 && node.scrollTop > 0.5;
}

/** Native CSS scroll chaining is the default. This marker installs no listeners. */
export function attachNativeScrollChain(node: HTMLElement) {
  const prior = node.dataset.scrollChain;
  node.dataset.scrollChain = "native";
  return () => {
    if (prior === undefined) delete node.dataset.scrollChain;
    else node.dataset.scrollChain = prior;
  };
}

const boundarySelector =
  '[data-scroll-boundary], [data-slot="dialog-content"], [data-slot="sheet-content"], [data-slot="drawer-content"]';

/** Only iframe boundaries need a bridge; ordinary DOM scrolling stays native. */
export function scrollAncestors(anchor: Element, delta: number) {
  const doc = anchor.ownerDocument;
  if (doc.fullscreenElement || !Number.isFinite(delta)) return false;
  let remainder = delta;
  for (let node = anchor.parentElement; node; node = node.parentElement) {
    const style = doc.defaultView?.getComputedStyle(node);
    if (style && /auto|scroll/.test(style.overflowY)) {
      const part = splitScrollDelta(
        node.scrollTop,
        node.scrollHeight - node.clientHeight,
        remainder,
      );
      node.scrollTop = part.next;
      remainder = part.remainder;
    }
    if (Math.abs(remainder) < 0.5 || node.matches(boundarySelector)) break;
    if (node === doc.documentElement) {
      const root = doc.scrollingElement;
      if (root) {
        const part = splitScrollDelta(
          root.scrollTop,
          root.scrollHeight - root.clientHeight,
          remainder,
        );
        root.scrollTop = part.next;
        remainder = part.remainder;
      }
    }
  }
  return Math.abs(delta - remainder) > 0.5;
}

/** Same-origin documents keep native momentum until their actual boundary. */
export function attachFrameScrollChain(frame: HTMLIFrameElement) {
  const doc = frame.contentDocument;
  if (!doc) return () => {};
  const root = (doc.scrollingElement ?? doc.documentElement) as HTMLElement;
  const ignored = (target: EventTarget | null) => {
    const element = target as Element | null;
    return !!element?.closest?.(
      'input, textarea, select, [contenteditable="true"], [data-scroll-boundary]',
    );
  };
  const canRead = (target: EventTarget | null, delta: number) => {
    for (
      let node = target as Element | null;
      node && node !== root;
      node = node.parentElement
    ) {
      const style = doc.defaultView?.getComputedStyle(node);
      if (
        style &&
        /auto|scroll/.test(style.overflowY) &&
        canScrollBy(node, delta)
      )
        return true;
    }
    return canScrollBy(root, delta);
  };
  const wheel = (event: WheelEvent) => {
    if (
      event.ctrlKey ||
      event.shiftKey ||
      ignored(event.target) ||
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
      !canRead(event.target, delta) &&
      scrollAncestors(frame, delta) &&
      event.cancelable
    )
      event.preventDefault();
  };
  let position: { x: number; y: number } | null = null;
  const start = (event: TouchEvent) => {
    position =
      event.touches.length === 1 && !ignored(event.target)
        ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
        : null;
  };
  const move = (event: TouchEvent) => {
    if (!position || event.touches.length !== 1) {
      position = null;
      return;
    }
    const touch = event.touches[0];
    const dx = position.x - touch.clientX,
      dy = position.y - touch.clientY;
    position = { x: touch.clientX, y: touch.clientY };
    if (Math.abs(dx) > Math.abs(dy) || canRead(event.target, dy)) return;
    if (scrollAncestors(frame, dy) && event.cancelable) event.preventDefault();
  };
  const end = () => {
    position = null;
  };
  doc.addEventListener("wheel", wheel, { passive: false });
  doc.addEventListener("touchstart", start, { passive: true });
  doc.addEventListener("touchmove", move, { passive: false });
  doc.addEventListener("touchend", end, { passive: true });
  doc.addEventListener("touchcancel", end, { passive: true });
  return () => {
    doc.removeEventListener("wheel", wheel);
    doc.removeEventListener("touchstart", start);
    doc.removeEventListener("touchmove", move);
    doc.removeEventListener("touchend", end);
    doc.removeEventListener("touchcancel", end);
  };
}

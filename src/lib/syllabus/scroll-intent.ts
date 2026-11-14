import { splitScrollDelta } from "./scroll-math.ts";

/** Speed never changes ownership. A burst/swipe belongs to its initial scroller. */
export function createScrollOwnership() {
  let last = -Infinity,
    direction = 0,
    target: unknown,
    owner: "inner" | "outer" = "inner";
  const choose = (
    delta: number,
    now: number,
    nextTarget: unknown,
    canRead: boolean,
  ): "inner" | "outer" => {
    const sign = Math.sign(delta);
    if (!Number.isFinite(delta) || !sign) return owner;
    if (nextTarget !== target || sign !== direction || now - last > 180)
      owner = canRead ? "inner" : "outer";
    target = nextTarget;
    direction = sign;
    last = now;
    return owner;
  };
  return Object.assign(choose, {
    begin: () => {
      last = -Infinity;
      target = undefined;
      direction = 0;
    },
  });
}
export function canScrollBy(node: Element, delta: number) {
  return (
    Math.abs(
      splitScrollDelta(
        node.scrollTop,
        node.scrollHeight - node.clientHeight,
        delta,
      ).next - node.scrollTop,
    ) > 0.5
  );
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
  if (anchor.ownerDocument.fullscreenElement) return false;
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
/** Native touch momentum stays local; a new gesture at a boundary moves the panel. */
export function attachPreviewScrolling(reader: HTMLElement) {
  const ownership = createScrollOwnership(),
    styles = new Map<HTMLElement, string>();
  const contain = (node: HTMLElement) => {
    for (const [old, value] of styles)
      if (!reader.contains(old)) {
        old.style.overscrollBehaviorY = value;
        styles.delete(old);
      }
    if (!styles.has(node)) {
      styles.set(node, node.style.overscrollBehaviorY);
      node.style.overscrollBehaviorY = "contain";
    }
  };
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
    if (
      event.ctrlKey ||
      !event.cancelable ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
    )
      return;
    const node = nested(event.target);
    if (!node) return;
    contain(node);
    const delta =
      event.deltaY *
      (event.deltaMode === 1
        ? 24
        : event.deltaMode === 2
          ? node.clientHeight
          : 1);
    if (
      ownership(delta, performance.now(), node, canScrollBy(node, delta)) ===
      "inner"
    ) {
      node.scrollTop = splitScrollDelta(
        node.scrollTop,
        node.scrollHeight - node.clientHeight,
        delta,
      ).next;
      event.preventDefault();
    } else if (scrollPreviewPanel(reader, delta)) event.preventDefault();
  };
  let position: { x: number; y: number } | null = null;
  const start = (event: TouchEvent) => {
    ownership.begin();
    position =
      event.touches.length === 1
        ? { x: event.touches[0].screenX, y: event.touches[0].screenY }
        : null;
    const node = nested(event.target);
    if (node) contain(node);
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
    const node = nested(event.target);
    if (!node || Math.abs(dx) > Math.abs(dy)) return;
    const owner = ownership(dy, performance.now(), node, canScrollBy(node, dy));
    if (owner === "outer" && event.cancelable) {
      scrollPreviewPanel(reader, dy);
      event.preventDefault();
    }
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
    for (const [node, value] of styles) node.style.overscrollBehaviorY = value;
  };
}

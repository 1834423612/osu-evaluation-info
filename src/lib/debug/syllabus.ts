/** Geometry only: no syllabus text, credentials or browser storage values. */
export function syllabusScrollDiagnostics(doc: Document = document) {
  const regions: Record<string, unknown>[] = [];
  for (const reader of doc.querySelectorAll("[data-syllabus-reader]")) {
    for (const node of reader.querySelectorAll<HTMLElement>("*")) {
      const style = getComputedStyle(node);
      if (!/auto|scroll/.test(style.overflowY)) continue;
      regions.push({
        region: node.getAttribute("aria-label") || node.tagName.toLowerCase(),
        height: node.clientHeight,
        contentHeight: node.scrollHeight,
        top: node.scrollTop,
        overflowY: style.overflowY,
        scrollChain: style.overscrollBehaviorY,
      });
    }
    for (const frame of reader.querySelectorAll("iframe")) {
      const root = frame.contentDocument?.scrollingElement;
      if (root)
        regions.push({
          region: frame.title,
          iframe: true,
          height: root.clientHeight,
          contentHeight: root.scrollHeight,
          top: root.scrollTop,
        });
    }
  }
  return {
    capturedAt: new Date().toISOString(),
    viewport: { width: innerWidth, height: innerHeight },
    regions,
  };
}

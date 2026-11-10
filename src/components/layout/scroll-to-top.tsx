"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp } from "lucide-react";
import { type Locale, text } from "@/lib/i18n";
import {
  placeCornerControl,
  cornerControlMetrics,
  scrollPageToTop,
  type FloatingRect,
} from "@/lib/layout/scroll-to-top";
import styles from "./scroll-to-top.module.css";

const OBSTACLES =
  '.app-header, .site-footer a, .footer-disclaimer, .course-pagination, [data-floating-obstacle], [data-translation-guide-target], [data-translation-guide] [role="region"], .action-toast, [data-language-notice], [data-debug-tools], [data-translation-popover][role="menu"], [data-radix-popper-content-wrapper]';

export function ScrollToTop({ locale }: { locale: Locale }) {
  const [placement, setPlacement] = useState<{
    x: number;
    y: number;
    inverseScale: number;
  } | null>(null);
  useEffect(() => {
    let frame = 0,
      motionUntil = 0;
    let targets = new Set<Element>();
    const resize = new ResizeObserver(() => schedule());
    function visible(element: Element) {
      const style = getComputedStyle(element);
      return (
        element.getClientRects().length > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        Number(style.opacity) > 0
      );
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    function measure() {
      frame = 0;
      const viewport = window.visualViewport;
      const bounds = {
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? innerWidth,
        height: viewport?.height ?? innerHeight,
      };
      const metrics = cornerControlMetrics(bounds, viewport?.scale);
      const modal =
        getComputedStyle(document.body).pointerEvents === "none" ||
        [
          ...document.querySelectorAll(
            '[role="dialog"][aria-modal="true"], [data-translation-download], [data-slot="drawer-content"][data-state="open"], [data-slot="sheet-content"][data-state="open"]',
          ),
        ].some(visible);
      let next: { x: number; y: number } | null = null;
      if (window.scrollY > metrics.scrollThreshold && !modal) {
        const elements = new Set<Element>(
          [...document.querySelectorAll(OBSTACLES)].filter(visible),
        );
        const obstacles: FloatingRect[] = [...elements].map((element) =>
          element.getBoundingClientRect(),
        );
        // Probe the prospective button and its alternatives to discover third-party fixed widgets.
        for (let pass = 0; pass < 8; pass++) {
          next = placeCornerControl(
            bounds,
            obstacles,
            metrics.size,
            metrics.inset,
            metrics.gap,
          );
          if (!next) break;
          let discovered = false;
          for (const [dx, dy] of [
            [2, 2],
            [40, 2],
            [2, 40],
            [40, 40],
            [21, 21],
          ]) {
            for (const hit of document.elementsFromPoint(
              next.x + dx * metrics.inverseScale,
              next.y + dy * metrics.inverseScale,
            )) {
              if (hit.closest("[data-scroll-top]")) continue;
              const interactive = hit.closest(
                'button, a, input, select, textarea, summary, [role="button"], [role="tab"]',
              );
              if (
                interactive &&
                !elements.has(interactive) &&
                visible(interactive)
              ) {
                elements.add(interactive);
                obstacles.push(interactive.getBoundingClientRect());
                discovered = true;
              }
              let element: Element | null = hit;
              while (
                element &&
                element !== document.body &&
                element !== document.documentElement
              ) {
                const style = getComputedStyle(element);
                if (
                  (style.position === "fixed" || style.position === "sticky") &&
                  style.pointerEvents !== "none" &&
                  !elements.has(element) &&
                  visible(element)
                ) {
                  elements.add(element);
                  obstacles.push(element.getBoundingClientRect());
                  discovered = true;
                  break;
                }
                element = element.parentElement;
              }
            }
          }
          if (!discovered) break;
          if (pass === 7) next = null;
        }
        const changed =
          elements.size !== targets.size ||
          [...elements].some((element) => !targets.has(element));
        if (changed) {
          resize.disconnect();
          elements.forEach((element) => resize.observe(element));
          targets = elements;
        }
      }
      const placed = next
        ? { ...next, inverseScale: metrics.inverseScale }
        : null;
      setPlacement((previous) =>
        previous?.x === placed?.x &&
        previous?.y === placed?.y &&
        previous?.inverseScale === placed?.inverseScale
          ? previous
          : placed,
      );
      if (performance.now() < motionUntil) schedule();
    }
    const mutation = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(record.target instanceof Element) ||
            !record.target.closest("[data-scroll-top]"),
        )
      )
        schedule();
    });
    mutation.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "hidden",
        "aria-hidden",
        "data-state",
      ],
    });
    function motion(event: Event) {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-scroll-top]")
      )
        return;
      motionUntil = performance.now() + 500;
      schedule();
    }
    window.addEventListener("scroll", schedule, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", schedule);
    viewportEvents(true);
    document.addEventListener("transitionrun", motion, true);
    document.addEventListener("transitionend", schedule, true);
    document.addEventListener("animationstart", motion, true);
    document.addEventListener("animationend", schedule, true);
    function viewportEvents(add: boolean) {
      const method = add ? "addEventListener" : "removeEventListener";
      window.visualViewport?.[method]("resize", schedule);
      window.visualViewport?.[method]("scroll", schedule);
    }
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      viewportEvents(false);
      document.removeEventListener("transitionrun", motion, true);
      document.removeEventListener("transitionend", schedule, true);
      document.removeEventListener("animationstart", motion, true);
      document.removeEventListener("animationend", schedule, true);
    };
  }, []);
  if (!placement) return null;
  return createPortal(
    <button
      type="button"
      className={styles.button}
      data-scroll-top
      aria-label={text(locale, "Back to top", "返回顶部")}
      title={text(locale, "Back to top", "返回顶部")}
      onClick={scrollPageToTop}
      style={{
        left: placement.x,
        top: placement.y,
        transform: `scale(${placement.inverseScale})`,
      }}
    >
      <ArrowUp size={18} aria-hidden="true" />
    </button>,
    document.body,
  );
}

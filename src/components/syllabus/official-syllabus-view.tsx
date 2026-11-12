"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { officialSyllabusFrame } from "@/lib/syllabus/official-render";
import { attachSyllabusScrollChain } from "@/lib/syllabus/scroll-chain";
import { text, type Locale } from "@/lib/i18n";
import type { SyllabusComponent } from "@/lib/syllabus/types";
import styles from "./official-syllabus-view.module.css";

export type SyllabusViewerPosition = { activeId: string; percent: number };

export function OfficialSyllabusView({
  components,
  locale,
  frameRef,
  zoom = 1,
  onPosition,
  onReady,
}: {
  components: SyllabusComponent[];
  locale: Locale;
  frameRef: RefObject<HTMLIFrameElement | null>;
  zoom?: number;
  onPosition?: (position: SyllabusViewerPosition) => void;
  onReady?: () => void;
}) {
  const cleanup = useRef<() => void>(() => {});
  const report = useRef<() => void>(() => {});
  const srcDoc = useMemo(
    () => officialSyllabusFrame(components, locale),
    [components, locale],
  );
  useEffect(() => () => cleanup.current(), []);
  useEffect(() => {
    const paper =
      frameRef.current?.contentDocument?.querySelector<HTMLElement>(".doc");
    if (paper) {
      paper.style.zoom = String(zoom);
      report.current();
    }
  }, [zoom, frameRef]);
  return (
    <iframe
      ref={frameRef}
      title={text(
        locale,
        "Syllabus in the official OSU layout",
        "OSU 官方版式大纲",
      )}
      className={styles.frame}
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      onLoad={() => {
        cleanup.current();
        const doc = frameRef.current?.contentDocument,
          view = frameRef.current?.contentWindow;
        if (!doc?.body || !view) return;
        const paper = doc.querySelector<HTMLElement>(".doc");
        if (paper) paper.style.zoom = String(zoom);
        const detachScroll = attachSyllabusScrollChain(frameRef.current!);
        let active = true,
          animation: number | null = null;
        const update = () => {
          if (animation !== null) return;
          animation = requestAnimationFrame(() => {
            animation = null;
            if (!active) return;
            const root = doc.scrollingElement ?? doc.documentElement;
            let activeId = components[0]?.id ?? "";
            for (const component of components) {
              const node = doc.getElementById(`syllabus-${component.id}`);
              if (node && node.getBoundingClientRect().top <= 80)
                activeId = component.id;
              else break;
            }
            const distance = root.scrollHeight - root.clientHeight;
            onPosition?.({
              activeId,
              percent:
                distance > 1
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        Math.round((root.scrollTop / distance) * 100),
                      ),
                    )
                  : 100,
            });
          });
        };
        report.current = update;
        const observer = new ResizeObserver(update);
        observer.observe(doc.body);
        view.addEventListener("scroll", update, { passive: true });
        view.addEventListener("resize", update);
        doc.fonts.ready
          .then(() => {
            if (active) {
              onReady?.();
              update();
            }
          })
          .catch(() => {});
        update();
        cleanup.current = () => {
          active = false;
          detachScroll();
          observer.disconnect();
          view.removeEventListener("scroll", update);
          view.removeEventListener("resize", update);
          if (animation !== null) cancelAnimationFrame(animation);
        };
      }}
    />
  );
}

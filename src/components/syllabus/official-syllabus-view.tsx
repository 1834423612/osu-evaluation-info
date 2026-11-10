"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { officialSyllabusFrame } from "@/lib/syllabus/official-render";
import { text, type Locale } from "@/lib/i18n";
import type { SyllabusComponent } from "@/lib/syllabus/types";
import styles from "./syllabus.module.css";

export function OfficialSyllabusView({
  components,
  locale,
  frameRef,
}: {
  components: SyllabusComponent[];
  locale: Locale;
  frameRef: RefObject<HTMLIFrameElement | null>;
}) {
  const [height, setHeight] = useState(600);
  const cleanup = useRef<() => void>(() => {});
  const srcDoc = useMemo(
    () => officialSyllabusFrame(components, locale),
    [components, locale],
  );
  useEffect(() => () => cleanup.current(), []);
  return (
    <iframe
      ref={frameRef}
      title={text(
        locale,
        "Syllabus in the official OSU layout",
        "OSU 官方版式大纲",
      )}
      className={styles.officialFrame}
      style={{ height }}
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      onLoad={() => {
        cleanup.current();
        const frame = frameRef.current,
          doc = frame?.contentDocument;
        if (!doc?.body) return;
        let active = true;
        const measure = () => {
          if (active)
            setHeight(
              Math.ceil(
                Math.max(
                  doc.body.scrollHeight,
                  doc.body.getBoundingClientRect().height,
                ),
              ) + 2,
            );
        };
        const observer = new ResizeObserver(measure);
        observer.observe(doc.body);
        doc.fonts.ready.then(measure).catch(() => {});
        measure();
        cleanup.current = () => {
          active = false;
          observer.disconnect();
        };
      }}
    />
  );
}

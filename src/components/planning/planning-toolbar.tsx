"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { text, type Locale } from "@/lib/i18n";
import styles from "./planning-toolbar.module.css";
export function PlanningToolbar({
  locale,
  children,
}: {
  title: string;
  locale: Locale;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    anchor = useRef<HTMLSpanElement>(null),
    [stuck, setStuck] = useState(false);
  useEffect(() => {
    const toolbar = root.current,
      main = toolbar?.closest("main");
    let intersection: IntersectionObserver | undefined;
    const measure = () => {
      if (!toolbar) return;
      const top = parseFloat(getComputedStyle(toolbar).top) || 0;
      main?.style.setProperty(
        "--planning-tools-offset",
        Math.ceil(toolbar.getBoundingClientRect().height + top + 16) + "px",
      );
      intersection?.disconnect();
      intersection = new IntersectionObserver(
        ([entry]) =>
          setStuck(!entry.isIntersecting && entry.boundingClientRect.top < top),
        { rootMargin: "-" + top + "px 0px 0px 0px", threshold: [0, 1] },
      );
      if (anchor.current) intersection.observe(anchor.current);
    };
    const observer = new ResizeObserver(measure);
    if (toolbar) observer.observe(toolbar);
    measure();
    return () => {
      observer.disconnect();
      intersection?.disconnect();
      main?.style.removeProperty("--planning-tools-offset");
    };
  }, []);
  return (
    <>
      <span ref={anchor} className={styles.anchor} aria-hidden="true" />
      <div
        ref={root}
        className={styles.toolbar}
        data-stuck={stuck || undefined}
        role="region"
        aria-label={text(locale, "Planning tools", "规划工具栏")}
        data-telemetry-private
      >
        <div className={styles.panel}>{children}</div>
      </div>
    </>
  );
}

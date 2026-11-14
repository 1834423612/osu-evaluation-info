"use client";
import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ANALYTICS_EVENT } from "@/lib/analytics/privacy";
import {
  recordProductEvents,
  recordPageView,
  resetCourseOpen,
  telemetryAllowed,
  flushTelemetry,
  telemetryBeacon,
  discardTelemetry,
} from "@/lib/telemetry/client";
import { readLocalItems } from "@/lib/saved/local";
import { itemKey } from "@/lib/saved/exchange";
import { savedScope } from "@/lib/saved/scope";
import { syncApplicationActive } from "@/lib/saved/provenance";
export function ProductAnalytics() {
  const pathname = usePathname(),
    params = useSearchParams(),
    selected = params.get("course");
  useEffect(() => {
    if (recordPageView(pathname)) resetCourseOpen();
  }, [pathname]);
  useEffect(() => {
    if (!selected) resetCourseOpen();
  }, [selected]);
  useEffect(() => {
    let previous = new Set<string>(),
      scope = savedScope();
    try {
      previous = new Set(readLocalItems().map(itemKey));
    } catch {}
    function favorites(event: Event) {
      try {
        const current = new Set(readLocalItems().map(itemKey)),
          currentScope = savedScope();
        if (
          event.type !== "storage" &&
          currentScope === scope &&
          !syncApplicationActive()
        )
          recordProductEvents([
            ...[...current]
              .filter((x) => !previous.has(x))
              .map((entity) => ({ type: "favorite_add" as const, entity })),
            ...[...previous]
              .filter((x) => !current.has(x))
              .map((entity) => ({ type: "favorite_remove" as const, entity })),
          ]);
        previous = current;
        scope = currentScope;
      } catch {
        /* A failed read is not a removal. */
      }
    }
    const reconnect = () => void flushTelemetry();
    const hidden = () => {
      if (document.visibilityState === "hidden" && !telemetryBeacon())
        void flushTelemetry(true);
    };
    const preferences = () => {
      if (!telemetryAllowed()) void discardTelemetry().catch(() => {});
    };
    window.addEventListener("course-atlas:preferences", favorites);
    window.addEventListener("storage", favorites);
    window.addEventListener("online", reconnect);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener(ANALYTICS_EVENT, preferences);
    void flushTelemetry();
    return () => {
      window.removeEventListener("course-atlas:preferences", favorites);
      window.removeEventListener("storage", favorites);
      window.removeEventListener("online", reconnect);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener(ANALYTICS_EVENT, preferences);
    };
  }, []);
  return null;
}

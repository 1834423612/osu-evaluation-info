"use client";

import { useEffect } from "react";
import Script from "next/script";
import { normalizeCourseSearch } from "@/lib/analytics";

type EventProperties = Record<string, string | number | boolean>;
type PendingEvent = { name: string; properties: EventProperties };

declare global {
  interface Window {
    umami?: {
      track: (name: string, properties?: EventProperties) => void;
    };
  }
}

const pendingEvents: PendingEvent[] = [];
const scrollDepths = new WeakMap<Element, Set<number>>();

export function trackUmamiEvent(name: string, properties: EventProperties) {
  if (window.umami?.track) {
    window.umami.track(name, properties);
    return;
  }
  if (pendingEvents.length < 100) pendingEvents.push({ name, properties });
}

function flushPendingEvents() {
  const tracker = window.umami;
  if (!tracker?.track) return;
  while (pendingEvents.length) {
    const event = pendingEvents.shift();
    if (event) tracker.track(event.name, event.properties);
  }
}

function areaFor(element: Element) {
  const explicit = element.closest("[data-analytics-area]");
  if (explicit) return explicit.getAttribute("data-analytics-area") ?? "page";
  if (element.closest(".course-detail-drawer, .course-detail-panel"))
    return "course_details";
  if (element.closest(".mobile-filter-panel, .desktop-filters"))
    return "course_filters";
  if (element.closest(".course-card")) return "course_card";
  if (element.closest(".results-area")) return "course_results";
  if (element.closest(".main-nav")) return "navigation";
  if (element.closest(".site-footer")) return "footer";
  if (element.closest(".saved-shell")) return "saved_page";
  if (element.closest(".methodology-shell")) return "methodology_page";
  if (element.closest(".action-toast")) return "action_toast";
  return "page";
}

function actionFor(element: Element) {
  const explicit = element.getAttribute("data-analytics-action");
  if (explicit) return explicit;
  if (element.matches(".course-card")) return "course_open";
  if (element.closest(".course-card h2 button")) return "course_open";
  if (element.closest(".rating-trigger")) return "course_ratings_open";
  if (element.closest(".search-bar button")) return "course_search";
  if (element.closest(".search-bar input")) return "search_input";
  if (element.closest(".filter-search")) return "filter_search";
  if (element.closest(".filter-chip")) return "filter_option";
  if (element.closest(".mobile-filter-trigger")) return "filter_open";
  if (element.closest(".course-pagination")) return "pagination";
  if (element.matches('[role="tab"]')) return "tab_switch";
  if (element.matches('[role="option"]')) return "select_option";
  if (element.matches('[role="switch"]')) return "setting_toggle";
  if (element.matches('[role="button"]')) return "button_action";
  if (element.matches('input[type="checkbox"], input[type="radio"]'))
    return "selection_toggle";
  if (element.matches("[aria-pressed]")) return "favorite_toggle";
  if (element.matches("a[href]")) return "navigation";
  if (element.matches("[aria-expanded]")) return "disclosure_toggle";
  if (element.matches("button")) return "button_action";
  return "control_action";
}

function onClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const control = event.target.closest(
    'button, a[href], input, select, [role="button"], [role="tab"], [role="option"], [role="switch"], [aria-expanded], [data-rmp-card], .course-card',
  );
  if (!control) return;
  const properties: EventProperties = {
    action: actionFor(control),
    area: areaFor(control),
    control:
      control.getAttribute("data-analytics-label") ??
      control.tagName.toLowerCase(),
    path: window.location.pathname,
  };
  const selection = control.getAttribute("data-analytics-value");
  if (selection !== null) properties.selection = selection;
  trackUmamiEvent("ui_interaction", properties);
}

function onChange(event: Event) {
  const target = event.target;
  if (!(
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement
  ))
    return;
  const action = actionFor(target);
  const properties: EventProperties = {
    action: `${action}_change`,
    area: areaFor(target),
    control:
      target.getAttribute("data-analytics-label") ??
      (target.type === "checkbox" || target.type === "radio"
        ? target.type
        : target.tagName.toLowerCase()),
    path: window.location.pathname,
  };
  if (
    target instanceof HTMLInputElement &&
    ["checkbox", "radio"].includes(target.type)
  )
    properties.checked = target.checked;
  trackUmamiEvent("ui_interaction", properties);
}

function onSubmit(event: SubmitEvent) {
  if (!(event.target instanceof HTMLFormElement)) return;
  const search = event.target.matches(".search-bar");
  const field = event.target.elements.namedItem("q");
  const normalizedSearch =
    search && field instanceof HTMLInputElement
      ? normalizeCourseSearch(field.value)
      : null;
  if (normalizedSearch) {
    trackUmamiEvent("course_search", {
      search_term: normalizedSearch.searchTerm,
      search_type: normalizedSearch.searchType,
      path: window.location.pathname,
    });
  }
  trackUmamiEvent("form_submit", {
    form: search ? "course_search" : "form",
    fields: event.target.elements.length,
    path: window.location.pathname,
  });
}

function onScroll(event: Event) {
  const target = event.target;
  const scroller =
    target instanceof Element
      ? target
      : (document.scrollingElement ?? document.documentElement);
  const range = scroller.scrollHeight - scroller.clientHeight;
  if (range < 80) return;
  const depth = Math.min(100, Math.floor((scroller.scrollTop / range) * 100));
  const reported = scrollDepths.get(scroller) ?? new Set<number>();
  for (const threshold of [25, 50, 75, 100]) {
    if (depth < threshold || reported.has(threshold)) continue;
    reported.add(threshold);
    trackUmamiEvent("scroll_depth", {
      depth: threshold,
      area: areaFor(scroller),
      path: window.location.pathname,
    });
  }
  scrollDepths.set(scroller, reported);
}

export function UmamiAnalytics({
  websiteId,
  trackerUrl,
  recorderUrl,
}: {
  websiteId: string;
  trackerUrl: string;
  recorderUrl: string;
}) {
  useEffect(() => {
    if (!websiteId || !trackerUrl) return;
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [trackerUrl, websiteId]);

  if (!websiteId || !trackerUrl) return null;
  return (
    <>
      <Script
        id="umami-tracker"
        src={trackerUrl}
        strategy="afterInteractive"
        data-website-id={websiteId}
        data-do-not-track="true"
        data-performance="true"
        data-errors="true"
        data-before-send="umamiBeforeSend"
        onReady={flushPendingEvents}
      />
      {recorderUrl ? (
        <Script
          id="umami-recorder"
          src={recorderUrl}
          strategy="afterInteractive"
          data-website-id={websiteId}
        />
      ) : null}
    </>
  );
}

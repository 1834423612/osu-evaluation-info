"use client";
import { useCallback } from "react";
import { attachPreviewScrolling } from "@/lib/syllabus/scroll-intent";
export function useSyllabusScroll() {
  return useCallback(
    (node: HTMLDivElement | null) =>
      node && !node.parentElement?.closest("[data-scroll-panel]")
        ? attachPreviewScrolling(node)
        : undefined,
    [],
  );
}

/** One controller for the whole course panel, across all of its tabs. */
export function useNestedPanelScroll() {
  return useCallback(
    (node: HTMLDivElement | null) =>
      node ? attachPreviewScrolling(node) : undefined,
    [],
  );
}

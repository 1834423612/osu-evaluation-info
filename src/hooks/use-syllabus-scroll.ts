"use client";
import { useCallback } from "react";
import { attachPreviewScrolling } from "@/lib/syllabus/scroll-intent";
export function useSyllabusScroll() {
  return useCallback(
    (node: HTMLDivElement | null) =>
      node ? attachPreviewScrolling(node) : undefined,
    [],
  );
}

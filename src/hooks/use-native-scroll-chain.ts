"use client";
import { useCallback } from "react";
import { attachNativeScrollChain } from "@/lib/browser/scroll-chain";

/** Optional ref marker for readers; the site's CSS policy supplies the behavior. */
export function useNativeScrollChain() {
  return useCallback(
    (node: HTMLDivElement | null) =>
      node ? attachNativeScrollChain(node) : undefined,
    [],
  );
}

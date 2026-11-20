"use client";
import { useCallback } from "react";
import { notify } from "@/lib/notify";
/** Ephemeral operation feedback belongs in the global live-region, beside the viewport. */
export function useActionNotice() {
  const show = useCallback((message: string) => notify(message), []);
  return ["", show] as const;
}

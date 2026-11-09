"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { createGuideExitGuard } from "@/lib/translation/onboarding";

export function useGuideExitGuard(identity: string) {
  const [guard] = useState(() => createGuideExitGuard());
  useEffect(() => {
    guard.arm(identity);
  }, [guard, identity]);
  return (event: MouseEvent<HTMLElement>) => {
    if (event.detail > 0) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        return false;
    }
    return guard.accepts(identity, event.detail);
  };
}

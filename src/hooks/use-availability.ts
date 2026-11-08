"use client";
import { useSyncExternalStore } from "react";
import {
  hasOfficialAvailability,
  isAvailabilityFresh,
} from "@/lib/catalog/availability";
import type { CatalogCourse } from "@/lib/catalog/types";

let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const subscribeOnce = () => () => {};
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}
export function useAvailabilityVisible(course: CatalogCourse, watch: boolean) {
  return useSyncExternalStore(
    watch ? subscribe : subscribeOnce,
    () =>
      watch
        ? isAvailabilityFresh(course, now)
        : hasOfficialAvailability(course),
    () => false,
  );
}

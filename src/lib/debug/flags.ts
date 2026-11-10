import { LOGO_TAP_GAP_MS, LOGO_TAP_DURATION_MS } from "./logo-clicks.ts";

export type DebugFlags = {
  factory: boolean;
  bypassCache: boolean;
  replayTranslation: boolean;
  replayLanguage: boolean;
  skipAnalytics: boolean;
  layout: boolean;
  latency: number;
  offline: boolean;
  pauseCatalog: boolean;
  pauseSeats: boolean;
  pauseTranslation: boolean;
  pauseRmp: boolean;
  pauseEvaluations: boolean;
  pausePeople: boolean;
  emptyCatalog: boolean;
  emptySeats: boolean;
  emptyRmp: boolean;
  emptyEvaluations: boolean;
  emptyPeople: boolean;
  failTranslation: boolean;
};
export const DEFAULT_DEBUG_FLAGS: DebugFlags = {
  factory: false,
  bypassCache: false,
  replayTranslation: false,
  replayLanguage: false,
  skipAnalytics: false,
  layout: false,
  latency: 0,
  offline: false,
  pauseCatalog: false,
  pauseSeats: false,
  pauseTranslation: false,
  pauseRmp: false,
  pauseEvaluations: false,
  pausePeople: false,
  emptyCatalog: false,
  emptySeats: false,
  emptyRmp: false,
  emptyEvaluations: false,
  emptyPeople: false,
  failTranslation: false,
};
export const DEBUG_SESSION_KEY = "course-atlas:debug:session:v1";
export const DEBUG_EVENT = "course-atlas:debug";
declare global {
  interface Window {
    __COURSE_ATLAS_DEBUG__?: DebugFlags;
  }
}
export function debugFlag<K extends keyof DebugFlags>(key: K): DebugFlags[K] {
  return typeof window === "undefined"
    ? DEFAULT_DEBUG_FLAGS[key]
    : (window.__COURSE_ATLAS_DEBUG__?.[key] ?? DEFAULT_DEBUG_FLAGS[key]);
}
export function cacheBypassed() {
  return debugFlag("bypassCache");
}

export function createLogoTapSequence() {
  let count = 0,
    first = 0,
    last = -Infinity,
    cooldown = 0;
  const tap = (now: number) => {
    if (now < cooldown) return 0;
    if (now - last > LOGO_TAP_GAP_MS || now - first > LOGO_TAP_DURATION_MS) {
      count = 0;
      first = now;
    }
    last = now;
    count++;
    if (count === 7) {
      count = 0;
      cooldown = now + 1200;
      return 7;
    }
    return count;
  };
  tap.reset = () => {
    count = 0;
    first = 0;
    last = -Infinity;
  };
  return tap;
}

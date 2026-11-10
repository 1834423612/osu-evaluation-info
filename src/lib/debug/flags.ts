export type DebugFlags = {
  factory: boolean;
  bypassCache: boolean;
  replayTranslation: boolean;
  replayLanguage: boolean;
  skipAnalytics: boolean;
  layout: boolean;
  latency: number;
  offline: boolean;
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
  return (now: number) => {
    if (now < cooldown) return 0;
    if (now - last > 700 || now - first > 5000) {
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
}

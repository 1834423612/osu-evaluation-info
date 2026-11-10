import { migrateBrowserStorage } from "./storage-migrations.ts";
import {
  DEFAULT_DEBUG_FLAGS,
  DEBUG_SESSION_KEY,
  debugFlag,
} from "../debug/flags.ts";

let initialized = false;
const overlays = {
  local: new Map<string, string>(),
  session: new Map<string, string>(),
};
export function initializeBrowserStorage() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(DEBUG_SESSION_KEY) ?? "null",
    );
    if (
      stored &&
      (process.env.NODE_ENV === "development" || stored.expiresAt > Date.now())
    )
      window.__COURSE_ATLAS_DEBUG__ = {
        ...DEFAULT_DEBUG_FLAGS,
        ...stored.flags,
      };
  } catch {
    /* Restricted storage keeps the normal experience available. */
  }
  try {
    migrateBrowserStorage(window.localStorage);
    migrateBrowserStorage(window.sessionStorage);
  } catch {
    /* Read-only storage is supported. */
  }
}
function shadowed(key: string) {
  return (
    key.startsWith("course-atlas:") &&
    !key.startsWith("course-atlas:debug:") &&
    (debugFlag("factory") ||
      (debugFlag("replayTranslation") && key.includes(":translation-guide:")))
  );
}
/** Temporary test writes never touch the real profile. Derived caches may be bypassed. */
export function browserStorage(kind: "local" | "session" = "local"): Storage {
  initializeBrowserStorage();
  const real =
    kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
  const overlay = overlays[kind];
  const keys = () => [
    ...new Set([
      ...Array.from({ length: real.length }, (_, index) =>
        real.key(index),
      ).filter((key): key is string => !!key && !shadowed(key)),
      ...[...overlay.keys()].filter(shadowed),
    ]),
  ];
  return {
    get length() {
      return keys().length;
    },
    key: (index) => keys()[index] ?? null,
    getItem(key) {
      if (
        debugFlag("bypassCache") &&
        key.startsWith("course-atlas:people-directory:")
      )
        return null;
      return shadowed(key) ? (overlay.get(key) ?? null) : real.getItem(key);
    },
    setItem(key, value) {
      if (shadowed(key)) overlay.set(key, String(value));
      else real.setItem(key, value);
    },
    removeItem(key) {
      if (shadowed(key)) overlay.delete(key);
      else real.removeItem(key);
    },
    clear() {
      for (const key of keys()) {
        if (shadowed(key)) overlay.delete(key);
      }
    },
  };
}

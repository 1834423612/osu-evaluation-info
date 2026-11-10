"use client";

import { initializeBrowserStorage } from "../preferences/browser-storage";
import {
  DEFAULT_DEBUG_FLAGS,
  DEBUG_EVENT,
  DEBUG_SESSION_KEY,
  createLogoTapSequence,
  debugFlag,
  type DebugFlags,
} from "./flags";

type NetworkEntry = {
  path: string;
  method: string;
  status: number;
  ms: number;
};
type Snapshot = {
  visible: boolean;
  expanded: boolean;
  authorized: boolean;
  configured: boolean;
  expiresAt: number;
  flags: DebugFlags;
  toast: string;
  requests: NetworkEntry[];
};
const server: Snapshot = {
  visible: false,
  expanded: false,
  authorized: false,
  configured: false,
  expiresAt: 0,
  flags: DEFAULT_DEBUG_FLAGS,
  toast: "",
  requests: [],
};
let state = server;
let initialized = false;
let viewRevision = 0;
const listeners = new Set<() => void>();
const tap = createLogoTapSequence();
let toastTimer: ReturnType<typeof setTimeout> | undefined;
declare global {
  interface Window {
    __COURSE_ATLAS_FETCH__?: typeof fetch;
    __COURSE_ATLAS_NETWORK__?: (entry: NetworkEntry) => void;
  }
}
function update(value: Partial<Snapshot>) {
  state = { ...state, ...value };
  listeners.forEach((listener) => listener());
}
function persist() {
  window.__COURSE_ATLAS_DEBUG__ = state.flags;
  try {
    sessionStorage.setItem(
      DEBUG_SESSION_KEY,
      JSON.stringify({
        flags: state.flags,
        expiresAt: state.expiresAt,
        hidden: !state.visible,
        expanded: state.expanded,
      }),
    );
  } catch {
    /* Session-only memory remains usable. */
  }
  document.documentElement.toggleAttribute(
    "data-debug-layout",
    state.flags.layout,
  );
  window.dispatchEvent(new Event(DEBUG_EVENT));
}
function notify(toast: string) {
  clearTimeout(toastTimer);
  update({ toast });
  toastTimer = setTimeout(() => update({ toast: "" }), 2200);
}
function restoreAnalytics() {
  try {
    const previous = sessionStorage.getItem(
      "course-atlas:debug:umami-previous",
    );
    if (previous !== null) {
      if (previous === "__absent__") localStorage.removeItem("umami.disabled");
      else localStorage.setItem("umami.disabled", previous);
      sessionStorage.removeItem("course-atlas:debug:umami-previous");
    }
  } catch {
    /* Preserve the user's privacy preference if storage is restricted. */
  }
}
function analyticsURL(url: URL) {
  const origins = [
    process.env.NEXT_PUBLIC_UMAMI_TRACKER_URL,
    process.env.NEXT_PUBLIC_UMAMI_RECORDER_URL,
  ].flatMap((value) => {
    try {
      return value ? [new URL(value, location.href).origin] : [];
    } catch {
      return [];
    }
  });
  return (
    origins.includes(url.origin) &&
    /\/(?:api\/)?(?:send|collect|record|replay|batch)(?:\/|$)/.test(
      url.pathname,
    )
  );
}
function instrumentNetwork() {
  window.__COURSE_ATLAS_NETWORK__ = (entry) =>
    update({ requests: [...state.requests.slice(-39), entry] });
  if (window.__COURSE_ATLAS_FETCH__) return;
  const native = window.fetch.bind(window);
  window.__COURSE_ATLAS_FETCH__ = native;
  window.fetch = async (input, init = {}) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href,
    );
    const internal = url.origin === location.origin;
    const maintenance = internal && url.pathname.startsWith("/api/debug/");
    if (debugFlag("skipAnalytics") && analyticsURL(url))
      return new Response(null, { status: 202 });
    const started = performance.now();
    let status = 0;
    try {
      const signal =
        init.signal ?? (input instanceof Request ? input.signal : undefined);
      if (!maintenance && debugFlag("latency"))
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            signal?.removeEventListener("abort", abort);
            resolve();
          };
          const timer = setTimeout(finish, debugFlag("latency"));
          const abort = () => {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            reject(signal?.reason);
          };
          if (signal?.aborted) abort();
          else signal?.addEventListener("abort", abort, { once: true });
        });
      if (!maintenance && debugFlag("offline"))
        throw new TypeError("Debug: simulated request failure");
      const headers = new Headers(
        init.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (!maintenance && internal && debugFlag("bypassCache"))
        headers.set("x-course-atlas-debug", "bypass");
      const response = await native(input, {
        ...init,
        headers,
        ...(debugFlag("bypassCache")
          ? { cache: "no-store" as RequestCache }
          : {}),
      });
      status = response.status;
      return response;
    } finally {
      if (!maintenance)
        window.__COURSE_ATLAS_NETWORK__?.({
          path: url.pathname,
          method:
            init.method ?? (input instanceof Request ? input.method : "GET"),
          status,
          ms: Math.round(performance.now() - started),
        });
    }
  };
  try {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) =>
      debugFlag("skipAnalytics") &&
      analyticsURL(new URL(String(url), location.href))
        ? true
        : nativeBeacon(url, data);
  } catch {
    /* Reloading with analytics disabled also prevents recorder startup. */
  }
}

export const debugTools = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
  getServerSnapshot: () => server,
  initialize() {
    if (initialized) return;
    initialized = true;
    initializeBrowserStorage();
    let hidden = false;
    let reopen = false;
    let expanded = false;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(DEBUG_SESSION_KEY) ?? "null",
      );
      hidden = saved?.hidden === true;
      reopen = saved?.hidden === false;
      expanded = saved?.expanded === true;
    } catch {
      /* Default visibility follows the environment. */
    }
    const development = process.env.NODE_ENV === "development";
    update({
      visible: development && !hidden,
      expanded: development && !hidden && expanded,
      authorized: development,
      flags: window.__COURSE_ATLAS_DEBUG__ ?? DEFAULT_DEBUG_FLAGS,
      expiresAt: Date.now() + 8 * 3_600_000,
    });
    document.documentElement.toggleAttribute(
      "data-debug-layout",
      state.flags.layout,
    );
    instrumentNetwork();
    const restoringView = viewRevision;
    void window.__COURSE_ATLAS_FETCH__!("/api/debug/session", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((value) => {
        if (value.authorized)
          update({
            authorized: true,
            ...(viewRevision === restoringView
              ? {
                  visible: state.visible || reopen,
                  expanded: reopen && expanded,
                }
              : {}),
            configured: value.configured,
            expiresAt: value.expiresAt,
          });
        else {
          const hadFlags = Object.entries(state.flags).some(
            ([key, value]) =>
              value !== DEFAULT_DEBUG_FLAGS[key as keyof DebugFlags],
          );
          restoreAnalytics();
          update({
            authorized: false,
            configured: value.configured,
            flags: DEFAULT_DEBUG_FLAGS,
          });
          persist();
          if (hadFlags) location.reload();
        }
      })
      .catch(() => {
        /* The unlock form remains available when verification cannot run. */
      });
  },
  tapLogo(now: number, zh: boolean) {
    const count = tap(now);
    if (count === 7) {
      viewRevision++;
      update({ visible: true, expanded: true });
      persist();
      notify(zh ? "调试工具已打开" : "Developer tools opened");
    } else if (count >= 3)
      notify(
        zh
          ? `再点 ${7 - count} 下打开调试工具`
          : `${7 - count} more taps for developer tools`,
      );
    return count;
  },
  open() {
    viewRevision++;
    update({ visible: true, expanded: true });
    persist();
  },
  toggle() {
    viewRevision++;
    update({ expanded: !state.expanded });
    persist();
  },
  hide() {
    viewRevision++;
    update({ visible: false, expanded: false });
    persist();
  },
  async unlock(key: string) {
    const response = await window.__COURSE_ATLAS_FETCH__!(
      "/api/debug/session",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
        cache: "no-store",
      },
    );
    if (!response.ok) return false;
    const result = await response.json();
    if (!result.authorized) return false;
    update({ authorized: true, expiresAt: result.expiresAt });
    persist();
    return true;
  },
  setFlag<K extends keyof DebugFlags>(key: K, value: DebugFlags[K]) {
    if (!state.authorized) return;
    if (key === "skipAnalytics") {
      try {
        if (value) {
          if (
            sessionStorage.getItem("course-atlas:debug:umami-previous") === null
          )
            sessionStorage.setItem(
              "course-atlas:debug:umami-previous",
              localStorage.getItem("umami.disabled") ?? "__absent__",
            );
          localStorage.setItem("umami.disabled", "1");
        } else restoreAnalytics();
      } catch {
        /* The pre-send hook remains an additional guard. */
      }
    }
    update({ flags: { ...state.flags, [key]: value } });
    persist();
    if (
      [
        "factory",
        "replayTranslation",
        "replayLanguage",
        "skipAnalytics",
        "bypassCache",
      ].includes(key)
    )
      location.reload();
  },
  async reset() {
    restoreAnalytics();
    update({ flags: DEFAULT_DEBUG_FLAGS });
    persist();
    location.reload();
  },
  notify,
};

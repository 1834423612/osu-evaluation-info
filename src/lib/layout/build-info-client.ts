import {
  bundledBuildInfo,
  parseBuildInfo,
  type BuildInfo,
} from "./build-info.ts";

export function createBuildInfoClient(
  initial: BuildInfo | null,
  fetcher: typeof fetch,
  now = Date.now,
) {
  let current = initial,
    pending: Promise<void> | null = null,
    nextCheck = 0;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh(): Promise<void> {
      if (pending) return pending;
      if (now() < nextCheck) return Promise.resolve();
      nextCheck = now() + 5000;
      pending = Promise.resolve()
        .then(async () => {
          const response = await fetcher("/api/build-info", {
            cache: "no-store",
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error("Version metadata unavailable");
          const data = await response.json();
          const build = data?.version === 1 ? parseBuildInfo(data.build) : null;
          if (!build) throw new Error("Invalid version metadata");
          if (JSON.stringify(build) !== JSON.stringify(current)) {
            current = build;
            listeners.forEach((listener) => listener());
          }
        })
        .catch(() => {
          // Keep the last known version during a rollout, offline session, or transient failure.
          nextCheck = now() + 30_000;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}

const initial = bundledBuildInfo();
const client = createBuildInfoClient(initial, (...args) => fetch(...args));
let subscribers = 0,
  stopWatching: (() => void) | undefined;
function refreshVisible() {
  if (document.visibilityState !== "hidden" && navigator.onLine)
    return client.refresh();
  return Promise.resolve();
}
export const buildInfoStore = {
  getSnapshot: client.getSnapshot,
  getServerSnapshot: client.getServerSnapshot,
  refresh: refreshVisible,
  subscribe(listener: () => void) {
    const unsubscribe = client.subscribe(listener);
    if (++subscribers === 1) {
      const check = () => {
        void refreshVisible();
      };
      const timer = setInterval(check, 30_000);
      window.addEventListener("focus", check);
      window.addEventListener("online", check);
      document.addEventListener("visibilitychange", check);
      stopWatching = () => {
        clearInterval(timer);
        window.removeEventListener("focus", check);
        window.removeEventListener("online", check);
        document.removeEventListener("visibilitychange", check);
      };
      check();
    }
    return () => {
      unsubscribe();
      if (--subscribers === 0) {
        stopWatching?.();
        stopWatching = undefined;
      }
    };
  },
};

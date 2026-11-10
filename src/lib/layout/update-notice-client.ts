import { type BuildInfo } from "./build-info.ts";

const DISMISSED_KEY = "course-atlas:update-dismissed:v1";
type Snapshot = { dismissed: string | null; preview: number | null };

export function availableUpdate(
  build: BuildInfo | null,
  bundled: BuildInfo | null,
) {
  return build?.environment === "production" &&
    bundled &&
    build.sha !== bundled.sha
    ? build
    : null;
}

export function createUpdateNoticeClient(
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">,
) {
  const initial: Snapshot = { dismissed: null, preview: null };
  let current = initial,
    initialized = false,
    revision = 0;
  const listeners = new Set<() => void>();
  const update = (value: Partial<Snapshot>) => {
    current = { ...current, ...value };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => current,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!initialized) {
        initialized = true;
        try {
          update({ dismissed: storage().getItem(DISMISSED_KEY) });
        } catch {
          /* Dismissals still work in memory when browser storage is blocked. */
        }
      }
      return () => {
        listeners.delete(listener);
      };
    },
    dismiss(sha: string) {
      update({ dismissed: sha });
      try {
        storage().setItem(DISMISSED_KEY, sha);
      } catch {
        /* Preserve the in-memory dismissal. */
      }
    },
    dismissPreview() {
      update({ preview: null });
    },
    preview() {
      update({ preview: ++revision });
    },
    resetDismissed() {
      update({ dismissed: null });
      try {
        storage().removeItem(DISMISSED_KEY);
      } catch {
        /* Preserve the in-memory reset. */
      }
    },
  };
}

export const updateNoticeStore = createUpdateNoticeClient(() => sessionStorage);

export const TRANSLATION_GUIDE_KEY = "course-atlas:translation-guide:v1";
export const TRANSLATION_SUCCESS_EVENT = "course-atlas:translation-success";

export type TranslationGuideStep = "translate" | "settings" | "preferences";
type GuideSnapshot = {
  step: TranslationGuideStep;
  contentId: string | null;
} | null;

/** One device-wide guide, with progress retained after a successful translation. */
export function createTranslationGuideStore(storage: {
  read: () => string | null;
  write: (value: "settings" | "done") => void;
}) {
  let snapshot: GuideSnapshot = null;
  let progress: "translate" | "settings" | "done" = "translate";
  let initialized = false;
  let enabled = false;
  const listeners = new Set<() => void>();

  function update(next: GuideSnapshot) {
    if (
      snapshot?.step === next?.step &&
      snapshot?.contentId === next?.contentId
    )
      return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }

  function persist(value: "settings" | "done") {
    progress = value;
    try {
      storage.write(value);
    } catch {
      // Keep progress in memory when browser storage is unavailable.
    }
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: (): GuideSnapshot => null,
    activate(locale: string) {
      enabled =
        Boolean(locale) && locale.toLowerCase().split(/[-_]/)[0] !== "en";
      if (!initialized) {
        initialized = true;
        try {
          const stored = storage.read();
          if (stored === "settings" || stored === "done") progress = stored;
        } catch {
          // A blocked storage API must not prevent the guide from working.
        }
      }
      if (!enabled || progress === "done") update(null);
      else if (!snapshot) update({ step: progress, contentId: null });
    },
    translated(contentId: string, manual: boolean) {
      if (!enabled || !manual || snapshot?.step !== "translate") return;
      persist("settings");
      update({ step: "settings", contentId });
    },
    openSettings(contentId: string) {
      if (snapshot?.step !== "settings") return;
      update({ step: "preferences", contentId });
    },
    closeSettings(contentId: string) {
      if (snapshot?.step !== "preferences" || snapshot.contentId !== contentId)
        return;
      update({ step: "settings", contentId });
    },
    isSettingsGuided(contentId: string) {
      return (
        snapshot?.step === "preferences" && snapshot.contentId === contentId
      );
    },
    completeSettings(contentId: string) {
      if (snapshot?.step !== "preferences" || snapshot.contentId !== contentId)
        return;
      persist("done");
      update(null);
    },
    dismiss() {
      persist("done");
      update(null);
    },
    sync() {
      try {
        const stored = storage.read();
        if (stored === "done") {
          progress = "done";
          update(null);
        } else if (stored === "settings" && progress === "translate") {
          progress = "settings";
          if (enabled) update({ step: "settings", contentId: null });
        }
      } catch {
        // Other tabs cannot synchronize when storage access is blocked.
      }
    },
  };
}

/** Protect explicit exit buttons from double clicks and taps carried across steps. */
export function createGuideExitGuard(
  now: () => number = () => performance.now(),
) {
  let identity = "";
  let readyAt = Infinity;
  let used = false;
  return {
    arm(next: string) {
      if (next === identity) return;
      identity = next;
      readyAt = now() + 350;
      used = false;
    },
    accepts(current: string, clickCount: number) {
      if (current !== identity || used || clickCount > 1 || now() < readyAt)
        return false;
      used = true;
      return true;
    },
  };
}

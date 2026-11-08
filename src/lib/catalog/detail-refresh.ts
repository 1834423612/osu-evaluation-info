import {
  AVAILABILITY_TTL_MS,
  MIN_AVAILABILITY_POLL_MS,
  isAvailabilityFresh,
  withoutCourseAvailability,
} from "./availability.ts";
import type { CatalogCourse } from "./types";

export type CourseDetailState = {
  course: CatalogCourse | null;
  source: { mode: "official" | "mirror"; snapshotAt?: string } | null;
  loading: boolean;
  error: boolean;
};

type RefreshOptions = {
  course: CatalogCourse;
  url: string;
  onUpdate: (state: CourseDetailState) => void;
  window: Pick<Window, "addEventListener" | "removeEventListener">;
  document: Pick<
    Document,
    "visibilityState" | "addEventListener" | "removeEventListener"
  >;
  fetcher?: typeof fetch;
  poll?: boolean;
  intervalMs?: number;
  every?: typeof setInterval;
  cancelEvery?: typeof clearInterval;
};

/** One in-flight read per open detail; late/aborted responses can never revive old seats. */
export function createDetailRefresh(options: RefreshOptions) {
  let disposed = false;
  let started = false;
  let controller: AbortController | null = null;
  let generation = 0;
  let current = withoutCourseAvailability(options.course);
  let timer: ReturnType<typeof setInterval> | undefined;
  let polling = options.poll !== false;
  let intervalMs = Math.max(
    MIN_AVAILABILITY_POLL_MS,
    options.intervalMs ?? AVAILABILITY_TTL_MS,
  );
  const visible = () => options.document.visibilityState !== "hidden";
  const clear = (loading: boolean, error = false) => {
    current = withoutCourseAvailability(current);
    options.onUpdate({ course: current, source: null, loading, error });
  };
  async function refresh() {
    if (disposed || !visible() || controller) return;
    const request = new AbortController();
    controller = request;
    const id = ++generation;
    clear(true);
    try {
      const response = await (options.fetcher ?? fetch)(options.url, {
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw new Error("Course details unavailable");
      const payload = await response.json();
      if (!payload.course) throw new Error("Course no longer listed");
      if (disposed || generation !== id) return;
      const official =
        payload.sourceMode === "official" &&
        isAvailabilityFresh(payload.course);
      current = official
        ? payload.course
        : withoutCourseAvailability(payload.course);
      options.onUpdate({
        course: current,
        source: {
          mode: payload.sourceMode === "mirror" ? "mirror" : "official",
          snapshotAt: payload.snapshotAt,
        },
        loading: false,
        error: false,
      });
    } catch {
      if (!disposed && generation === id) clear(false, true);
    } finally {
      if (generation === id) controller = null;
    }
  }
  function onVisibility() {
    // A one-time read remains valid for this view, including a background tab.
    if (!polling) return;
    if (visible()) {
      void refresh();
      return;
    }
    generation++;
    controller?.abort();
    controller = null;
    clear(false);
  }
  const onFocus = () => {
    if (polling) void refresh();
  };
  function setPolling(enabled: boolean, requestedIntervalMs = intervalMs) {
    if (disposed) return;
    const nextInterval = Math.max(
      MIN_AVAILABILITY_POLL_MS,
      requestedIntervalMs,
    );
    const wasPolling = polling;
    const intervalChanged = intervalMs !== nextInterval;
    if (wasPolling === enabled && !intervalChanged) return;
    polling = enabled;
    intervalMs = nextInterval;
    if (!started) return;
    if (!wasPolling && enabled) {
      options.window.addEventListener("focus", onFocus);
      timer = (options.every ?? setInterval)(onFocus, intervalMs);
      void refresh();
    } else if (wasPolling && !enabled) {
      options.window.removeEventListener("focus", onFocus);
      if (timer !== undefined) {
        (options.cancelEvery ?? clearInterval)(timer);
        timer = undefined;
      }
    } else if (enabled && intervalChanged) {
      if (timer !== undefined) (options.cancelEvery ?? clearInterval)(timer);
      timer = (options.every ?? setInterval)(onFocus, intervalMs);
    }
  }
  return {
    refresh,
    setPolling,
    start() {
      if (disposed || started) return;
      started = true;
      options.document.addEventListener("visibilitychange", onVisibility);
      if (polling) {
        options.window.addEventListener("focus", onFocus);
        timer = (options.every ?? setInterval)(onFocus, intervalMs);
      }
      queueMicrotask(() => {
        void refresh();
      });
    },
    stop() {
      disposed = true;
      generation++;
      controller?.abort();
      controller = null;
      if (timer !== undefined) (options.cancelEvery ?? clearInterval)(timer);
      timer = undefined;
      options.window.removeEventListener("focus", onFocus);
      options.document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

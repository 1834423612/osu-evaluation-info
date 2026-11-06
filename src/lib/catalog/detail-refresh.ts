import {
  AVAILABILITY_TTL_MS,
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
    if (visible()) void refresh();
    else {
      generation++;
      controller?.abort();
      controller = null;
      clear(false);
    }
  }
  const onFocus = () => {
    void refresh();
  };
  return {
    refresh,
    start() {
      if (disposed || started) return;
      started = true;
      options.window.addEventListener("focus", onFocus);
      options.document.addEventListener("visibilitychange", onVisibility);
      if (options.poll !== false)
        timer = (options.every ?? setInterval)(onFocus, AVAILABILITY_TTL_MS);
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
      options.window.removeEventListener("focus", onFocus);
      options.document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}

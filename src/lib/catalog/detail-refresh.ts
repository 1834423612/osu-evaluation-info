import { withoutCourseAvailability } from "./availability.ts";
import type { CatalogCourse } from "./types";

export type CourseDetailState = {
  course: CatalogCourse | null;
  source: { mode: "official" | "mirror"; snapshotAt?: string } | null;
  loading: boolean;
  error: boolean;
};

/** Metadata is loaded once per open. Seat checks have their own bounded queue. */
export function createDetailRefresh(options: {
  course: CatalogCourse;
  url: string;
  onUpdate: (state: CourseDetailState) => void;
  fetcher?: typeof fetch;
}) {
  let disposed = false;
  let started = false;
  let generation = 0;
  let controller: AbortController | null = null;
  let current = withoutCourseAvailability(options.course);
  async function refresh() {
    if (disposed || controller) return;
    const request = new AbortController();
    controller = request;
    const id = ++generation;
    options.onUpdate({
      course: current,
      source: null,
      loading: true,
      error: false,
    });
    try {
      const response = await (options.fetcher ?? fetch)(options.url, {
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw new Error("Course details unavailable");
      const payload = await response.json();
      if (!payload.course) throw new Error("Course no longer listed");
      if (disposed || generation !== id) return;
      current = withoutCourseAvailability(payload.course);
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
      if (!disposed && generation === id)
        options.onUpdate({
          course: current,
          source: null,
          loading: false,
          error: true,
        });
    } finally {
      if (generation === id) controller = null;
    }
  }
  return {
    refresh,
    start() {
      if (!started && !disposed) {
        started = true;
        queueMicrotask(() => {
          void refresh();
        });
      }
    },
    stop() {
      disposed = true;
      generation++;
      controller?.abort();
      controller = null;
    },
  };
}

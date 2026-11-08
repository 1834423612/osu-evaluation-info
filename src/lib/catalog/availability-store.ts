import { createRequestPool } from "./request-pool.ts";
import {
  availabilityKey,
  isVerifiedSectionAvailability,
  sectionAvailabilityQuery,
  type AvailabilityQuery,
} from "./section-availability.ts";
import type {
  AvailabilityState,
  CatalogCourse,
  CatalogSection,
  SectionAvailability,
} from "./types";

type Entry = {
  state: AvailabilityState;
  data: SectionAvailability | null;
  revision: number;
};
const EMPTY: Entry = { state: "idle", data: null, revision: 0 };

export function createAvailabilityStore(
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  const pool = createRequestPool<SectionAvailability>({
    concurrency: 2,
    minStartIntervalMs: 400,
    maxQueued: 80,
    onCancel: (key) => {
      controllers.delete(key);
      publish(key, entries.get(key)?.data ? "ready" : "idle");
    },
  });
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let focus: string | null = null;
  const controllers = new Map<string, AbortSignal>();
  const publish = (
    key: string,
    state: AvailabilityState,
    data = entries.get(key)?.data ?? null,
  ) => {
    entries.set(key, { state, data, revision: ++revision });
    // Keep recent reads for this session without saving seat counts to localStorage.
    if (entries.size > 1500)
      for (const [oldKey, entry] of entries) {
        if (
          entry.state !== "loading" &&
          entry.state !== "queued" &&
          oldKey !== key
        ) {
          entries.delete(oldKey);
          break;
        }
      }
    for (const notify of listeners) notify();
  };
  function read(
    query: AvailabilityQuery,
    { signal, priority = 0 }: { signal?: AbortSignal; priority?: number } = {},
  ) {
    const key = availabilityKey(query);
    const previous = entries.get(key);
    if (previous?.state !== "loading" && previous?.state !== "queued")
      publish(key, "queued");
    return pool
      .read(
        key,
        async (signal) => {
          controllers.set(key, signal);
          publish(key, "loading");
          try {
            const response = await fetcher(`/api/catalog/availability?${key}`, {
              cache: "no-store",
              signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
            });
            if (response.status === 429)
              pool.backoff(
                Math.max(
                  5000,
                  (Number(response.headers.get("Retry-After")) || 5) * 1000,
                ),
              );
            if (!response.ok)
              throw new Error("Section availability unavailable");
            const body = await response.json();
            if (!isVerifiedSectionAvailability(body.availability))
              throw new Error("Invalid section availability");
            if (signal.aborted) throw signal.reason;
            if (controllers.get(key) === signal)
              publish(key, "ready", body.availability);
            return body.availability;
          } catch (error) {
            if (controllers.get(key) === signal)
              publish(
                key,
                signal.aborted
                  ? entries.get(key)?.data
                    ? "ready"
                    : "idle"
                  : "error",
              );
            throw error;
          } finally {
            if (controllers.get(key) === signal) controllers.delete(key);
          }
        },
        { signal, priority },
      )
      .catch((error) => {
        // A queued request can be cancelled before its loader starts.
        if (
          entries.get(key)?.state === "queued" &&
          !(error instanceof DOMException && error.name === "AbortError")
        )
          publish(
            key,
            signal?.aborted
              ? entries.get(key)?.data
                ? "ready"
                : "idle"
              : "error",
          );
        throw error;
      });
  }
  const entryFor = (section: CatalogSection, course: CatalogCourse) => {
    const query = sectionAvailabilityQuery(section, course);
    return query ? (entries.get(availabilityKey(query)) ?? EMPTY) : EMPTY;
  };
  return {
    read,
    entryFor,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    snapshot(course: CatalogCourse) {
      return course.sections
        .map((section) => entryFor(section, course).revision)
        .join(",");
    },
    getFocus: () => focus,
    setFocus(course: string | null) {
      if (focus === course) return;
      focus = course;
      if (focus) pool.cancelBackground();
      for (const notify of listeners) notify();
    },
    merge(course: CatalogCourse): CatalogCourse {
      const sections = course.sections.map((section) => {
        const entry = entryFor(section, course);
        return {
          ...section,
          enrollmentStatus: entry.data?.enrollmentStatus ?? "",
          enrollmentTotal: entry.data?.enrollmentTotal ?? null,
          waitlistTotal: entry.data?.waitlistTotal ?? null,
          availability: entry.data ?? undefined,
          availabilityState: entry.state,
        };
      });
      const dates = sections
        .flatMap((section) =>
          section.availability ? [section.availability.fetchedAt] : [],
        )
        .sort();
      return {
        ...course,
        sections,
        availability: dates.length
          ? { source: "official", fetchedAt: dates[0] }
          : { source: "unavailable", fetchedAt: null },
      };
    },
  };
}

export const availabilityStore = createAvailabilityStore();

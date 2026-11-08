"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { availabilityStore } from "@/lib/catalog/availability-store";
import {
  availabilityKey,
  sectionAvailabilityQuery,
} from "@/lib/catalog/section-availability";
import {
  getWatchSelection,
  saveWatchSelection,
  watchIntervalMs,
  WATCH_SELECTION_EVENT,
} from "@/lib/catalog/watch-selection";
import type { CatalogCourse } from "@/lib/catalog/types";

const EMPTY: string[] = [];
const isPageHidden = () => document.visibilityState === "hidden";
function subscribeSelection(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(WATCH_SELECTION_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(WATCH_SELECTION_EVENT, listener);
  };
}

export function useCourseVisible() {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { rootMargin: "80px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

export function useSectionAvailability(
  course: CatalogCourse,
  {
    visible,
    open,
    focused,
    watch,
    intervalSeconds,
  }: {
    visible: boolean;
    open: boolean;
    focused: boolean;
    watch: boolean;
    intervalSeconds: number;
  },
) {
  const selected = useSyncExternalStore(
    subscribeSelection,
    () => getWatchSelection(course.id),
    () => EMPTY,
  );
  const [plan, setPlan] = useState<string | null>(null);
  const selectedKey = [...selected].sort().join(",");
  const selectedCount = course.sections.filter((section) =>
    selected.includes(section.classNumber),
  ).length;
  const running =
    open && watch && plan !== null && plan === selectedKey && selectedCount > 0;
  const eligible = visible || open;
  const [cycle, setCycle] = useState({
    loading: false,
    nextAt: 0,
    completedAt: 0,
  });
  const [now, setNow] = useState(Date.now);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const manualRef = useRef<AbortController | null>(null);
  const backgroundVisited = useRef(new Set<string>());
  const detailVisited = useRef(new Set<string>());
  const wasOpen = useRef(false);
  const revision = useSyncExternalStore(
    availabilityStore.subscribe,
    () => availabilityStore.snapshot(course),
    () => "",
  );
  const focusedCourse = useSyncExternalStore(
    availabilityStore.subscribe,
    availabilityStore.getFocus,
    () => null,
  );
  const keys = course.sections
    .map((section) => sectionAvailabilityQuery(section, course))
    .filter(Boolean)
    .map((query) => availabilityKey(query!))
    .join("|");
  const courseRef = useRef(course);
  useEffect(() => {
    courseRef.current = course;
  }, [course]);

  useEffect(() => {
    if (!focused || !watch) return;
    availabilityStore.setFocus(course.id);
    return () => {
      if (availabilityStore.getFocus() === course.id)
        availabilityStore.setFocus(null);
    };
  }, [focused, watch, course.id]);

  useEffect(() => {
    if (open && !wasOpen.current) detailVisited.current.clear();
    wasOpen.current = open;
    const background = !open;
    if (background && (!eligible || focusedCourse !== null)) return;
    if (!background && watch && !running) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let roundController: AbortController | null = null;
    let busy = false;
    const visited = background
      ? backgroundVisited.current
      : detailVisited.current;
    const effectiveInterval = watchIntervalMs(intervalSeconds, selectedCount);
    const execute = async (force: boolean) => {
      if (busy || controller.signal.aborted || isPageHidden()) return;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      busy = true;
      const round = new AbortController();
      roundController = round;
      const signal = AbortSignal.any([controller.signal, round.signal]);
      if (!background)
        setCycle((value) => ({ ...value, loading: true, nextAt: 0 }));
      const targets = courseRef.current.sections
        .filter(
          (section) =>
            !watch || background || selected.includes(section.classNumber),
        )
        .flatMap((section) => {
          const query = sectionAvailabilityQuery(section, courseRef.current);
          if (!query) return [];
          const key = availabilityKey(query);
          return force || !visited.has(key) ? [{ query, key }] : [];
        });
      let index = 0;
      const worker = async () => {
        while (index < targets.length && !signal.aborted && !isPageHidden()) {
          const target = targets[index++];
          try {
            await availabilityStore.read(target.query, {
              signal,
              priority: background ? 10 : running ? -1 : 0,
            });
            visited.add(target.key);
          } catch {
            /* Each row exposes its own failure and a retry control. */
          }
        }
      };
      await Promise.all([worker(), worker()]);
      busy = false;
      if (controller.signal.aborted) return;
      if (signal.aborted) {
        if (running && !isPageHidden()) void execute(true);
        else if (!background)
          setCycle((value) => ({ ...value, loading: false, nextAt: 0 }));
        return;
      }
      setNow(Date.now());
      if (!background)
        setCycle({
          loading: false,
          nextAt: running ? Date.now() + effectiveInterval : 0,
          completedAt: Date.now(),
        });
      if (running)
        timer = setTimeout(() => {
          void execute(true);
        }, effectiveInterval);
    };
    refreshRef.current = async () => {
      if (timer) clearTimeout(timer);
      await execute(true);
    };
    void execute(running);
    const onVisible = () => {
      if (!isPageHidden()) void execute(running);
      else if (running) {
        roundController?.abort();
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
      }
    };
    const onFocus = () => {
      if (running) void execute(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      refreshRef.current = null;
    };
  }, [
    course.id,
    keys,
    eligible,
    open,
    watch,
    running,
    focusedCourse,
    intervalSeconds,
    selectedKey,
    selected,
    selectedCount,
  ]);

  useEffect(
    () => () => {
      manualRef.current?.abort();
    },
    [course.id, open, watch, selectedKey],
  );

  useEffect(() => {
    if (!cycle.nextAt || !running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [cycle.nextAt, running]);

  const enriched = useMemo(() => {
    void revision;
    return availabilityStore.merge(course);
  }, [course, revision]);
  const select = useCallback(
    (values: string[]) => saveWatchSelection(course.id, values),
    [course.id],
  );
  const refresh = useCallback(async () => {
    if (refreshRef.current) return refreshRef.current();
    if (manualRef.current) return;
    const controller = new AbortController();
    manualRef.current = controller;
    setCycle((value) => ({ ...value, loading: true }));
    // Manual, selected-only reads are available before starting the watch loop.
    const targets = courseRef.current.sections.filter(
      (section) => !watch || selected.includes(section.classNumber),
    );
    try {
      for (const section of targets) {
        if (controller.signal.aborted) break;
        const query = sectionAvailabilityQuery(section, courseRef.current);
        if (query)
          try {
            await availabilityStore.read(query, {
              priority: 0,
              signal: controller.signal,
            });
          } catch {
            /* Row shows failure. */
          }
      }
    } finally {
      if (manualRef.current === controller) {
        manualRef.current = null;
        setCycle((value) => ({ ...value, loading: false }));
      }
    }
  }, [watch, selected]);
  const refreshSection = useCallback(async (classNumber: string) => {
    const section = courseRef.current.sections.find(
      (value) => value.classNumber === classNumber,
    );
    const query =
      section && sectionAvailabilityQuery(section, courseRef.current);
    if (query)
      try {
        await availabilityStore.read(query, { priority: 0 });
      } catch {
        /* Row shows failure. */
      }
  }, []);
  return {
    course: enriched,
    selected,
    select,
    running,
    start: () => setPlan(selectedKey),
    stop: () => setPlan(null),
    refresh,
    refreshSection,
    loading:
      open &&
      enriched.sections.some(
        (section) =>
          (!watch || selected.includes(section.classNumber)) &&
          (section.availabilityState === "queued" ||
            section.availabilityState === "loading"),
      ),
    countdown:
      running && cycle.nextAt
        ? Math.max(0, Math.ceil((cycle.nextAt - now) / 1000))
        : null,
    intervalSeconds: Math.ceil(
      watchIntervalMs(intervalSeconds, selectedCount) / 1000,
    ),
    completedAt: cycle.completedAt,
    paused: !open && focusedCourse !== null,
  };
}

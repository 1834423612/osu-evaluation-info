import { withoutCourseAvailability } from "../catalog/availability.ts";
import {
  isVerifiedSectionAvailability,
  sectionAvailabilityQuery,
  type AvailabilityQuery,
} from "../catalog/section-availability.ts";
import type {
  CatalogCourse,
  CatalogSection,
  SectionAvailability,
} from "../catalog/types";
import { text, type Locale } from "../i18n.ts";

type AvailabilityReader = {
  read: (
    query: AvailabilityQuery,
    options: { signal: AbortSignal },
  ) => Promise<SectionAvailability>;
};

export type SimulationFetchProgress = {
  completed: number;
  total: number;
  failed: number;
};

/** Fresh per-run reads, including pinned, asynchronous and unchosen components. */
export async function refreshSimulationAvailability(
  courses: CatalogCourse[],
  signal: AbortSignal,
  reader: AvailabilityReader,
  onProgress?: (progress: SimulationFetchProgress) => void,
): Promise<CatalogCourse[]> {
  signal.throwIfAborted();
  const refreshed = courses.map(withoutCourseAvailability);
  const sections = refreshed.flatMap((course) =>
    course.sections.map((section) => ({ course, section })),
  );
  let next = 0,
    completed = 0,
    failed = 0;
  const report = () =>
    onProgress?.({ completed, total: sections.length, failed });
  report();
  const readNext = async () => {
    while (next < sections.length) {
      signal.throwIfAborted();
      const { course, section } = sections[next++];
      const query = sectionAvailabilityQuery(section, course);
      section.availabilityState = "error";
      try {
        if (!query) continue;
        const availability = await reader.read(query, { signal });
        signal.throwIfAborted();
        if (!isVerifiedSectionAvailability(availability)) continue;
        section.availability = availability;
        section.availabilityState = "ready";
        section.enrollmentStatus = availability.enrollmentStatus;
        section.enrollmentTotal = availability.enrollmentTotal;
        section.waitlistTotal = availability.waitlistTotal;
      } catch {
        signal.throwIfAborted();
      } finally {
        if (!signal.aborted) {
          completed++;
          if (section.availabilityState !== "ready") failed++;
          report();
        }
      }
    }
  };
  // Feed the shared catalog store gradually so even large semesters cannot flood its queue.
  await Promise.all(
    Array.from({ length: Math.min(2, sections.length) }, readNext),
  );
  signal.throwIfAborted();
  return refreshed.map((course) => {
    const dates = course.sections
      .flatMap((section) =>
        section.availability ? [section.availability.fetchedAt] : [],
      )
      .sort();
    return {
      ...course,
      availability: dates.length
        ? { source: "official", fetchedAt: dates[0] }
        : { source: "unavailable", fetchedAt: null },
    };
  });
}

export function simulationAvailability(section: CatalogSection) {
  const current = section.availability;
  if (
    section.availabilityState !== "ready" ||
    !isVerifiedSectionAvailability(current)
  )
    return "unknown";
  if (/wait/i.test(current.enrollmentStatus)) return "waitlist";
  if (
    current.availableSeats === 0 ||
    current.isOpen === false ||
    /closed|full/i.test(current.enrollmentStatus)
  )
    return "full";
  if (
    current.isOpen === true ||
    (current.availableSeats ?? 0) > 0 ||
    /^open$/i.test(current.enrollmentStatus)
  )
    return "open";
  return "unknown";
}

function waitlistInformation(
  current: SectionAvailability,
  locale: Locale,
): {
  state: "none" | "unknown" | "open" | "full";
  label: string;
  counts: string;
} {
  const capacity = current.waitlistCapacity,
    total = current.waitlistTotal;
  if (capacity === 0)
    return {
      state: "none",
      label: text(locale, "no waitlist", "无候补"),
      counts: "",
    };
  if (capacity === null || total === null)
    return {
      state: "unknown",
      label:
        capacity === null && total === null
          ? text(locale, "waitlist unknown", "候补情况未知")
          : text(locale, "waitlist seats unknown", "候补余位未知"),
      counts:
        capacity === null && total === null
          ? ""
          : `${total ?? "?"}/${capacity ?? "?"}`,
    };
  return capacity > total
    ? {
        state: "open",
        label: text(locale, "waitlist available", "可候补"),
        counts: text(
          locale,
          `${total}/${capacity} (${capacity - total} left)`,
          `${total}/${capacity}（余 ${capacity - total} 位）`,
        ),
      }
    : {
        state: "full",
        label: text(locale, "waitlist full", "候补已满"),
        counts: `${total}/${capacity}`,
      };
}

export function simulationAvailabilityName(
  section: CatalogSection,
  locale: Locale,
): string {
  const state = simulationAvailability(section);
  if (state === "unknown") return text(locale, "Seats unknown", "余位未知");
  if (state === "open") return text(locale, "Open", "可选");
  if (state === "full") return text(locale, "Full", "已满");
  const waitlist = waitlistInformation(section.availability!, locale);
  return {
    none: text(locale, "Full", "已满"),
    open: text(locale, "Waitlist available", "可候补"),
    full: text(locale, "Waitlist full", "候补已满"),
    unknown: text(locale, "Waitlist unknown", "候补情况未知"),
  }[waitlist.state];
}

export function simulationAvailabilityLabel(
  section: CatalogSection,
  locale: Locale,
) {
  const state = simulationAvailability(section);
  const label = simulationAvailabilityName(section, locale);
  if (state === "unknown") return label;
  const current = section.availability!;
  const waitlist = waitlistInformation(current, locale);
  const waitlistLabel =
    label.toLowerCase() === waitlist.label.toLowerCase()
      ? waitlist.counts
      : [waitlist.label, waitlist.counts].filter(Boolean).join(" ");
  return [
    label,
    ...(current.availableSeats === null
      ? []
      : [
          text(
            locale,
            `${current.availableSeats} seats`,
            `余位 ${current.availableSeats}`,
          ),
        ]),
    waitlistLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

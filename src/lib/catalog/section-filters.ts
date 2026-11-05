import type { CatalogSection } from "@/lib/catalog/types";

export type ComponentKind = string;

export type SectionFilterState = {
  components: ReadonlySet<ComponentKind>;
  instructionModes: ReadonlySet<string>;
  days: ReadonlySet<number>;
  excludeEarly: boolean;
  excludeLate: boolean;
  excludeWeekends: boolean;
  /** 15-minute cutoff used when excludeEarly is enabled (defaults to 09:00). */
  earlyCutoffMinute?: number;
  /** 15-minute cutoff used when excludeLate is enabled (defaults to 18:00). */
  lateCutoffMinute?: number;
};

export type SectionFilterOptions = {
  components: ComponentKind[];
  instructionModes: string[];
  days: number[];
  hasEarlyMeetings: boolean;
  hasLateMeetings: boolean;
  hasWeekendMeetings: boolean;
  hasTimedMeetings: boolean;
};

export function componentKind(value: string): ComponentKind | null {
  return value.trim() || null;
}

function minuteOfDay(value: string | null) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    hour %= 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
  }
  return hour * 60 + minute;
}

export function getSectionFilterOptions(
  sections: readonly CatalogSection[],
): SectionFilterOptions {
  const presentComponents = new Set<ComponentKind>();
  const instructionModes = new Set<string>();
  const days = new Set<number>();
  let hasEarlyMeetings = false;
  let hasLateMeetings = false;
  let hasWeekendMeetings = false;
  let hasTimedMeetings = false;

  for (const section of sections) {
    const kind = componentKind(section.component);
    if (kind) presentComponents.add(kind);
    if (section.instructionMode.trim())
      instructionModes.add(section.instructionMode);
    for (const meeting of section.meetings) {
      for (const day of meeting.days) {
        if (day >= 0 && day < 7) days.add(day);
        if (day === 5 || day === 6) hasWeekendMeetings = true;
      }
      const start = minuteOfDay(meeting.startTime);
      const end = minuteOfDay(meeting.endTime);
      if (start !== null || end !== null) hasTimedMeetings = true;
      if (start !== null && start < 9 * 60) hasEarlyMeetings = true;
      if (
        (start !== null && start > 18 * 60) ||
        (end !== null && end > 18 * 60)
      )
        hasLateMeetings = true;
    }
  }

  return {
    components: [...presentComponents].toSorted((a, b) => a.localeCompare(b)),
    instructionModes: [...instructionModes].toSorted((a, b) =>
      a.localeCompare(b),
    ),
    days: [...days].toSorted((a, b) => a - b),
    hasEarlyMeetings,
    hasLateMeetings,
    hasWeekendMeetings,
    hasTimedMeetings,
  };
}

export function sectionMatchesFilters(
  section: CatalogSection,
  filters: SectionFilterState,
) {
  const component = componentKind(section.component);
  if (
    filters.components.size &&
    (component === null || !filters.components.has(component))
  )
    return false;

  if (
    filters.instructionModes.size &&
    !filters.instructionModes.has(section.instructionMode)
  )
    return false;

  if (
    filters.days.size &&
    !section.meetings.some((meeting) =>
      meeting.days.some((day) => filters.days.has(day)),
    )
  )
    return false;

  if (
    filters.excludeEarly &&
    section.meetings.some((meeting) => {
      const start = minuteOfDay(meeting.startTime);
      const cutoff = filters.earlyCutoffMinute ?? 9 * 60;
      return start !== null && start < cutoff;
    })
  )
    return false;

  if (
    filters.excludeLate &&
    section.meetings.some((meeting) => {
      const start = minuteOfDay(meeting.startTime);
      const end = minuteOfDay(meeting.endTime);
      const cutoff = filters.lateCutoffMinute ?? 18 * 60;
      return (
        (start !== null && start > cutoff) || (end !== null && end > cutoff)
      );
    })
  )
    return false;

  if (
    filters.excludeWeekends &&
    section.meetings.some((meeting) =>
      meeting.days.some((day) => day === 5 || day === 6),
    )
  )
    return false;

  return true;
}

/** Keep every row available, with matches first and inactive rows last in each group. */
export function rankSectionsForFilters(
  sections: readonly CatalogSection[],
  filters: SectionFilterState,
) {
  return sections
    .map((section) => ({
      section,
      matches: sectionMatchesFilters(section, filters),
      inactive: /\b(inactive|cancelled|canceled)\b/i.test(
        section.enrollmentStatus,
      ),
    }))
    .toSorted(
      (a, b) =>
        Number(b.matches) - Number(a.matches) ||
        Number(a.inactive) - Number(b.inactive),
    );
}

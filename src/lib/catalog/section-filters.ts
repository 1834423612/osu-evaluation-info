import type { CatalogSection } from "@/lib/catalog/types";

export type ComponentKind = "Lecture" | "Lab" | "Recitation";

export type SectionFilterState = {
  components: ReadonlySet<ComponentKind>;
  instructionModes: ReadonlySet<string>;
  days: ReadonlySet<number>;
  excludeEarly: boolean;
  excludeLate: boolean;
  excludeWeekends: boolean;
};

export type SectionFilterOptions = {
  components: ComponentKind[];
  instructionModes: string[];
  days: number[];
  hasEarlyMeetings: boolean;
  hasLateMeetings: boolean;
  hasWeekendMeetings: boolean;
};

const COMPONENTS: ComponentKind[] = ["Lecture", "Lab", "Recitation"];

export function componentKind(value: string): ComponentKind | null {
  const normalized = value.trim().toLowerCase();
  if (
    /^(lec|lecture|lect)$/i.test(normalized) ||
    normalized.includes("lecture")
  )
    return "Lecture";
  if (
    /^(lab|laboratory)$/i.test(normalized) ||
    normalized.includes("laboratory")
  )
    return "Lab";
  if (
    /^(rec|recit|recitation)$/i.test(normalized) ||
    normalized.includes("recitation")
  )
    return "Recitation";
  return null;
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
      if (start !== null && start < 9 * 60) hasEarlyMeetings = true;
      if (
        (start !== null && start > 18 * 60) ||
        (end !== null && end > 18 * 60)
      )
        hasLateMeetings = true;
    }
  }

  return {
    components: COMPONENTS.filter((component) =>
      presentComponents.has(component),
    ),
    instructionModes: [...instructionModes].toSorted((a, b) =>
      a.localeCompare(b),
    ),
    days: [...days].toSorted((a, b) => a - b),
    hasEarlyMeetings,
    hasLateMeetings,
    hasWeekendMeetings,
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
      return start !== null && start < 9 * 60;
    })
  )
    return false;

  if (
    filters.excludeLate &&
    section.meetings.some((meeting) => {
      const start = minuteOfDay(meeting.startTime);
      const end = minuteOfDay(meeting.endTime);
      return (
        (start !== null && start > 18 * 60) || (end !== null && end > 18 * 60)
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

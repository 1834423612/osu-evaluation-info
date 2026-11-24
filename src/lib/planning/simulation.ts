import type {
  CatalogCourse,
  CatalogMeeting,
  CatalogSection,
} from "../catalog/types";
import { minuteOfDay } from "../catalog/section-filters.ts";
import { simulationAvailability } from "./simulation-availability.ts";
export type BlockedTime = { days: number[]; start: number; end: number };
export type SimulationPreferences = {
  blocked: BlockedTime[];
  compact: boolean;
  buffer: number;
};
export const defaultSimulationPreferences: SimulationPreferences = {
  blocked: [],
  compact: true,
  buffer: 10,
};
export type SimulationChoice = { key: string; sections: CatalogSection[] };
type Slot = {
  day: number;
  start: number;
  end: number;
  from: string | null;
  to: string | null;
};
export function semesterCatalogCode(term: string) {
  const match = /^(Autumn|Spring|Summer)(20\d{2})$/.exec(term);
  if (!match) throw Error("Invalid semester");
  return `1${match[2].slice(2)}${{ Spring: 2, Summer: 4, Autumn: 8 }[match[1] as "Spring" | "Summer" | "Autumn"]}`;
}
/** Credit/unassigned buckets are valid planner rows, but have no attendance session. */
export function sessionSectionsForTerm(
  course: CatalogCourse | undefined,
  term: string,
  section?: string,
) {
  if (!course || !/^(Autumn|Spring|Summer)(20\d{2})$/.test(term)) return [];
  if (course.termCode !== semesterCatalogCode(term)) return [];
  return course.sections.filter(
    (item) =>
      !section || item.section === section || item.classNumber === section,
  );
}
export function meetingSlots(meetings: CatalogMeeting[]): Slot[] {
  return meetings.flatMap((m) => {
    const start = minuteOfDay(m.startTime),
      end = minuteOfDay(m.endTime);
    if (start === null || end === null || end <= start) return [];
    return m.days
      .filter((d) => d >= 0 && d < 7)
      .map((day) => ({
        day,
        start,
        end,
        from: m.startDate?.slice(0, 10) ?? null,
        to: m.endDate?.slice(0, 10) ?? null,
      }));
  });
}
function overlap(a: Slot, b: Slot, buffer: number) {
  const from = [a.from, b.from]
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);
  const to = [a.to, b.to].filter((v): v is string => Boolean(v)).sort()[0];
  if (from && to) {
    const start = new Date(from + "T00:00:00Z");
    const offset = (a.day - ((start.getUTCDay() + 6) % 7) + 7) % 7;
    start.setUTCDate(start.getUTCDate() + offset);
    if (
      Number.isFinite(start.getTime()) &&
      start.toISOString().slice(0, 10) > to
    )
      return false;
  }
  return (
    a.day === b.day &&
    !(a.to && b.from && a.to < b.from) &&
    !(b.to && a.from && b.to < a.from) &&
    a.start < b.end + buffer &&
    b.start < a.end + buffer
  );
}
function slots(choice: SimulationChoice) {
  return choice.sections.flatMap((s) => meetingSlots(s.meetings));
}
export function sectionGroups(course: CatalogCourse) {
  const groups = new Map<string, CatalogSection[]>();
  for (const section of course.sections) {
    const component = section.component || "Class";
    groups.set(component, [...(groups.get(component) ?? []), section]);
  }
  return [...groups].map(([component, sections]) => ({ component, sections }));
}
export function simulationDiagnostics(
  choices: SimulationChoice[],
  preferences: SimulationPreferences,
) {
  const conflicts: { left: string; right: string; day: number }[] = [];
  const blocked = preferences.blocked.flatMap((b) =>
    b.days.map((day) => ({ ...b, day, from: null, to: null })),
  );
  const unknown: string[] = [];
  for (const [index, choice] of choices.entries()) {
    if (
      choice.sections.some(
        (s) =>
          (!s.meetings.length ||
            s.meetings.some((m) => !meetingSlots([m]).length)) &&
          !(
            /^(?:Distance Learning|DL)$/i.test(s.instructionMode) &&
            !s.meetings.some((m) => meetingSlots([m]).length)
          ),
      )
    )
      unknown.push(choice.key);
    const own = slots(choice);
    for (let a = 0; a < own.length; a++)
      for (let b = a + 1; b < own.length; b++)
        if (overlap(own[a], own[b], 0))
          conflicts.push({
            left: choice.key,
            right: choice.key,
            day: own[a].day,
          });
    for (const slot of own) {
      if (blocked.some((b) => overlap(slot, b, 0)))
        conflicts.push({ left: choice.key, right: "blocked", day: slot.day });
      for (const other of choices.slice(0, index))
        if (slots(other).some((s) => overlap(slot, s, preferences.buffer)))
          conflicts.push({ left: choice.key, right: other.key, day: slot.day });
    }
  }
  return { conflicts, unknown: [...new Set(unknown)] };
}
function scheduleCost(
  choices: SimulationChoice[],
  preferences: SimulationPreferences,
) {
  const diagnostics = simulationDiagnostics(choices, preferences);
  let gaps = 0,
    days = 0;
  for (let day = 0; day < 7; day++) {
    const meetings = choices
      .flatMap(slots)
      .filter((s) => s.day === day)
      .sort((a, b) => a.start - b.start);
    if (meetings.length) days++;
    for (let i = 1; i < meetings.length; i++) {
      const a = meetings[i - 1],
        b = meetings[i];
      if (
        !(a.to && b.from && a.to < b.from) &&
        !(b.to && a.from && b.to < a.from)
      )
        gaps += Math.max(0, b.start - a.end);
    }
  }
  return (
    diagnostics.conflicts.length * 100000 +
    diagnostics.unknown.length * 10000 +
    choices
      .flatMap((c) => c.sections)
      .filter((s) => ["full", "waitlist"].includes(simulationAvailability(s)))
      .length *
      1000 +
    (preferences.compact ? gaps + days * 30 : 0)
  );
}
/** Bounded local beam search. Fixed section choices remain fixed even when they conflict. */
export function simulateSchedule(
  courses: CatalogCourse[],
  fixed: Record<string, string[]>,
  preferences: SimulationPreferences,
) {
  let beam: SimulationChoice[][] = [[]];
  const unavailable: string[] = [];
  let capped = false;
  for (const course of courses) {
    const key = `${course.subject} ${course.catalogNumber}`,
      requested = fixed[key] ?? [];
    if (
      !course.sections.length ||
      requested.some((id) => !course.sections.some((s) => s.classNumber === id))
    ) {
      unavailable.push(key);
      continue;
    }
    let combinations: CatalogSection[][] = [[]];
    for (const group of sectionGroups(course)) {
      const selected = group.sections.filter((s) =>
        requested.includes(s.classNumber),
      );
      const options = selected.length
        ? [selected]
        : group.sections.map((s) => [s]);
      const next = combinations.flatMap((previous) =>
        options.map((option) => [...previous, ...option]),
      );
      if (next.length > 48) capped = true;
      combinations = next
        .sort(
          (a, b) =>
            scheduleCost([{ key, sections: a }], preferences) -
            scheduleCost([{ key, sections: b }], preferences),
        )
        .slice(0, 48);
    }
    const next = beam.flatMap((state) =>
      combinations.map((sections) => [...state, { key, sections }]),
    );
    if (next.length > 48) capped = true;
    beam = next
      .map((choices) => ({ choices, cost: scheduleCost(choices, preferences) }))
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 48)
      .map((s) => s.choices);
  }
  const ranked = beam.map((choices) => ({
    choices,
    ...simulationDiagnostics(choices, preferences),
    restricted: choices
      .filter((choice) =>
        choice.sections.some((s) =>
          ["full", "waitlist"].includes(simulationAvailability(s)),
        ),
      )
      .map((choice) => choice.key),
  }));
  const compatible = ranked.filter((option) => !option.conflicts.length);
  const seen = new Set<string>();
  const alternatives = (compatible.length ? compatible : ranked.slice(0, 1))
    .filter((option) => {
      const identity = JSON.stringify(
        option.choices.map((choice) => [
          choice.key,
          choice.sections.map((section) => section.classNumber).sort(),
        ]),
      );
      if (!option.choices.length || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .slice(0, 24);
  const best = alternatives[0] ?? {
    choices: [],
    conflicts: [],
    unknown: [],
    restricted: [],
  };
  return {
    ...best,
    alternatives,
    unavailable,
    capped: capped || compatible.length > 24,
    incomplete: courses
      .filter((c) => c.sectionsPartial)
      .map((c) => `${c.subject} ${c.catalogNumber}`),
    linked: courses
      .filter((c) => sectionGroups(c).length > 1)
      .map((c) => `${c.subject} ${c.catalogNumber}`),
  };
}

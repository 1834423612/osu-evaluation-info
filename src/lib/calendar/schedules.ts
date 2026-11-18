import type { Plan } from "../planning/model.ts";
import { boardCourses, semesterCampus } from "../planning/workspace.ts";
import { meetingSlots, type SimulationChoice } from "../planning/simulation.ts";
import { isNoClassDate, type AcademicDay } from "./academic.ts";
import {
  calendarSchema,
  type UserCalendar,
  type CalendarEvent,
} from "./model.ts";

export function semesterFingerprint(plan: Plan, term: string) {
  return JSON.stringify([
    semesterCampus(plan, term),
    boardCourses(plan)
      .filter((r) => r.term === term)
      .map((r) => [
        r.course.id,
        r.course.subject,
        r.course.number,
        r.course.status,
        r.course.section,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ]);
}
/** Convert wall time using the actual date's New York DST offset. */
export function newYorkTime(date: string, minute: number) {
  const wall = Date.parse(date + "T00:00:00Z") + minute * 60000;
  let time = wall;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let pass = 0; pass < 2; pass++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(time)).map((p) => [p.type, p.value]),
    );
    const displayed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    time += wall - displayed;
  }
  return new Date(time).toISOString();
}
export function calendarFromSimulation(
  plan: Plan,
  term: string,
  choices: SimulationChoice[],
  days: AcademicDay[],
  id: string,
): UserCalendar {
  const events: CalendarEvent[] = [];
  const flexible: string[] = [];
  const dates = choices
    .flatMap((choice) =>
      choice.sections.flatMap((section) =>
        section.meetings.flatMap((meeting) =>
          [
            meeting.startDate?.slice(0, 10),
            meeting.endDate?.slice(0, 10),
          ].filter((value): value is string => !!value),
        ),
      ),
    )
    .sort();
  for (const choice of choices)
    for (const section of choice.sections) {
      if (
        !section.meetings.some((meeting) => meetingSlots([meeting]).length) &&
        /distance learning|^DL$/i.test(section.instructionMode)
      )
        flexible.push(choice.key);
      for (const [index, meeting] of section.meetings.entries()) {
        const slots = meetingSlots([meeting]);
        const start = meeting.startDate?.slice(0, 10),
          end = meeting.endDate?.slice(0, 10);
        if (!start || !end) continue;
        let cursor = new Date(start + "T12:00:00Z");
        for (
          let count = 0;
          count < 370 && cursor.toISOString().slice(0, 10) <= end;
          count++, cursor = new Date(+cursor + 86400000)
        ) {
          const date = cursor.toISOString().slice(0, 10),
            day = (cursor.getUTCDay() + 6) % 7;
          if (isNoClassDate(date, days)) continue;
          for (const slot of slots.filter((s) => s.day === day))
            events.push({
              id: `${section.classNumber}-${index}-${date}`,
              title: choice.key,
              start: newYorkTime(date, slot.start),
              end: newYorkTime(date, slot.end),
              allDay: false,
              category: "class",
              description: `${section.component} ${section.section} · ${section.instructionMode}`,
              location: meeting.location ?? "",
              session: section.session,
            });
        }
      }
    }
  return calendarSchema.parse({
    id,
    title: `${term} · ${choices.length} courses`,
    description: flexible.length
      ? `Self-paced online · ${[...new Set(flexible)].join(" · ")}`
      : "",
    kind: "simulation",
    term,
    campus: semesterCampus(plan, term),
    fingerprint: semesterFingerprint(plan, term),
    events,
    ...(dates.length ? { range: { start: dates[0], end: dates.at(-1)! } } : {}),
    updatedAt: new Date().toISOString(),
  });
}

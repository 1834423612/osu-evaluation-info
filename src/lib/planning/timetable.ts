import type {
  CatalogCourse,
  CatalogMeeting,
  CatalogSection,
} from "../catalog/types";
import { isOnlineMeeting } from "../catalog/presentation.ts";
import { meetingSlots, type SimulationChoice } from "./simulation.ts";

export type MeetingDelivery = "online" | "in-person" | "unknown";

/** Use the whole candidate catalog so switching arrangements never changes the scale. */
export function timetableFrame(courses: CatalogCourse[]) {
  const frame = { start: 480, end: 1200, days: 5 };
  for (const course of courses)
    for (const section of course.sections)
      for (const slot of meetingSlots(section.meetings)) {
        frame.start = Math.min(frame.start, Math.floor(slot.start / 60) * 60);
        frame.end = Math.max(frame.end, Math.ceil(slot.end / 60) * 60);
        if (slot.day > 4) frame.days = 7;
      }
  return frame;
}

export function timetableLanes<
  T extends { id: string; day: number; start: number; end: number },
>(events: T[]): (T & { lane: number; lanes: number })[] {
  const result: (T & { lane: number; lanes: number })[] = [];
  for (let day = 0; day < 7; day++) {
    const daily = events
      .filter((event) => event.day === day)
      .sort(
        (a, b) =>
          a.start - b.start || a.end - b.end || a.id.localeCompare(b.id),
      );
    for (let offset = 0; offset < daily.length;) {
      const ends: number[] = [],
        placed: (T & { lane: number })[] = [];
      let boundary = daily[offset].end,
        next = offset;
      while (
        next < daily.length &&
        (next === offset || daily[next].start < boundary)
      ) {
        const event = daily[next++];
        let lane = ends.findIndex((end) => end <= event.start);
        if (lane < 0) lane = ends.length;
        ends[lane] = event.end;
        boundary = Math.max(boundary, event.end);
        placed.push({ ...event, lane });
      }
      result.push(...placed.map((event) => ({ ...event, lanes: ends.length })));
      offset = next;
    }
  }
  return result;
}

export function meetingDelivery(
  meeting: Pick<CatalogMeeting, "location"> | undefined,
  instructionMode = "",
): MeetingDelivery {
  if (isOnlineMeeting(meeting, instructionMode)) return "online";
  const location = meeting?.location?.trim();
  if (
    (location &&
      !/^(?:TBA|TBD|N\/?A|unknown|arranged|to be announced)$/i.test(
        location,
      )) ||
    /^(?:in[ -]person|P)$/i.test(instructionMode.trim())
  )
    return "in-person";
  return "unknown";
}

/** Preserve each meeting's delivery mode, including mixed online/on-campus sections. */
export function timetableMeetings(choices: SimulationChoice[]) {
  return choices.flatMap((choice) =>
    choice.sections.flatMap((section: CatalogSection) => {
      const meetings: (CatalogMeeting | undefined)[] = section.meetings.length
        ? section.meetings
        : [undefined];
      return meetings.map((meeting, index) => ({
        id: `${choice.key}|${section.classNumber}|${index}`,
        key: choice.key,
        section: section.section,
        classNumber: section.classNumber,
        component: section.component,
        startDate: meeting?.startDate?.slice(0, 10) ?? null,
        endDate: meeting?.endDate?.slice(0, 10) ?? null,
        session: section.session,
        sessionDates: section.meetings
          .map((m) =>
            [m.startDate?.slice(0, 10), m.endDate?.slice(0, 10)]
              .filter(Boolean)
              .join(" – "),
          )
          .filter(Boolean)
          .join(" · "),
        selfPaced:
          /^(?:Distance Learning|DL)$/i.test(section.instructionMode) &&
          !section.meetings.some((m) => meetingSlots([m]).length),
        delivery: meetingDelivery(meeting, section.instructionMode),
        location: meeting?.location?.trim() || null,
        slots: meeting ? meetingSlots([meeting]) : [],
      }));
    }),
  );
}

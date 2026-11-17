import type { CatalogMeeting, CatalogSection } from "../catalog/types";
import { isOnlineMeeting } from "../catalog/presentation.ts";
import { meetingSlots, type SimulationChoice } from "./simulation.ts";

export type MeetingDelivery = "online" | "in-person" | "unknown";

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
        component: section.component,
        delivery: meetingDelivery(meeting, section.instructionMode),
        location: meeting?.location?.trim() || null,
        slots: meeting ? meetingSlots([meeting]) : [],
      }));
    }),
  );
}

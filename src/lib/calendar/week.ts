import type { CalendarEvent } from "./model.ts";
import { newYorkTime } from "./schedules.ts";
export function eventColor(title: string) {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ["#4784bb", "#398675", "#ad6376", "#8b69b0", "#a17e32"][hash % 5];
}
export const easternMinutes = (value: string) => {
  const [hour, minute] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(value))
    .split(":")
    .map(Number);
  return hour * 60 + minute;
};
/** Split overnight events at local midnight without changing the source event. */
export function weekSegments(events: CalendarEvent[], dates: string[]) {
  return dates.flatMap((date) => {
    const next = new Date(Date.parse(date + "T12:00:00Z") + 86400000)
        .toISOString()
        .slice(0, 10),
      start = newYorkTime(date, 0),
      end = newYorkTime(next, 0);
    return events
      .filter(
        (event) => !event.allDay && event.start < end && event.end > start,
      )
      .map((event) => ({
        event,
        date,
        from: event.start <= start ? 0 : easternMinutes(event.start),
        to: event.end >= end ? 1440 : easternMinutes(event.end),
      }));
  });
}

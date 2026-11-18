import type { CalendarEvent } from "./model.ts";

const easternDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function newYorkDate(date = new Date()) {
  return easternDate.format(date);
}
/** All-day end dates are exclusive; timed meetings use their Eastern date. */
export function eventInDateRange(
  event: CalendarEvent,
  from: string,
  to: string,
) {
  if (event.allDay) return event.start <= to && event.end > from;
  return (
    newYorkDate(new Date(event.start)) <= to &&
    newYorkDate(new Date(event.end)) >= from
  );
}

import ICAL from "ical.js";
import { calendarEventSchema, type CalendarEvent } from "./model.ts";
/** Expand bounded recurrence sets. Ignore HTML alternatives, attendees and organizers. */
export async function parseCalendar(
  text: string,
  from = new Date(Date.now() - 366 * 86400000),
  to = new Date(Date.now() + 2 * 366 * 86400000),
) {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024)
    throw Error("Calendar exceeds 2 MB");
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== "vcalendar") throw Error("Invalid calendar");
  for (const component of root.getAllSubcomponents("vtimezone")) {
    const tzid = component.getFirstPropertyValue("tzid");
    if (typeof tzid === "string")
      ICAL.TimezoneService.register(new ICAL.Timezone({ component, tzid }));
  }
  const components = root.getAllSubcomponents("vevent");
  if (components.length > 3000) throw Error("Too many calendar events");
  const events: CalendarEvent[] = [];
  const identities: string[] = [];
  const floatingZone = String(
    root.getFirstPropertyValue("x-wr-timezone") || "America/New_York",
  );
  function instant(
    value: ICAL.Time,
    component: ICAL.Component,
    property: string,
  ) {
    if (value.isDate)
      return new Date(value.toString().slice(0, 10) + "T00:00:00Z");
    if (value.zone.tzid !== "floating") return value.toJSDate();
    const zone = String(
      component.getFirstProperty(property)?.getParameter("tzid") ||
        floatingZone,
    );
    const wall = Date.UTC(
      value.year,
      value.month - 1,
      value.day,
      value.hour,
      value.minute,
      value.second,
    );
    const formatter = new Intl.DateTimeFormat("sv-SE", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    let result = wall;
    for (let i = 0; i < 3; i++) {
      const shown = formatter.format(new Date(result)).replace(" ", "T") + "Z";
      const correction = wall - Date.parse(shown);
      result += correction;
      if (!correction) break;
    }
    return new Date(result);
  }
  const exceptions = components.filter((c) => c.hasProperty("recurrence-id"));
  for (const component of components.filter(
    (c) => !c.hasProperty("recurrence-id"),
  )) {
    if (
      component.getFirstPropertyValue("status") === "CANCELLED" ||
      !component.hasProperty("dtstart")
    )
      continue;
    const event = new ICAL.Event(component);
    for (const exception of exceptions.filter(
      (c) => c.getFirstPropertyValue("uid") === event.uid,
    ))
      event.relateException(new ICAL.Event(exception));
    const iterator = event.iterator();
    let bounded = false;
    for (let count = 0; count < 10000; count++) {
      const occurrence = iterator.next();
      if (!occurrence) {
        bounded = true;
        break;
      }
      const detail = event.getOccurrenceDetails(occurrence);
      const start = instant(detail.startDate, detail.item.component, "dtstart"),
        end = instant(detail.endDate, detail.item.component, "dtend");
      if (start > to) {
        bounded = true;
        break;
      }
      if (end < from) continue;
      if (detail.item.component.getFirstPropertyValue("status") === "CANCELLED")
        continue;
      const allDay = detail.startDate.isDate;
      const date = (value: typeof detail.startDate, resolved: Date) =>
        allDay ? value.toString().slice(0, 10) : resolved.toISOString();
      const url = String(
        detail.item.component.getFirstPropertyValue("url") ?? "",
      );
      events.push(
        calendarEventSchema.parse({
          id: "pending",
          title: detail.item.summary || "Untitled event",
          start: date(detail.startDate, start),
          end: date(detail.endDate, end),
          allDay,
          category: /\/assignments\//.test(url) ? "assignment" : "event",
          description: String(detail.item.description ?? "")
            .replace(/<[^>]*>/g, "")
            .slice(0, 4000),
          location: detail.item.location ?? "",
          ...(/^https?:\/\//i.test(url) ? { url } : {}),
        }),
      );
      identities.push(`${event.uid}|${occurrence.toString()}`);
      if (events.length >= 3000) throw Error("Too many expanded events");
      if (!event.isRecurring()) {
        bounded = true;
        break;
      }
    }
    if (!bounded) throw Error("Recurrence exceeds the supported range");
  }
  return Promise.all(
    events.map(async (event, index) => ({
      ...event,
      id: Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(identities[index]),
          ),
        ),
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join(""),
    })),
  );
}
const escape = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/\r/g, "");
export function exportCalendar(
  title: string,
  events: CalendarEvent[],
  calendarId: string,
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WahO//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escape(title)}`,
  ];
  for (const event of events) {
    const stamp = (value: string) =>
      value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escape(calendarId + "-" + event.id)}@calendar.waho`,
      "DTSTAMP:" + stamp(new Date().toISOString()),
      `DTSTART${event.allDay ? ";VALUE=DATE" : ""}:${stamp(event.start)}`,
      `DTEND${event.allDay ? ";VALUE=DATE" : ""}:${stamp(event.end)}`,
      `SUMMARY:${escape(event.title)}`,
      `DESCRIPTION:${escape(event.description)}`,
      `LOCATION:${escape(event.location)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return (
    lines
      .map((line) => {
        let result = "",
          bytes = 0;
        for (const character of line) {
          const size = new TextEncoder().encode(character).length;
          if (bytes + size > 73) {
            result += "\r\n ";
            bytes = 1;
          }
          result += character;
          bytes += size;
        }
        return result;
      })
      .join("\r\n") + "\r\n"
  );
}

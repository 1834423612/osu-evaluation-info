import type { CalendarEvent } from "./model.ts";
import { newYorkTime } from "./schedules.ts";
import { newYorkDate } from "./dates.ts";

/** Official all-day dates are already local dates, with an exclusive end. */
export function noClassEventsForDate(events: CalendarEvent[], date: string) {
  return events.filter(
    (event) =>
      event.allDay &&
      event.noClasses === true &&
      event.category === "holiday" &&
      event.id.startsWith("official-") &&
      event.url === "https://registrar.osu.edu/academic-calendar/" &&
      event.start <= date &&
      event.end > date,
  );
}
const palette = [
  "#326fa4",
  "#287363",
  "#a04867",
  "#7150a0",
  "#956c25",
  "#b45424",
  "#994a8a",
  "#517d35",
];
const courseColorKey = (title: string) =>
  title.match(/^[A-Z][A-Z& ]{1,11}\s+\d{4}(?:\.\d{1,2})?[A-Z]?\b/)?.[0] ??
  title;
export function eventColor(
  title: string,
  category?: CalendarEvent["category"],
) {
  const key = courseColorKey(title);
  let hash = 2166136261;
  for (const char of key)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;
  const offset = category
    ? { class: 0, assignment: 1, exam: 5, holiday: 3, event: 2 }[category]
    : 0;
  return palette[(hash + offset) % palette.length];
}
/** Stable within a displayed set; keep up to eight course/category keys distinct. */
export function eventColors(
  events: Pick<CalendarEvent, "id" | "title" | "category">[],
) {
  const key = (event: Pick<CalendarEvent, "title" | "category">) =>
    JSON.stringify([courseColorKey(event.title), event.category]);
  const groups = new Map(events.map((event) => [key(event), event]));
  const used = new Set<string>(),
    colors = new Map<string, string>();
  for (const id of [...groups.keys()].sort()) {
    const event = groups.get(id)!;
    const base = palette.indexOf(eventColor(event.title, event.category));
    let index = base;
    while (used.size < palette.length && used.has(palette[index]))
      index = (index + 1) % palette.length;
    colors.set(id, palette[index]);
    used.add(palette[index]);
  }
  return Object.fromEntries(
    events.map((event) => [event.id, colors.get(key(event))!]),
  );
}
const easternClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export const easternMinutes = (value: string) => {
  const [hour, minute] = easternClock
    .format(new Date(value))
    .split(":")
    .map(Number);
  return hour * 60 + minute;
};
/** Shared bounds across saved alternatives, including classes outside core hours. */
export function calendarTimeBounds(events: CalendarEvent[]) {
  let start = 480,
    end = 1080;
  for (const event of events) {
    if (event.allDay) continue;
    if (newYorkDate(new Date(event.start)) !== newYorkDate(new Date(event.end)))
      return { start: 0, end: 1440 };
    start = Math.min(start, Math.floor(easternMinutes(event.start) / 60) * 60);
    end = Math.max(end, Math.ceil(easternMinutes(event.end) / 60) * 60);
  }
  return { start, end };
}
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
type WeekSegment = ReturnType<typeof weekSegments>[number];
/** Partition each day's interval graph. Dense groups can open a full-width list. */
export function weekOverlapGroups(segments: WeekSegment[]) {
  const groups: {
    id: string;
    date: string;
    from: number;
    to: number;
    lanes: number;
    items: (WeekSegment & { lane: number })[];
  }[] = [];
  for (const date of [...new Set(segments.map((segment) => segment.date))]) {
    const daily = segments
      .filter((segment) => segment.date === date)
      .sort(
        (a, b) =>
          a.from - b.from ||
          a.to - b.to ||
          a.event.id.localeCompare(b.event.id),
      );
    for (let offset = 0; offset < daily.length;) {
      const items: (WeekSegment & { lane: number })[] = [],
        ends: number[] = [];
      let boundary = daily[offset].to,
        index = offset;
      while (
        index < daily.length &&
        (index === offset || daily[index].from < boundary)
      ) {
        const segment = daily[index++],
          to = Math.min(
            1440,
            Math.max(
              segment.from +
                (segment.event.start === segment.event.end ? 50 : 23),
              segment.to,
            ),
          );
        let lane = ends.findIndex((end) => end <= segment.from);
        if (lane < 0) lane = ends.length;
        ends[lane] = to;
        boundary = Math.max(boundary, to);
        items.push({ ...segment, to, lane });
      }
      groups.push({
        id: `${date}-${daily[offset].from}-${daily[offset].event.id}`,
        date,
        from: daily[offset].from,
        to: boundary,
        lanes: ends.length,
        items,
      });
      offset = index;
    }
  }
  return groups;
}

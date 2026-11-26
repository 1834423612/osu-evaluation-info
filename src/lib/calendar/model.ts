import { z } from "zod";
const id = z.string().min(1).max(100);
/** Minutes before the start. Empty means no alarms; missing inherits defaults. */
export const reminderSchema = z
  .array(z.number().int().min(0).max(43200))
  .max(5)
  .transform((values) => [...new Set(values)].sort((a, b) => a - b));
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/)
  .refine((value) => {
    const parsed = new Date(value);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value.slice(0, 10)
    );
  }, "Invalid date");
export const calendarEventSchema = z
  .object({
    id: z.string().min(1).max(800),
    title: z.string().max(500),
    start: date,
    end: date,
    allDay: z.boolean(),
    category: z.enum(["class", "assignment", "exam", "holiday", "event"]),
    /** Registrar no-class dates; ordinary all-day events do not imply a closure. */
    noClasses: z.boolean().optional(),
    description: z.string().max(4000).default(""),
    location: z.string().max(500).default(""),
    url: z.string().url().max(1500).optional(),
    session: z.string().max(100).optional(),
    reminders: reminderSchema.optional(),
  })
  .strip()
  .refine(
    (event) =>
      Date.parse(event.end) >= Date.parse(event.start) &&
      (event.allDay
        ? event.start.length === 10 && event.end.length === 10
        : event.start.length > 10 && event.end.length > 10),
    "Event end must follow start and use the same date format",
  );
export const calendarSchema = z
  .object({
    id,
    title: z.string().min(1).max(120),
    description: z.string().max(1000).default(""),
    icon: z
      .enum(["calendar", "book", "graduation", "star"])
      .default("calendar"),
    color: z.enum(["rose", "blue", "mint", "violet", "amber"]).default("blue"),
    kind: z.enum(["simulation", "personal", "feed", "combined", "official"]),
    term: z.string().max(20).optional(),
    campus: z.string().max(8).optional(),
    fingerprint: z.string().max(10000).optional(),
    sourceIds: z.array(id).max(30).default([]),
    includeAcademic: z.boolean().default(true),
    range: z
      .object({ start: date, end: date })
      .refine((range) => range.start <= range.end, "Invalid calendar range")
      .optional(),
    feedUrl: z.string().url().max(2000).optional(),
    refreshedAt: z.string().max(40).optional(),
    events: z.array(calendarEventSchema).max(3000),
    reminders: reminderSchema.optional(),
    active: z.boolean().default(true),
    updatedAt: z.string().max(40),
  })
  .strip();
export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type UserCalendar = z.infer<typeof calendarSchema>;
/** Missing sources must not consume a combined calendar's selection capacity. */
export function availableSourceIds(
  calendar: UserCalendar,
  calendars: UserCalendar[],
) {
  const available = new Set(
    calendars
      .filter((source) => source.id !== calendar.id)
      .map((source) => source.id),
  );
  return [...new Set(calendar.sourceIds)].filter((id) => available.has(id));
}
/** Apply remote source data to the current calendar, preserving in-flight edits. */
export function applyCalendarRefresh(
  current: UserCalendar,
  source: UserCalendar,
): UserCalendar {
  return {
    ...current,
    events: source.events,
    refreshedAt: source.refreshedAt,
    updatedAt: source.updatedAt,
  };
}
export function combinedEvents(
  calendars: UserCalendar[],
  selected: UserCalendar,
): CalendarEvent[] {
  const visited = new Set<string>(),
    rows = new Map<string, CalendarEvent>();
  function add(calendar: UserCalendar, inheritedReminders?: number[]) {
    if (visited.has(calendar.id)) return;
    visited.add(calendar.id);
    const defaults = inheritedReminders ?? calendar.reminders;
    for (const original of calendar.events) {
      const reminders = original.reminders ?? defaults;
      const event =
        reminders === undefined ? original : { ...original, reminders };
      rows.set(
        event.id.startsWith("official-")
          ? event.id
          : JSON.stringify([calendar.id, event.id]),
        calendar.id === selected.id || event.id.startsWith("official-")
          ? event
          : { ...event, id: JSON.stringify([calendar.id, event.id]) },
      );
    }
    for (const child of calendar.sourceIds) {
      const source = calendars.find((c) => c.id === child);
      if (source) add(source, defaults);
    }
  }
  add(selected);
  return [...rows.values()].sort((a, b) => a.start.localeCompare(b.start));
}

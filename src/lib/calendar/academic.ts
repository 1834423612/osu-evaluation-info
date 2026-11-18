import { z } from "zod";
import type { CalendarEvent, UserCalendar } from "./model.ts";
export const academicDaySchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(500),
  categories: z.array(z.string()),
  noClasses: z.boolean(),
  kind: z.enum(["holiday", "exam", "term", "deadline"]),
});
export type AcademicDay = z.infer<typeof academicDaySchema>;
export function normalizeAcademicEntries(entries: unknown[]) {
  const source = z.object({
    ID: z.number(),
    DateTime: z.string(),
    EndDateTime: z.string(),
    Title: z.string(),
    Type: z.array(z.string()).nullable(),
  });
  const rows = new Map<string, AcademicDay>();
  for (const raw of entries) {
    const item = source.parse(raw),
      date = item.DateTime.slice(0, 10),
      end = item.EndDateTime.startsWith("0001")
        ? date
        : item.EndDateTime.slice(0, 10);
    const id = String(item.ID);
    const previous = rows.get(id);
    rows.set(
      id,
      academicDaySchema.parse({
        id,
        date: previous && previous.date < date ? previous.date : date,
        end: previous && previous.end > end ? previous.end : end,
        title: item.Title.trim(),
        categories: item.Type ?? [],
        noClasses:
          /no classes|spring break|autumn break|academic winter recess/i.test(
            item.Title,
          ),
        kind: /exam/i.test(item.Title)
          ? "exam"
          : /no classes|holiday|offices closed|break|recess/i.test(item.Title)
            ? "holiday"
            : /first day|last day of classes|commencement/i.test(item.Title)
              ? "term"
              : "deadline",
      }),
    );
  }
  return [...rows.values()];
}
export function isNoClassDate(date: string, days: AcademicDay[]) {
  return days.some(
    (day) => day.noClasses && date >= day.date && date <= day.end,
  );
}
export function academicEvents(days: AcademicDay[]): CalendarEvent[] {
  return days
    .filter((day) => day.kind !== "deadline")
    .map((day) => ({
      id: "official-" + day.id,
      title: day.title,
      start: day.date,
      end: new Date(Date.parse(day.end + "T12:00:00Z") + 86400000)
        .toISOString()
        .slice(0, 10),
      allDay: true,
      category:
        day.kind === "exam"
          ? "exam"
          : day.kind === "holiday"
            ? "holiday"
            : "event",
      description: "OSU University Registrar",
      location: "",
    }));
}
export function academicForCalendar(
  calendar: UserCalendar,
  events: CalendarEvent[],
  days: AcademicDay[],
) {
  if (!calendar.includeAcademic) return [];
  const from =
      calendar.range?.start ??
      events.map((event) => event.start.slice(0, 10)).sort()[0],
    to =
      calendar.range?.end ??
      events
        .map((event) => event.end.slice(0, 10))
        .sort()
        .at(-1);
  if (!from || !to) return [];
  return academicEvents(days).filter(
    (event) => event.start <= to && event.end > from,
  );
}

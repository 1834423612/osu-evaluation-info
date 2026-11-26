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
export function academicEvents(
  days: AcademicDay[],
  includeDeadlines = false,
): CalendarEvent[] {
  return days
    .filter((day) => includeDeadlines || day.kind !== "deadline")
    .map((day) => ({
      id: "official-" + day.id,
      title: day.title,
      start: day.date,
      end: new Date(Date.parse(day.end + "T12:00:00Z") + 86400000)
        .toISOString()
        .slice(0, 10),
      allDay: true,
      noClasses: day.noClasses,
      category:
        day.kind === "exam"
          ? "exam"
          : day.kind === "holiday"
            ? "holiday"
            : "event",
      description: "OSU University Registrar",
      location: "",
      url: "https://registrar.osu.edu/academic-calendar/",
    }));
}
export const OFFICIAL_CALENDAR_IDS = [
  "osu-official-academic",
  "osu-official-holidays",
  "osu-official-deadlines",
] as const;
/** Shared database sources are references, never duplicate private event copies. */
export function officialCalendars(
  days: AcademicDay[],
  locale: "en" | "zh" = "en",
): UserCalendar[] {
  return OFFICIAL_CALENDAR_IDS.map((id, index) => ({
    id,
    title: (locale === "zh"
      ? ["学期与考试", "假期与停课", "注册与缴费截止"]
      : ["Terms & exams", "Holidays & breaks", "Registration deadlines"])[
      index
    ],
    description:
      locale === "zh"
        ? "OSU University Registrar 官方校历"
        : "Official dates from OSU University Registrar",
    icon: index === 0 ? "graduation" : index === 1 ? "calendar" : "book",
    color: index === 0 ? "blue" : index === 1 ? "amber" : "violet",
    kind: "official",
    sourceIds: [],
    includeAcademic: false,
    active: true,
    updatedAt: "",
    events: academicEvents(
      days.filter((day) =>
        index === 0
          ? ["term", "exam"].includes(day.kind)
          : index === 1
            ? day.kind === "holiday"
            : day.kind === "deadline",
      ),
      true,
    ),
  }));
}
export function isOfficialCalendar(id: string) {
  return (OFFICIAL_CALENDAR_IDS as readonly string[]).includes(id);
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

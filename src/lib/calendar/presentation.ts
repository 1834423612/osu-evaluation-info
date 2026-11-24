import type { CalendarEvent } from "./model.ts";
import type { Locale } from "../i18n.ts";

export type CalendarShareStatus = {
  calendarIds: string[];
  expiresAt: string | null;
  revokedAt?: string | null;
};

/** Preserve the whole catalog code, including decimals and honors suffixes. */
export function compactCourseCode(title: string): string | null {
  const code = title.match(
    /^([A-Z][A-Z&/-]{0,14})\s*(\d{3,5}(?:\.\d{1,3})?[A-Z]?)(?=\s|[·:|–—-]|$)/u,
  );
  return code ? code[1] + code[2] : null;
}

/** Timed events use Eastern dates; all-day end dates are exclusive. */
export function calendarEventWhen(
  event: Pick<CalendarEvent, "start" | "end" | "allDay">,
  locale: Locale,
): { date: string; time: string | null } {
  const language = locale === "zh" ? "zh-CN" : "en-US";
  const timeZone = event.allDay ? "UTC" : "America/New_York";
  const start = new Date(event.start);
  const end = new Date(
    Date.parse(event.end) -
      (event.allDay && event.end > event.start ? 86400000 : 0),
  );
  const date = new Intl.DateTimeFormat(language, {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  });
  const firstDate = date.format(start);
  const lastDate = date.format(end);
  const time = new Intl.DateTimeFormat(language, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    date: firstDate === lastDate ? firstDate : date.formatRange(start, end),
    time: event.allDay
      ? null
      : start.getTime() === end.getTime()
        ? time.format(start)
        : time.formatRange(start, end),
  };
}

/** Status is derived from current owned links, never persisted on a calendar. */
export function activeSharedCalendarIds(
  links: readonly CalendarShareStatus[],
  ownedIds: readonly string[],
  now = Date.now(),
): Set<string> {
  const owned = new Set(ownedIds);
  return new Set(
    links
      .filter(
        (link) =>
          !link.revokedAt &&
          (link.expiresAt === null || Date.parse(link.expiresAt) > now),
      )
      .flatMap((link) => link.calendarIds.filter((id) => owned.has(id))),
  );
}

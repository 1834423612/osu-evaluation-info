"use client";
import type { CalendarEvent } from "@/lib/calendar/model";
import type { Locale } from "@/lib/i18n";
import { newYorkDate } from "@/lib/calendar/dates";
import styles from "./calendar-month.module.css";

export function CalendarMonth({
  date,
  events,
  locale,
  onEvent,
}: {
  date: string;
  events: CalendarEvent[];
  locale: Locale;
  onEvent: (event: CalendarEvent, anchor?: HTMLElement) => void;
}) {
  const month = date.slice(0, 7),
    first = new Date(month + "-01T12:00:00Z");
  first.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) =>
    new Date(+first + index * 86400000).toISOString().slice(0, 10),
  );
  const today = newYorkDate();
  return (
    <div className={styles.month}>
      <div className={styles.head}>
        {days.slice(0, 7).map((day) => (
          <strong key={day}>
            {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
              weekday: "short",
              timeZone: "UTC",
            }).format(new Date(day + "T12:00:00Z"))}
          </strong>
        ))}
      </div>
      <div className={styles.grid}>
        {days.map((day) => {
          const daily = events
            .filter(
              (event) =>
                event.start.slice(0, 10) <= day && event.end.slice(0, 10) > day,
            )
            .sort((a, b) => a.start.localeCompare(b.start));
          return (
            <section
              className={styles.day}
              data-outside={!day.startsWith(month) || undefined}
              key={day}
              aria-label={day}
            >
              <span
                className={styles.number}
                data-today={day === today || undefined}
              >
                {Number(day.slice(-2))}
              </span>
              {daily.slice(0, 3).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  data-category={event.category}
                  title={event.title}
                  onClick={(click) => onEvent(event, click.currentTarget)}
                >
                  {event.title.split(" | ")[0]}
                </button>
              ))}
              {daily.length > 3 ? (
                <details>
                  <summary>
                    +{daily.length - 3} {locale === "zh" ? "项" : "more"}
                  </summary>
                  {daily.slice(3).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={(click) => onEvent(event, click.currentTarget)}
                    >
                      {event.title.split(" | ")[0]}
                    </button>
                  ))}
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

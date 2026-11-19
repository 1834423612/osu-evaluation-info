"use client";
import type { CalendarEvent } from "@/lib/calendar/model";
import styles from "./calendar.module.css";
/** Same miniature appears in simulation groups, the calendar list and shared previews. */
export function CalendarPreview({ events }: { events: CalendarEvent[] }) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const positions = [
    ...new Map(
      events
        .filter((event) => !event.allDay)
        .map((event) => {
          const parts = Object.fromEntries(
            format
              .formatToParts(new Date(event.start))
              .map((p) => [p.type, p.value]),
          );
          const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
            parts.weekday,
          );
          const minute = Number(parts.hour) * 60 + Number(parts.minute),
            duration = Math.max(
              15,
              (Date.parse(event.end) - Date.parse(event.start)) / 60000,
            );
          return [
            `${event.title}-${day}-${minute}`,
            { ...event, day, minute, duration },
          ];
        }),
    ).values(),
  ];
  return (
    <div className={styles.mini} aria-hidden="true">
      {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
        <span key={index}>{day}</span>
      ))}
      <div>
        {!positions.length &&
          events
            .filter((event) => event.allDay)
            .slice(0, 3)
            .map((event, index) => (
              <i
                key={event.id}
                style={{
                  left: "3%",
                  top: `${8 + index * 26}%`,
                  height: "14%",
                  width: `${90 - index * 9}%`,
                }}
              />
            ))}
        {positions.slice(0, 40).map((event, index) => (
          <i
            key={index}
            style={{
              left: `${(event.day * 100) / 7}%`,
              top: `${(Math.max(0, event.minute - 420) / 900) * 100}%`,
              height: `${(Math.min(event.duration, 240) / 900) * 100}%`,
              width: `${100 / 7 - 1}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

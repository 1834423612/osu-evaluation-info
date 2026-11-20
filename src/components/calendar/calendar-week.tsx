"use client";
import { Clock3, MapPin, Globe2 } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar/model";
import type { Locale } from "@/lib/i18n";
import styles from "./calendar-week.module.css";
import { weekSegments, eventColor } from "@/lib/calendar/week";
import type { CSSProperties } from "react";

export const calendarDate = (event: CalendarEvent) =>
  event.allDay
    ? event.start
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(event.start));
/** Shared, date-aware week grid. All seven headings remain on one row on phones. */
export function CalendarWeek({
  events,
  dates,
  locale,
  onEvent,
}: {
  events: CalendarEvent[];
  dates: string[];
  locale: Locale;
  onEvent?: (event: CalendarEvent, anchor?: HTMLElement) => void;
}) {
  const timed = weekSegments(events, dates);
  const start = Math.max(
    0,
    Math.min(
      480,
      ...timed.map((segment) => Math.floor(segment.from / 60) * 60),
    ),
  );
  const end = Math.min(
    1440,
    Math.max(1080, ...timed.map((segment) => Math.ceil(segment.to / 60) * 60)),
  );
  const hours = Array.from(
    { length: (end - start) / 60 + 1 },
    (_, index) => start + index * 60,
  );
  const time = (value: string) =>
    new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  return (
    <div className={styles.week}>
      <div className={styles.head}>
        <span className={styles.zone}>ET</span>
        {dates.map((date) => (
          <strong key={date}>
            {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
              timeZone: "UTC",
              weekday: "short",
            }).format(new Date(date + "T12:00:00Z"))}
            <small>{date.slice(5)}</small>
          </strong>
        ))}
      </div>
      <div className={styles.allDay}>
        <span>{locale === "zh" ? "全天" : "All day"}</span>
        {dates.map((date) => (
          <div key={date}>
            {events
              .filter(
                (event) =>
                  event.allDay && event.start <= date && event.end > date,
              )
              .map((event) => (
                <button
                  type="button"
                  onClick={(click) => onEvent?.(event, click.currentTarget)}
                  className={styles.banner}
                  data-category={event.category}
                  key={event.id}
                  title={event.title}
                >
                  {event.title}
                </button>
              ))}
          </div>
        ))}
      </div>
      <div className={styles.grid} style={{ height: (end - start) * 0.8 }}>
        <div className={styles.times}>
          {hours.map((hour) => (
            <span
              key={hour}
              style={{ top: ((hour - start) / (end - start)) * 100 + "%" }}
            >
              {String(hour / 60).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {dates.map((date) => {
          const daily = timed
            .filter((segment) => segment.date === date)
            .sort((a, b) => a.from - b.from);
          const positioned: {
            event: CalendarEvent;
            lane: number;
            lanes: number;
            from: number;
            to: number;
          }[] = [];
          for (let offset = 0; offset < daily.length;) {
            const group: typeof positioned = [],
              ends: number[] = [];
            let boundary = daily[offset].to,
              index = offset;
            while (
              index < daily.length &&
              (index === offset || daily[index].from < boundary)
            ) {
              const segment = daily[index++],
                { event, from } = segment,
                to = Math.max(
                  from + (event.start === event.end ? 50 : 23),
                  segment.to,
                );
              let lane = ends.findIndex((value) => value <= from);
              if (lane < 0) lane = ends.length;
              ends[lane] = to;
              boundary = Math.max(boundary, to);
              group.push({ event, lane, lanes: 1, from, to });
            }
            positioned.push(
              ...group.map((item) => ({ ...item, lanes: ends.length })),
            );
            offset = index;
          }
          return (
            <div
              key={date}
              className={styles.column}
              data-holiday={events.some(
                (event) =>
                  event.category === "holiday" &&
                  event.start <= date &&
                  event.end > date,
              )}
            >
              {positioned.map(({ event, lane, lanes, from, to }) => {
                const duration = Math.max(15, to - from),
                  online = /online|distance|zoom/i.test(
                    event.location + " " + event.description,
                  );
                const editable = onEvent && !event.id.startsWith("official-");
                const content = (
                  <>
                    <strong>{event.title}</strong>
                    <span>
                      <Clock3 size={10} />
                      {time(event.start)}
                      {event.end !== event.start ? "–" + time(event.end) : ""}
                    </span>
                    {event.location && (
                      <span>
                        {online ? <Globe2 size={10} /> : <MapPin size={10} />}
                        {event.location}
                      </span>
                    )}
                    {event.session && <small>{event.session}</small>}
                  </>
                );
                const position = {
                  "--event-color": eventColor(event.title),
                  top: ((from - start) / (end - start)) * 100 + "%",
                  height: (duration / (end - start)) * 100 + "%",
                  left: (lane / lanes) * 100 + "%",
                  width: 100 / lanes + "%",
                } as CSSProperties;
                return editable ? (
                  <button
                    key={event.id}
                    className={styles.event}
                    data-category={event.category}
                    data-online={online}
                    data-point={event.start === event.end || undefined}
                    title={`${event.title}\n${time(event.start)}–${time(event.end)}\n${event.location}`}
                    style={position}
                    onClick={(click) => onEvent(event, click.currentTarget)}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={event.id}
                    className={styles.event}
                    data-category={event.category}
                    data-online={online}
                    data-point={event.start === event.end || undefined}
                    style={position}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className={styles.caption}>
        {locale === "zh"
          ? "美国东部时间 · 线上课程以地球图标标识"
          : "Eastern time · Globe icons indicate online meetings"}
      </p>
    </div>
  );
}

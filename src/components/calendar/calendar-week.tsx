"use client";
import { Clock3, MapPin, Globe2 } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar/model";
import { compactCourseCode } from "@/lib/calendar/presentation";
import type { Locale } from "@/lib/i18n";
import styles from "./calendar-week.module.css";
import {
  weekSegments,
  weekOverlapGroups,
  eventColors,
} from "@/lib/calendar/week";
import { useRef } from "react";
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
  fit = false,
  timeBounds,
}: {
  events: CalendarEvent[];
  dates: string[];
  locale: Locale;
  onEvent?: (event: CalendarEvent, anchor?: HTMLElement) => void;
  fit?: boolean;
  timeBounds?: { start: number; end: number };
}) {
  const timed = weekSegments(events, dates);
  const colors = eventColors(events);
  const groups = weekOverlapGroups(timed);
  const crowded = groups.filter((group) => group.lanes >= 3);
  const legend = [
    ...new Map(
      events
        .filter((event) => event.category === "class")
        .map((event) => [event.title, event]),
    ).values(),
  ];
  const detailRefs = useRef(new Map<string, HTMLDetailsElement>());
  const start =
    timeBounds?.start ??
    Math.max(
      0,
      Math.min(
        480,
        ...timed.map((segment) => Math.floor(segment.from / 60) * 60),
      ),
    );
  const end =
    timeBounds?.end ??
    Math.min(
      1440,
      Math.max(
        1080,
        ...timed.map((segment) => Math.ceil(segment.to / 60) * 60),
      ),
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
    <div
      className={styles.week}
      data-fit={fit || undefined}
      style={{ "--hour-count": (end - start) / 60 } as CSSProperties}
    >
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
      {(!fit || events.some((event) => event.allDay)) && (
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
                    style={
                      {
                        "--event-color": colors[event.id],
                      } as CSSProperties
                    }
                    key={event.id}
                    title={event.title}
                  >
                    {event.title}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
      <div
        className={styles.grid}
        style={fit ? undefined : { height: (end - start) * 0.8 }}
      >
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
          const dailyGroups = groups.filter((group) => group.date === date);
          const positioned = dailyGroups
            .filter((group) => group.lanes < 3)
            .flatMap((group) =>
              group.items.map((item) => ({ ...item, lanes: group.lanes })),
            );
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
              {dailyGroups
                .filter((group) => group.lanes >= 3)
                .map((group) => (
                  <button
                    type="button"
                    key={group.id}
                    className={styles.crowded}
                    style={{
                      top: `${((group.from - start) / (end - start)) * 100}%`,
                      height: `${((group.to - group.from) / (end - start)) * 100}%`,
                    }}
                    aria-label={
                      locale === "zh"
                        ? `${date}，${group.items.length} 项重叠日程，查看完整清单`
                        : `${date}, ${group.items.length} overlapping events, view full list`
                    }
                    onClick={() => {
                      const detail = detailRefs.current.get(group.id);
                      if (!detail) return;
                      detail.open = true;
                      detail.scrollIntoView({ block: "nearest" });
                      detail
                        .querySelector("summary")
                        ?.focus({ preventScroll: true });
                    }}
                  >
                    <strong>
                      <span className={styles.fullLabel}>
                        {group.items.length}{" "}
                        {locale === "zh" ? "项日程" : "events"}
                      </span>
                      <span className={styles.shortLabel}>
                        {group.items.length}
                      </span>
                    </strong>
                    <span className={styles.colorDots}>
                      {group.items.slice(0, 3).map(({ event }) => (
                        <i
                          key={event.id}
                          style={{
                            background: colors[event.id],
                          }}
                        />
                      ))}
                    </span>
                    <small>
                      <span className={styles.fullLabel}>
                        {locale === "zh" ? "查看清单" : "View list"}
                      </span>
                      <span className={styles.shortLabel}>
                        {locale === "zh" ? "查看" : "List"}
                      </span>
                    </small>
                  </button>
                ))}
              {positioned.map(({ event, lane, lanes, from, to }) => {
                const duration = Math.max(15, to - from),
                  online = /online|distance|zoom/i.test(
                    event.location + " " + event.description,
                  );
                const editable = !!onEvent;
                const courseCode = compactCourseCode(event.title);
                const numberStart = courseCode?.search(/\d/) ?? 0;
                const content = (
                  <>
                    <strong
                      className={styles.eventTitle}
                      data-has-code={!!courseCode || undefined}
                    >
                      {event.title}
                    </strong>
                    {courseCode && (
                      <strong className={styles.courseCode} data-compact-code>
                        {courseCode.slice(0, numberStart)}
                        <wbr />
                        {courseCode.slice(numberStart)}
                      </strong>
                    )}
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
                  "--event-color": colors[event.id],
                  top: ((from - start) / (end - start)) * 100 + "%",
                  height: (duration / (end - start)) * 100 + "%",
                  left: (lane / lanes) * 100 + "%",
                  width: 100 / lanes + "%",
                } as CSSProperties;
                return editable ? (
                  <button
                    key={event.id}
                    type="button"
                    className={styles.event}
                    data-category={event.category}
                    data-lanes={lanes}
                    data-online={online}
                    data-point={event.start === event.end || undefined}
                    title={`${event.title}\n${time(event.start)}–${time(event.end)}\n${event.location}`}
                    aria-label={`${event.title}, ${time(event.start)}–${time(event.end)}${event.location ? ", " + event.location : ""}`}
                    style={position}
                    onClick={(click) => onEvent?.(event, click.currentTarget)}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    key={event.id}
                    className={styles.event}
                    data-category={event.category}
                    data-lanes={lanes}
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
      {crowded.length ? (
        <div className={styles.overlaps}>
          {crowded.map((group) => (
            <details
              key={group.id}
              open
              ref={(node) => {
                if (node) detailRefs.current.set(group.id, node);
                else detailRefs.current.delete(group.id);
              }}
            >
              <summary>
                {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
                  month: "short",
                  day: "numeric",
                  weekday: "short",
                  timeZone: "UTC",
                }).format(new Date(group.date + "T12:00:00Z"))}{" "}
                · {String(Math.floor(group.from / 60)).padStart(2, "0")}:
                {String(group.from % 60).padStart(2, "0")} ·{" "}
                {group.items.length}{" "}
                {locale === "zh" ? "项重叠日程" : "overlapping events"}
              </summary>
              <div className={styles.overlapItems}>
                {group.items.map(({ event }) => (
                  <button
                    type="button"
                    key={event.id}
                    style={
                      {
                        "--event-color": colors[event.id],
                      } as CSSProperties
                    }
                    onClick={(click) => onEvent?.(event, click.currentTarget)}
                  >
                    <span className={styles.eventDot} />
                    <span>
                      <strong>{event.title}</strong>
                      <small>
                        {time(event.start)}
                        {event.end !== event.start ? "–" + time(event.end) : ""}
                        {event.location ? " · " + event.location : ""}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : null}
      {fit && legend.length > 0 && (
        <div
          className={styles.legend}
          aria-label={locale === "zh" ? "课程颜色" : "Course colors"}
        >
          {legend.map((event) => (
            <span key={event.title}>
              <i style={{ background: colors[event.id] }} />
              {event.title}
            </span>
          ))}
        </div>
      )}
      <p className={styles.caption}>
        {locale === "zh"
          ? "美国东部时间 · 线上课程以地球图标标识"
          : "Eastern time · Globe icons indicate online meetings"}
      </p>
    </div>
  );
}

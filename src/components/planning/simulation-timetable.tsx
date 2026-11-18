"use client";

import { useEffect, useRef, useState } from "react";
import {
  Clock3,
  MapPin,
  MonitorPlay,
  CircleHelp,
  AlertTriangle,
} from "lucide-react";
import type { CatalogCourse } from "@/lib/catalog/types";
import type { SimulationChoice } from "@/lib/planning/simulation";
import {
  timetableMeetings,
  type MeetingDelivery,
} from "@/lib/planning/timetable";
import { text, type Locale } from "@/lib/i18n";
import styles from "./semester-simulation.module.css";
import { SessionTimeline } from "@/components/calendar/session-timeline";
import { sessionWeeks } from "@/lib/calendar/session-weeks";
import { isNoClassDate, type AcademicDay } from "@/lib/calendar/academic";

const timeLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const deliveryIcons = {
  online: MonitorPlay,
  "in-person": MapPin,
  unknown: CircleHelp,
};

export function SimulationTimetable({
  choices,
  courses,
  conflicted,
  locale,
  academic = [],
}: {
  choices: SimulationChoice[];
  courses: CatalogCourse[];
  conflicted: Set<string>;
  locale: Locale;
  academic?: AcademicDay[];
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState("");
  const weeks = sessionWeeks(choices).weeks;
  const week = weeks.includes(selectedWeek) ? selectedWeek : (weeks[0] ?? "");
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedId)
      detail.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [selectedId]);
  const days =
    locale === "zh"
      ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const meetings = timetableMeetings(choices);
  const events = meetings.flatMap((meeting) =>
    meeting.slots
      .filter((slot) => {
        if (!week) return true;
        const date = new Date(
          Date.parse(week + "T12:00:00Z") + slot.day * 86400000,
        )
          .toISOString()
          .slice(0, 10);
        return (
          (!meeting.startDate || date >= meeting.startDate) &&
          (!meeting.endDate || date <= meeting.endDate) &&
          !isNoClassDate(date, academic)
        );
      })
      .map((slot) => ({
        ...meeting,
        ...slot,
        id: `${meeting.id}|${slot.day}`,
      })),
  );
  const unscheduled = meetings.filter((meeting) => !meeting.slots.length);
  const selected = events.find((event) => event.id === selectedId);
  const courseTitle = (key: string) =>
    courses.find(
      (course) => `${course.subject} ${course.catalogNumber}` === key,
    )?.title;
  const deliveryLabel = (delivery: MeetingDelivery) =>
    ({
      online: t("Online", "线上"),
      "in-person": t("In person", "线下"),
      unknown: t("TBA", "待定"),
    })[delivery];
  const locationLabel = (delivery: MeetingDelivery, location: string | null) =>
    delivery === "online"
      ? t("Online class · join at the listed time", "线上授课 · 按标注时间上课")
      : location || t("Location TBA", "地点待公布");

  return (
    <>
      <SessionTimeline
        choices={choices}
        academic={academic}
        selected={week}
        onSelect={setSelectedWeek}
        locale={locale}
      />
      {week &&
        academic
          .filter(
            (day) =>
              day.noClasses &&
              day.date <=
                new Date(Date.parse(week) + 6 * 86400000)
                  .toISOString()
                  .slice(0, 10) &&
              day.end >= week,
          )
          .map((day) => (
            <p className={styles.warning} key={day.id}>
              {day.title} · {day.date} — {day.end}
            </p>
          ))}
      <div className={styles.timetableLegend}>
        <span>
          <MapPin size={12} />
          {t("In person", "线下")}
        </span>
        <span data-delivery="online">
          <MonitorPlay size={12} />
          {t("Online", "线上")}
        </span>
        <small>{t("Tap a class for details", "点击课程查看详情")}</small>
      </div>
      <div
        className={styles.week}
        data-weekend={events.some((event) => event.day > 4)}
        aria-label={t("Week at a glance", "一周课程概览")}
      >
        {days.map((label, day) => {
          const daily = events
            .filter((event) => event.day === day)
            .sort((a, b) => a.start - b.start);
          return (
            <section
              key={day}
              hidden={day > 4 && !daily.length}
              aria-label={label}
            >
              <h4>
                {label}
                <small>
                  {daily.length} {t("classes", "节课")}
                </small>
              </h4>
              {!daily.length && (
                <div
                  className={styles.noMeetings}
                  aria-label={t("No scheduled classes", "无定时课程")}
                >
                  —
                </div>
              )}
              {daily.map((event) => {
                const Icon = deliveryIcons[event.delivery];
                const split = event.key.lastIndexOf(" ");
                return (
                  <button
                    type="button"
                    className={styles.meeting}
                    data-delivery={event.delivery}
                    data-conflict={conflicted.has(event.key)}
                    key={event.id}
                    aria-pressed={event.id === selectedId}
                    aria-label={`${event.key} · ${label} ${timeLabel(event.start)}–${timeLabel(event.end)} · ${deliveryLabel(event.delivery)} · ${courseTitle(event.key) ?? ""} · ${event.location ?? ""}`}
                    onClick={() =>
                      setSelectedId(event.id === selectedId ? null : event.id)
                    }
                  >
                    <span className={styles.delivery}>
                      <Icon size={12} />
                      <span>{deliveryLabel(event.delivery)}</span>
                    </span>
                    <strong className={styles.meetingCode}>
                      <span>{event.key.slice(0, split)}</span>
                      <span>{event.key.slice(split + 1)}</span>
                    </strong>
                    <span className={styles.time}>
                      <Clock3 size={12} aria-hidden="true" />
                      <time>{timeLabel(event.start)}</time>
                      <span aria-hidden="true">–</span>
                      <time>{timeLabel(event.end)}</time>
                    </span>
                    <span className={styles.meetingTitle}>
                      {courseTitle(event.key)}
                    </span>
                    {event.delivery !== "online" && (
                      <span className={styles.meetingLocation}>
                        {event.location || t("Location TBA", "地点待公布")}
                      </span>
                    )}
                    {conflicted.has(event.key) && (
                      <span className={styles.conflictLabel}>
                        <AlertTriangle size={12} />
                        {t("Conflict", "冲突")}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
      {selected && (
        <section
          ref={detail}
          className={styles.meetingDetail}
          data-delivery={selected.delivery}
          aria-label={t("Selected class details", "所选课程详情")}
          aria-live="polite"
        >
          <div>
            <strong>{selected.key}</strong>
            <span className={styles.delivery}>
              {deliveryLabel(selected.delivery)}
            </span>
            <small>
              {t("Section", "班次")} {selected.section} · {selected.component}
            </small>
            <small title={selected.sessionDates}>
              {selected.session} · {selected.sessionDates}
            </small>
          </div>
          <p>{courseTitle(selected.key)}</p>
          <div>
            <Clock3 size={14} />
            <strong>
              {days[selected.day]} {timeLabel(selected.start)}–
              {timeLabel(selected.end)}
            </strong>
          </div>
          <div>
            {selected.delivery === "online" ? (
              <MonitorPlay size={14} />
            ) : (
              <MapPin size={14} />
            )}
            <span>{locationLabel(selected.delivery, selected.location)}</span>
          </div>
          {selected.from && selected.to && (
            <small>
              {selected.from} – {selected.to}
            </small>
          )}
        </section>
      )}
      {!!unscheduled.length && (
        <section
          className={styles.unscheduled}
          aria-label={t("Unscheduled meeting times", "时间待定课程")}
        >
          <h4>
            <CircleHelp size={14} />
            {t("Flexible study & unscheduled classes", "自主学习与待定时间")}
          </h4>
          <p>
            {t(
              "Self-paced distance learning has no fixed meeting time. Other unscheduled classes need a time check.",
              "自主学习的远程课程无需固定上课时间，其他时间未公布的课程仍需核对。",
            )}
          </p>
          {unscheduled.map((meeting) => {
            const Icon = deliveryIcons[meeting.delivery];
            return (
              <div key={meeting.id} className={styles.unscheduledRow}>
                <strong>
                  {meeting.key}
                  <small>
                    {t("Section", "班次")} {meeting.section} ·{" "}
                    <span title={meeting.sessionDates}>
                      {meeting.component} · {meeting.session}
                    </span>
                  </small>
                </strong>
                <span
                  className={styles.delivery}
                  data-delivery={meeting.delivery}
                >
                  <Icon size={12} />
                  {meeting.selfPaced
                    ? t("Self-paced online", "线上自主学习")
                    : t("Time TBA", "时间待公布")}
                </span>
                {meeting.delivery === "in-person" && (
                  <small>
                    {meeting.location || t("Location TBA", "地点待公布")}
                  </small>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

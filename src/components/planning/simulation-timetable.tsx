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
}: {
  choices: SimulationChoice[];
  courses: CatalogCourse[];
  conflicted: Set<string>;
  locale: Locale;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    meeting.slots.map((slot) => ({
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
            {t("Time to be confirmed", "时间待定")}
          </h4>
          <p>
            {t(
              "These meetings are excluded from time-conflict checks. Online delivery alone does not mean self-paced study.",
              "以下授课时段尚未公布，无法核对时间冲突。线上课程也可能需要定时上课。",
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
                    {meeting.component}
                  </small>
                </strong>
                <span
                  className={styles.delivery}
                  data-delivery={meeting.delivery}
                >
                  <Icon size={12} />
                  {deliveryLabel(meeting.delivery)}
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

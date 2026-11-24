"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Clock3,
  MapPin,
  MonitorPlay,
  CircleHelp,
  AlertTriangle,
  X,
} from "lucide-react";
import type { CatalogCourse } from "@/lib/catalog/types";
import type { SimulationChoice } from "@/lib/planning/simulation";
import {
  timetableMeetings,
  timetableFrame,
  timetableLanes,
  type MeetingDelivery,
} from "@/lib/planning/timetable";
import { text, type Locale } from "@/lib/i18n";
import styles from "./semester-simulation.module.css";
import { SessionTimeline } from "@/components/calendar/session-timeline";
import { sessionWeeks } from "@/lib/calendar/session-weeks";
import { isNoClassDate, type AcademicDay } from "@/lib/calendar/academic";
import { simulationCourseColors } from "@/lib/planning/simulation-colors";
import {
  simulationAvailability,
  simulationAvailabilityLabel,
  simulationAvailabilityName,
} from "@/lib/planning/simulation-availability";

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
  warnings = [],
}: {
  choices: SimulationChoice[];
  courses: CatalogCourse[];
  conflicted: Set<string>;
  locale: Locale;
  academic?: AcademicDay[];
  warnings?: string[];
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState("");
  const weeks = sessionWeeks(choices).weeks;
  const week = weeks.includes(selectedWeek) ? selectedWeek : "";
  const selectedButton = useRef<HTMLButtonElement | null>(null);
  const frame = useMemo(() => timetableFrame(courses), [courses]);
  const duration = frame.end - frame.start;
  const hours = Array.from(
    { length: Math.floor(duration / 60) + 1 },
    (_, i) => frame.start + i * 60,
  );
  const days =
    locale === "zh"
      ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const sections = new Map(
    choices.flatMap((choice) =>
      choice.sections.map(
        (section) => [`${choice.key}|${section.classNumber}`, section] as const,
      ),
    ),
  );
  const sectionFor = (meeting: { key: string; classNumber: string }) =>
    sections.get(`${meeting.key}|${meeting.classNumber}`)!;
  const meetings = timetableMeetings(choices);
  const events = timetableLanes(
    meetings.flatMap((meeting) =>
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
    ),
  );
  const unscheduled = meetings.filter((meeting) => !meeting.slots.length);
  const selected = events.find((event) => event.id === selectedId);
  const colors = simulationCourseColors(
    courses.map((course) => `${course.subject} ${course.catalogNumber}`),
  );
  const courseStyle = (key: string) =>
    ({ "--course-color": colors[key] }) as CSSProperties;
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
  const closeDetail = () => {
    setSelectedId(null);
    selectedButton.current?.focus({ preventScroll: true });
  };

  return (
    <div
      className={styles.timetable}
      data-simulation-timetable
      data-time-start={frame.start}
      data-time-end={frame.end}
    >
      <div className={styles.timetableMeta}>
        <span>
          {timeLabel(frame.start)}–{timeLabel(frame.end)} · {t("ET", "美东")}
        </span>
        <details className={styles.sessionDisclosure}>
          <summary>
            {week || t("All weeks", "全部教学周")} · {t("Details", "详情")}
            {unscheduled.length
              ? ` · ${unscheduled.length} ${t("flexible/TBA", "门自主/待定")}`
              : warnings.length
                ? ` · ${warnings.length}`
                : ""}
          </summary>
          <div className={styles.extraPanel}>
            {!!weeks.length && (
              <div className={styles.weekActions}>
                <button
                  type="button"
                  aria-pressed={!week}
                  onClick={() => setSelectedWeek("")}
                >
                  {t("All teaching weeks", "全部教学周")}
                </button>
                <button
                  type="button"
                  aria-pressed={!!week}
                  onClick={() => setSelectedWeek(week || weeks[0])}
                >
                  {t("Choose a week", "查看某一周")}
                </button>
              </div>
            )}
            {!week && (
              <p>
                {t(
                  "All sessions shown together. Choose a week to check its dates.",
                  "当前汇总各课程时段，可选择某一周核对日期。",
                )}
              </p>
            )}
            {week && (
              <SessionTimeline
                choices={choices}
                academic={academic}
                selected={week}
                onSelect={setSelectedWeek}
                locale={locale}
              />
            )}
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
            {!!warnings.length && (
              <ul className={styles.notes}>
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            )}
            {!!unscheduled.length && (
              <section
                aria-label={t("Unscheduled meeting times", "时间待定课程")}
              >
                <h4>
                  {t(
                    "Flexible study & unscheduled classes",
                    "自主学习与待定时间",
                  )}
                </h4>
                <p>
                  {t(
                    "Self-paced online classes have no fixed time. Check the published times for other TBA classes.",
                    "自主学习课程没有固定时间，其他待定班次仍需核对官方安排。",
                  )}
                </p>
                {unscheduled.map((meeting) => {
                  const Icon = deliveryIcons[meeting.delivery];
                  return (
                    <div
                      key={meeting.id}
                      className={styles.unscheduledRow}
                      data-availability={simulationAvailability(
                        sectionFor(meeting),
                      )}
                      style={courseStyle(meeting.key)}
                    >
                      <strong>
                        {meeting.key}
                        <small>
                          {t("Section", "班次")} {meeting.section} ·{" "}
                          {meeting.component} · {meeting.session}
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
                      <span
                        className={styles.enrollment}
                        data-availability={simulationAvailability(
                          sectionFor(meeting),
                        )}
                      >
                        {simulationAvailabilityLabel(
                          sectionFor(meeting),
                          locale,
                        )}
                      </span>
                    </div>
                  );
                })}
              </section>
            )}
          </div>
        </details>
      </div>
      <div
        className={styles.timeGrid}
        style={
          {
            "--day-count": frame.days,
            "--time-hours": duration / 60,
          } as CSSProperties
        }
        aria-label={t("Week at a glance", "一周课程概览")}
      >
        <div aria-hidden="true" />
        {days.slice(0, frame.days).map((day) => (
          <strong className={styles.dayHeading} key={day}>
            {day}
          </strong>
        ))}
        <div className={styles.timeAxis} aria-hidden="true">
          {hours.map((hour, i) => (
            <span
              key={hour}
              style={{ top: `${((hour - frame.start) / duration) * 100}%` }}
              data-edge={
                i === 0 ? "first" : i === hours.length - 1 ? "last" : undefined
              }
              data-minor={i % 2 === 1}
            >
              {timeLabel(hour)}
            </span>
          ))}
        </div>
        {days.slice(0, frame.days).map((day, index) => (
          <div className={styles.dayTrack} key={day} aria-label={day}>
            {events
              .filter((event) => event.day === index)
              .map((event) => {
                const split = event.key.lastIndexOf(" "),
                  Icon = deliveryIcons[event.delivery];
                const state = simulationAvailability(sectionFor(event));
                const enrollment = simulationAvailabilityLabel(
                  sectionFor(event),
                  locale,
                );
                const label = `${enrollment} · ${event.key} · ${day} ${timeLabel(event.start)}–${timeLabel(event.end)} · ${deliveryLabel(event.delivery)} · ${courseTitle(event.key) ?? ""} · ${event.location ?? ""} · ${event.section} ${event.session} ${event.sessionDates}`;
                return (
                  <button
                    type="button"
                    className={styles.timeBlock}
                    key={event.id}
                    style={{
                      ...courseStyle(event.key),
                      top: `${((event.start - frame.start) / duration) * 100}%`,
                      height: `${((event.end - event.start) / duration) * 100}%`,
                      left: `calc(${(event.lane / event.lanes) * 100}% + 2px)`,
                      width: `calc(${100 / event.lanes}% - 4px)`,
                    }}
                    data-delivery={event.delivery}
                    data-availability={state}
                    data-conflict={conflicted.has(event.key)}
                    data-short={event.end - event.start < 60}
                    data-narrow={event.lanes > 1}
                    aria-label={label}
                    title={label}
                    aria-pressed={event.id === selectedId}
                    onClick={(e) => {
                      selectedButton.current = e.currentTarget;
                      setSelectedId(event.id === selectedId ? null : event.id);
                    }}
                  >
                    <strong>
                      <span className={styles.blockSubject}>
                        {event.key.slice(0, split)}{" "}
                      </span>
                      {event.key.slice(split + 1)}
                    </strong>
                    {state !== "open" && (
                      <span className={styles.blockAvailability}>
                        {simulationAvailabilityName(sectionFor(event), locale)}
                      </span>
                    )}
                    <span className={styles.blockTime}>
                      {timeLabel(event.start)}–{timeLabel(event.end)}
                    </span>
                    <Icon
                      size={10}
                      className={styles.blockDelivery}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      <div
        className={styles.courseLegend}
        aria-label={t("Course colors", "课程颜色")}
      >
        {choices.map((choice) => {
          const states = [
            ...new Set(choice.sections.map(simulationAvailability)),
          ];
          const state =
            states.find((value) => value === "full" || value === "waitlist") ??
            states.find((value) => value === "unknown") ??
            "open";
          return (
            <span
              key={choice.key}
              style={courseStyle(choice.key)}
              data-availability={state}
              title={choice.sections
                .map(
                  (section) =>
                    `${section.section} · ${simulationAvailabilityLabel(section, locale)}`,
                )
                .join(" · ")}
            >
              <i />
              {choice.key} ·{" "}
              {[
                ...new Set(
                  choice.sections.map((section) =>
                    simulationAvailabilityName(section, locale),
                  ),
                ),
              ].join(" / ")}
            </span>
          );
        })}
      </div>
      {selected && (
        <section
          className={styles.selectedPanel}
          style={courseStyle(selected.key)}
          aria-label={t("Selected class details", "所选课程详情")}
          aria-live="polite"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeDetail();
            }
          }}
        >
          <button
            type="button"
            className={styles.detailClose}
            onClick={closeDetail}
            aria-label={t("Close class details", "关闭课程详情")}
          >
            <X size={14} />
          </button>
          <strong>
            {selected.key} · {t("Section", "班次")} {selected.section}
          </strong>
          <p>{courseTitle(selected.key)}</p>
          <span
            className={styles.enrollment}
            data-availability={simulationAvailability(sectionFor(selected))}
          >
            {simulationAvailabilityLabel(sectionFor(selected), locale)}
          </span>
          <span>
            <Clock3 size={13} />
            {days[selected.day]} {timeLabel(selected.start)}–
            {timeLabel(selected.end)}
          </span>
          <span>
            {selected.delivery === "online" ? (
              <MonitorPlay size={13} />
            ) : (
              <MapPin size={13} />
            )}
            {selected.delivery === "online"
              ? deliveryLabel(selected.delivery)
              : selected.location || t("Location TBA", "地点待公布")}
          </span>
          <small>
            {selected.component} · {selected.session} · {selected.sessionDates}
          </small>
          {conflicted.has(selected.key) && (
            <span className={styles.warning}>
              <AlertTriangle size={13} />
              {t("Conflict", "冲突")}
            </span>
          )}
        </section>
      )}
    </div>
  );
}

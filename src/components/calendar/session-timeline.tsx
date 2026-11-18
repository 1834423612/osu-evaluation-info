"use client";
import type { SimulationChoice } from "@/lib/planning/simulation";
import { sessionWeeks } from "@/lib/calendar/session-weeks";
import type { AcademicDay } from "@/lib/calendar/academic";
import type { Locale } from "@/lib/i18n";
import styles from "./session-timeline.module.css";
export function SessionTimeline({
  choices,
  academic,
  selected,
  onSelect,
  locale,
}: {
  choices: SimulationChoice[];
  academic: AcademicDay[];
  selected: string;
  onSelect: (date: string) => void;
  locale: Locale;
}) {
  const { weeks, rows } = sessionWeeks(choices);
  if (!weeks.length) return null;
  const duration = weeks.length * 7 * 86400000,
    start = Date.parse(weeks[0]);
  const current = selected || weeks[0];
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(new Date(date + "T12:00:00Z"));
  return (
    <section
      className={styles.root}
      aria-label={
        locale === "zh" ? "学期周次与课程安排" : "Academic weeks and sessions"
      }
    >
      <div className={styles.weeks}>
        {weeks.map((week, index) => (
          <button
            key={week}
            aria-pressed={current === week}
            onClick={() => onSelect(week)}
            title={`${week} · ${academic
              .filter(
                (day) =>
                  day.date <=
                    new Date(Date.parse(week) + 6 * 86400000)
                      .toISOString()
                      .slice(0, 10) && day.end >= week,
              )
              .map((day) => day.title)
              .join(" · ")}`}
          >
            <b>{index + 1}</b>
            <small>{dateLabel(week)}</small>
          </button>
        ))}
      </div>
      <div className={styles.rows}>
        {rows.map((row, index) => (
          <div key={index} className={styles.row}>
            <span title={`${row.session} · ${row.start} — ${row.end}`}>
              {row.key}
              <small>{row.session}</small>
            </span>
            <div>
              <i
                style={{
                  left:
                    Math.max(
                      0,
                      ((Date.parse(row.start) - start) / duration) * 100,
                    ) + "%",
                  width:
                    Math.max(
                      0.5,
                      ((Date.parse(row.end) -
                        Date.parse(row.start) +
                        86400000) /
                        duration) *
                        100,
                    ) + "%",
                }}
              />
              <b
                style={{
                  left: ((Date.parse(current) - start) / duration) * 100 + "%",
                  width: ((7 * 86400000) / duration) * 100 + "%",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p>
        {dateLabel(current)} —{" "}
        {dateLabel(
          new Date(Date.parse(current) + 6 * 86400000)
            .toISOString()
            .slice(0, 10),
        )}
      </p>
    </section>
  );
}

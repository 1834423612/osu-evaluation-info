"use client";

import { Check, Clock3, FileText, MonitorPlay } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { InstructorAvatar } from "@/components/people/instructor-avatar";
import type { CatalogSection } from "@/lib/catalog/types";
import type { SyllabusEntry } from "@/lib/syllabus/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./syllabus-section-picker.module.css";

export function SyllabusSectionPicker({
  items,
  value,
  onChange,
  locale,
}: {
  items: { entry: SyllabusEntry; section: CatalogSection }[];
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
}) {
  const days =
    locale === "zh"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className={styles.picker}>
      <div className={styles.eyebrow}>
        <FileText size={14} />
        <span>
          {text(
            locale,
            `${items.length} available ${items.length === 1 ? "syllabus" : "syllabi"}`,
            `${items.length} 份可用大纲`,
          )}
        </span>
      </div>
      <RadioGroup.Root
        className={styles.cards}
        value={value}
        onValueChange={onChange}
        aria-label={text(
          locale,
          "Choose an instructor and section syllabus",
          "选择教师与班次大纲",
        )}
      >
        {items.map(({ entry, section }) => {
          const people = section.instructors;
          const selected = value === entry.code;
          const meeting = section.meetings[0];
          const online = /online|distance/i.test(section.instructionMode);
          const schedule = meeting?.startTime
            ? `${meeting.days.length ? `${locale === "zh" ? "周" : ""}${meeting.days.map((day) => days[day]).join(locale === "zh" ? "、" : "/")} · ` : ""}${meeting.startTime}–${meeting.endTime ?? "?"}`
            : online
              ? text(locale, "Online · flexible schedule", "线上 · 弹性时间")
              : text(locale, "Time to be announced", "上课时间待定");
          return (
            <RadioGroup.Item
              key={entry.code}
              value={entry.code}
              className={styles.card}
              aria-label={`${people.map((person) => person.name).join(" / ") || text(locale, "Instructor TBA", "教师待定")} · #${section.classNumber}`}
            >
              <span className={styles.cardTop}>
                <span className={styles.avatars}>
                  {people.length ? (
                    people
                      .slice(0, 3)
                      .map((person) => (
                        <InstructorAvatar
                          key={person.email ?? person.name}
                          name={person.name}
                          email={person.email}
                          size={36}
                        />
                      ))
                  ) : (
                    <InstructorAvatar name="?" size={36} />
                  )}
                </span>
                <span className={styles.names}>
                  {people.length
                    ? people.map((person) => (
                        <span key={person.email ?? person.name}>
                          {person.name}
                        </span>
                      ))
                    : text(
                        locale,
                        "Instructor to be announced",
                        "授课教师待定",
                      )}
                </span>
                <span className={styles.choice} aria-hidden="true">
                  {selected ? <Check size={12} strokeWidth={3} /> : null}
                </span>
              </span>
              <span className={styles.meta}>
                <span className={styles.number}>#{section.classNumber}</span>
                <span>
                  {section.component} {section.section}
                </span>
                <span>{section.instructionMode}</span>
              </span>
              <span className={styles.schedule}>
                {online ? <MonitorPlay size={13} /> : <Clock3 size={13} />}
                <span>{schedule}</span>
              </span>
            </RadioGroup.Item>
          );
        })}
      </RadioGroup.Root>
    </div>
  );
}

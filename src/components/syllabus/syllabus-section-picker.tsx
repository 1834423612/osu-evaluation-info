"use client";
import { Bookmark, Check, Clock3, FileText } from "lucide-react";
import { RadioGroup } from "radix-ui";
import { useSavedSyllabi } from "@/hooks/use-saved-syllabi";
import { useSyllabusDocuments } from "@/hooks/use-syllabus-documents";
import { syllabusHasUpdate } from "@/lib/syllabus/saved";
import { formatSyllabusTime } from "@/lib/syllabus/time";
import type { CatalogCourse, CatalogSection } from "@/lib/catalog/types";
import type { SyllabusEntry } from "@/lib/syllabus/types";
import { text, type Locale } from "@/lib/i18n";
import { SyllabusTeachers } from "./syllabus-teachers";
import styles from "./syllabus-section-picker.module.css";

export function SyllabusSectionPicker({
  items,
  value,
  onChange,
  locale,
  course,
}: {
  items: { entry: SyllabusEntry; section: CatalogSection }[];
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
  course: CatalogCourse;
}) {
  const { savedSyllabi, toggle } = useSavedSyllabi();
  const documents = useSyllabusDocuments(items.map((item) => item.entry));
  const days =
    locale === "zh"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className={styles.picker}>
      <div className={styles.eyebrow}>
        <FileText size={13} />
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
        aria-label={text(locale, "Choose a section syllabus", "选择班次大纲")}
      >
        {items.map(({ entry, section }) => {
          const saved = savedSyllabi.find((item) => item.id === entry.code);
          const result = documents[entry.code];
          const updated = saved && syllabusHasUpdate(saved);
          const meeting = section.meetings[0];
          const schedule = meeting?.startTime
            ? `${meeting.days.length ? `${locale === "zh" ? "周" : ""}${meeting.days.map((day) => days[day]).join(locale === "zh" ? "、" : "/")} · ` : ""}${meeting.startTime}–${meeting.endTime ?? "?"}`
            : /online|distance/i.test(section.instructionMode)
              ? text(locale, "Online · flexible schedule", "线上 · 弹性时间")
              : text(locale, "Time TBA", "上课时间待定");
          return (
            <div
              key={entry.code}
              className={styles.card}
              data-selected={value === entry.code}
              data-syllabus-card={entry.code}
            >
              <div className={styles.cardTop}>
                <RadioGroup.Item
                  value={entry.code}
                  className={styles.selection}
                  aria-label={text(
                    locale,
                    `Read syllabus #${section.classNumber}`,
                    `阅读大纲 #${section.classNumber}`,
                  )}
                >
                  <span className={styles.choice} aria-hidden="true">
                    {value === entry.code ? <Check size={11} /> : null}
                  </span>
                  <span className={styles.number}>#{section.classNumber}</span>
                  <span>
                    {section.component} {section.section}
                  </span>
                  {updated ? (
                    <span className={styles.updated}>
                      {text(locale, "Updated", "有更新")}
                    </span>
                  ) : null}
                </RadioGroup.Item>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-pressed={Boolean(saved)}
                  aria-label={text(
                    locale,
                    `${saved ? "Unsave" : "Save"} syllabus #${section.classNumber}`,
                    `${saved ? "取消收藏" : "收藏"}大纲 #${section.classNumber}`,
                  )}
                  onClick={() =>
                    toggle(course, section, entry, result ?? undefined)
                  }
                >
                  <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
                </button>
              </div>
              <SyllabusTeachers
                people={section.instructors}
                course={course}
                locale={locale}
              />
              <div className={styles.schedule}>
                <Clock3 size={11} />
                <span>{schedule}</span>
                <span>{section.instructionMode}</span>
              </div>
              <div className={styles.timestamp}>
                {result ? (
                  <>
                    {result.source === "backup"
                      ? text(
                          locale,
                          "Archived · official update",
                          "历史备份 · 官方更新",
                        )
                      : text(locale, "Official update", "官方更新")}{" "}
                    {formatSyllabusTime(result.data.modifiedAt, locale) ? (
                      <time
                        dateTime={result.data.modifiedAt!}
                        title={result.data.modifiedAt!}
                      >
                        {formatSyllabusTime(result.data.modifiedAt, locale)}
                      </time>
                    ) : (
                      text(locale, "Not provided", "未提供")
                    )}
                  </>
                ) : result === null ? (
                  text(locale, "Update time unavailable", "更新时间暂不可用")
                ) : (
                  text(locale, "Checking update time…", "正在核验更新时间…")
                )}
              </div>
            </div>
          );
        })}
      </RadioGroup.Root>
    </div>
  );
}

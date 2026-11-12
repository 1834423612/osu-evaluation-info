"use client";
import { useId, useState } from "react";
import { EmptyResult } from "@/components/brand/empty-result";
import {
  Bookmark,
  Check,
  Clock3,
  FileText,
  SlidersHorizontal,
} from "lucide-react";
import { RadioGroup } from "radix-ui";
import { useSavedSyllabi } from "@/hooks/use-saved-syllabi";
import { useSyllabusDocuments } from "@/hooks/use-syllabus-documents";
import { useSyllabusTeachers } from "@/hooks/use-syllabus-teachers";
import {
  DEFAULT_SYLLABUS_FILTERS,
  syllabusChoices,
  type SyllabusChoiceFilters,
} from "@/lib/syllabus/choices";
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
  const { documents, missing } = useSyllabusDocuments(
    items.map((item) => item.entry),
  );
  const teachers = useSyllabusTeachers(
    course,
    course.sections.flatMap((section) => section.instructors),
  );
  const [filters, setFilters] = useState<SyllabusChoiceFilters>(
    DEFAULT_SYLLABUS_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const rows = syllabusChoices(
    items,
    course.sections,
    teachers,
    missing,
    filters,
  );
  const active =
    filters.role !== "all" || filters.minimum > 0 || filters.sort !== "default";
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
            `${rows.filter((row) => row.available).length} available syllabi · ${rows.length} sections`,
            `${rows.filter((row) => row.available).length} 份可用大纲 · ${rows.length} 个班次`,
          )}
        </span>
        <button
          type="button"
          className={styles.filterToggle}
          aria-expanded={filtersOpen}
          aria-controls={filtersId}
          data-active={active}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={12} />
          {text(locale, "Filter & sort", "筛选与排序")}
          {active ? " ·" : ""}
        </button>
      </div>
      {filtersOpen ? (
        <div id={filtersId} className={styles.filters}>
          <label>
            {text(locale, "Staff type", "员工类型")}
            <select
              aria-label={text(locale, "Filter staff type", "筛选员工类型")}
              value={filters.role}
              onChange={(event) =>
                setFilters({ ...filters, role: event.target.value })
              }
            >
              {[
                ["all", "All types", "全部类型"],
                ["faculty", "Faculty", "教授／讲师"],
                ["assistant", "Assistants", "助教／助理"],
                ["research", "Research", "科研人员"],
                ["emeritus", "Emeritus", "荣休教师"],
                ["staff", "Other staff", "其他员工"],
                ["unknown", "Unverified", "身份未确认"],
              ].map(([value, en, zh]) => (
                <option key={value} value={value}>
                  {text(locale, en, zh)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {text(locale, "Score source", "评分来源")}
            <select
              aria-label={text(locale, "Rating source", "评分来源")}
              value={filters.source}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  source: event.target.value as SyllabusChoiceFilters["source"],
                })
              }
            >
              {["RMP", "SEI", "SSLE"].map((source) => (
                <option key={source}>{source}</option>
              ))}
            </select>
          </label>
          <label>
            {text(locale, "Minimum score", "最低评分")}
            <select
              aria-label={text(locale, "Minimum score", "最低评分")}
              value={filters.minimum}
              onChange={(event) =>
                setFilters({ ...filters, minimum: Number(event.target.value) })
              }
            >
              <option value={0}>{text(locale, "Any score", "不限评分")}</option>
              {[3, 3.5, 4, 4.5].map((score) => (
                <option key={score} value={score}>
                  ≥ {score} / 5
                </option>
              ))}
            </select>
          </label>
          <label>
            {text(locale, "Order", "排序")}
            <select
              aria-label={text(locale, "Syllabus order", "大纲排序")}
              value={filters.sort}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  sort: event.target.value as SyllabusChoiceFilters["sort"],
                })
              }
            >
              <option value="default">
                {text(locale, "Default order", "默认顺序")}
              </option>
              <option value="desc">
                {text(locale, "Score: high to low", "评分从高到低")}
              </option>
              <option value="asc">
                {text(locale, "Score: low to high", "评分从低到高")}
              </option>
            </select>
          </label>
          {active ? (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_SYLLABUS_FILTERS)}
            >
              {text(locale, "Reset", "重置")}
            </button>
          ) : null}
          <p>
            {text(
              locale,
              "Team-taught sections use the mean of available teacher scores from the selected source. Missing scores stay unknown. Nonmatches stay below.",
              "合授班次按所选来源的有效教师评分取均值；缺失评分不补零，不符合条件的卡片保留在下方。",
            )}
          </p>
        </div>
      ) : null}
      {active && !rows.some((row) => row.available && row.matches) ? (
        <EmptyResult size={40}>
          {text(
            locale,
            "No matching published syllabi. All sections are still listed below.",
            "没有符合条件的已发布大纲，所有班次仍保留在下方。",
          )}
        </EmptyResult>
      ) : null}
      <RadioGroup.Root
        className={styles.cards}
        value={value}
        onValueChange={onChange}
        aria-label={text(locale, "Choose a section syllabus", "选择班次大纲")}
      >
        {rows.map(({ entry, section, available, matches }) => {
          const saved = entry
            ? savedSyllabi.find((item) => item.id === entry.code)
            : undefined;
          const result = entry ? documents[entry.code] : undefined;
          const updated = saved && syllabusHasUpdate(saved);
          const meeting = section.meetings[0];
          const schedule = meeting?.startTime
            ? `${meeting.days.length ? `${locale === "zh" ? "周" : ""}${meeting.days.map((day) => days[day]).join(locale === "zh" ? "、" : "/")} · ` : ""}${meeting.startTime}–${meeting.endTime ?? "?"}`
            : /online|distance/i.test(section.instructionMode)
              ? text(locale, "Online · flexible schedule", "线上 · 弹性时间")
              : text(locale, "Time TBA", "上课时间待定");
          return (
            <div
              key={entry?.code ?? `unpublished-${section.classNumber}`}
              className={styles.card}
              data-selected={Boolean(entry && value === entry.code)}
              data-syllabus-card={
                entry?.code ?? `unpublished-${section.classNumber}`
              }
              data-available={available}
              data-filter-match={matches}
            >
              <div className={styles.cardTop}>
                <RadioGroup.Item
                  value={entry?.code ?? `unpublished-${section.classNumber}`}
                  disabled={!available}
                  className={styles.selection}
                  aria-label={text(
                    locale,
                    `Read syllabus #${section.classNumber}`,
                    `阅读大纲 #${section.classNumber}`,
                  )}
                >
                  <span className={styles.choice} aria-hidden="true">
                    {entry && value === entry.code ? <Check size={11} /> : null}
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
                  {!available ? (
                    <span className={styles.unpublished}>
                      {text(
                        locale,
                        "No published syllabus found",
                        "未找到已发布大纲",
                      )}
                    </span>
                  ) : !matches ? (
                    <span className={styles.filtered}>
                      {text(locale, "Outside filters", "不符合筛选")}
                    </span>
                  ) : null}
                </RadioGroup.Item>
                <button
                  type="button"
                  className={styles.iconButton}
                  disabled={!available}
                  aria-pressed={Boolean(saved)}
                  aria-label={text(
                    locale,
                    `${saved ? "Unsave" : "Save"} syllabus #${section.classNumber}`,
                    `${saved ? "取消收藏" : "收藏"}大纲 #${section.classNumber}`,
                  )}
                  onClick={() =>
                    entry && toggle(course, section, entry, result ?? undefined)
                  }
                >
                  <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
                </button>
              </div>
              <SyllabusTeachers
                people={section.instructors}
                course={course}
                locale={locale}
                data={teachers}
              />
              <div className={styles.schedule}>
                <Clock3 size={11} />
                <span>{schedule}</span>
                <span>{section.instructionMode}</span>
              </div>
              <div className={styles.timestamp}>
                {!entry ? (
                  text(
                    locale,
                    "The official index has no matching published document for this section yet.",
                    "官方索引暂未收录此班次的已发布文档。",
                  )
                ) : result ? (
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

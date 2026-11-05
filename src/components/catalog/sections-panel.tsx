"use client";

import { useId, useMemo, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import type {
  CatalogCourse,
  CatalogInstructor,
  CatalogMeeting,
  CatalogSection,
} from "@/lib/catalog/types";
import {
  componentKind,
  getSectionFilterOptions,
  sectionMatchesFilters,
  type ComponentKind,
  type SectionFilterState,
} from "@/lib/catalog/section-filters";
import { usePreferences } from "@/hooks/use-preferences";
import { text, type Locale } from "@/lib/i18n";
import { InstructorAvatar } from "./instructor-avatar";
import styles from "./sections-panel.module.css";

const DAYS = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
};

function emptyFilters(): SectionFilterState {
  return {
    components: new Set(),
    instructionModes: new Set(),
    days: new Set(),
    excludeEarly: false,
    excludeLate: false,
    excludeWeekends: false,
  };
}

function toggleValue<T>(values: ReadonlySet<T>, value: T) {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function componentLabel(value: string, locale: Locale) {
  const kind = componentKind(value);
  if (kind === "Lecture") return text(locale, "Lecture", "讲授");
  if (kind === "Lab") return text(locale, "Lab", "实验");
  if (kind === "Recitation") return text(locale, "Recitation", "习题课");
  return value || text(locale, "Section", "班次");
}

function modeLabel(value: string, locale: Locale) {
  if (locale === "en") return value;
  const labels: Record<string, string> = {
    "In Person": "面授",
    "Distance Learning": "远程授课",
    "Distance Enhanced": "混合授课",
    "Hybrid Delivery": "混合授课",
  };
  return labels[value] ?? value;
}

function meetingLabel(meeting: CatalogMeeting, locale: Locale) {
  const days = meeting.days.flatMap((day) =>
    DAYS[locale][day] ? [DAYS[locale][day]] : [],
  );
  const time = meeting.startTime
    ? `${meeting.startTime}–${meeting.endTime ?? "?"}`
    : text(locale, "Time TBA", "时间待定");
  return `${days.join(locale === "zh" ? "、" : "/")} ${time}`.trim();
}

function instructorIdentity(instructor: CatalogInstructor) {
  return instructor.email?.toLowerCase() || instructor.name.toLowerCase();
}

function SectionRow({
  section,
  locale,
  matches,
  saved,
  savedInstructors,
  onSave,
  onSaveInstructor,
}: {
  section: CatalogSection;
  locale: Locale;
  matches: boolean;
  saved: boolean;
  savedInstructors: ReadonlySet<string>;
  onSave: () => void;
  onSaveInstructor: (instructor: CatalogInstructor) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  const isOpen = /open|^o$/i.test(section.enrollmentStatus);
  const isClosed = /closed|^c$/i.test(section.enrollmentStatus);
  const status = isOpen
    ? text(locale, "Open", "可选")
    : isClosed
      ? text(locale, "Full", "已满")
      : section.enrollmentStatus || text(locale, "Unpublished", "未公布");

  return (
    <li
      className={`${styles.row}${matches ? "" : ` ${styles.unmatched}`}`}
      data-matches={matches}
    >
      <div className={styles.rowMain}>
        <button
          className={styles.identity}
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={text(
            locale,
            `${expanded ? "Collapse" : "Expand"} ${section.component} ${section.section} details`,
            `${expanded ? "收起" : "展开"}${componentLabel(section.component, locale)} ${section.section}详情`,
          )}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <span>
            <strong>
              {componentLabel(section.component, locale)} {section.section}
            </strong>
            <span className={styles.muted}>
              #{section.classNumber} ·{" "}
              {modeLabel(section.instructionMode, locale)}
            </span>
          </span>
        </button>
        <div className={styles.instructors}>
          {section.instructors.length ? (
            section.instructors.map((instructor) => {
              const isSaved = savedInstructors.has(
                instructorIdentity(instructor),
              );
              return (
                <div
                  className={styles.instructor}
                  key={instructor.email ?? instructor.name}
                >
                  <InstructorAvatar
                    name={instructor.name}
                    email={instructor.email}
                    size={30}
                  />
                  <span className={styles.instructorName}>
                    {instructor.name}
                  </span>
                  <button
                    className={`${styles.iconButton}${isSaved ? ` ${styles.saved}` : ""}`}
                    type="button"
                    aria-pressed={isSaved}
                    aria-label={text(
                      locale,
                      `${isSaved ? "Unsave" : "Save"} instructor ${instructor.name}`,
                      `${isSaved ? "取消收藏" : "收藏"}教师 ${instructor.name}`,
                    )}
                    title={text(
                      locale,
                      isSaved ? "Unsave instructor" : "Save instructor",
                      isSaved ? "取消收藏教师" : "收藏教师",
                    )}
                    onClick={() => onSaveInstructor(instructor)}
                  >
                    <Star size={14} fill={isSaved ? "currentColor" : "none"} />
                  </button>
                </div>
              );
            })
          ) : (
            <span className={styles.muted}>
              {text(locale, "Instructor TBA", "教师待定")}
            </span>
          )}
        </div>
        <div className={styles.meetings}>
          {section.meetings.length ? (
            section.meetings.map((meeting, index) => (
              <span className={styles.meeting} key={index}>
                <span>{meetingLabel(meeting, locale)}</span>
                {meeting.location ? (
                  <span className={styles.location}>{meeting.location}</span>
                ) : null}
              </span>
            ))
          ) : (
            <span className={styles.muted}>
              {text(locale, "Time not posted", "时间未公布")}
            </span>
          )}
        </div>
        <div className={styles.availability}>
          <span
            className={`${styles.status}${isOpen ? ` ${styles.open}` : isClosed ? ` ${styles.closed}` : ""}`}
          >
            <i />
            {status}
          </span>
          <span className={styles.enrollment}>
            {text(locale, "Enrolled", "已选")}{" "}
            <strong>{section.enrollmentTotal ?? "—"}</strong>
            {section.waitlistTotal ? (
              <span>
                {" "}
                · {text(locale, "Waitlist", "候补")} {section.waitlistTotal}
              </span>
            ) : null}
          </span>
        </div>
        <button
          className={`${styles.iconButton} ${styles.sectionSave}${saved ? ` ${styles.saved}` : ""}`}
          type="button"
          aria-pressed={saved}
          aria-label={text(
            locale,
            `${saved ? "Unsave" : "Save"} section ${section.section}`,
            `${saved ? "取消收藏" : "收藏"}班次 ${section.section}`,
          )}
          title={text(
            locale,
            saved ? "Unsave section" : "Save section",
            saved ? "取消收藏班次" : "收藏班次",
          )}
          onClick={onSave}
        >
          <Bookmark size={16} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      {expanded ? (
        <div id={detailId} className={styles.rowDetails}>
          <dl className={styles.metadata}>
            <div>
              <dt>{text(locale, "Session", "学期时段")}</dt>
              <dd>
                {section.session ||
                  section.sessionCode ||
                  text(locale, "Not posted", "未公布")}
              </dd>
            </div>
            <div>
              <dt>{text(locale, "Class number", "班次编号")}</dt>
              <dd>{section.classNumber}</dd>
            </div>
            <div>
              <dt>{text(locale, "Instruction mode", "授课方式")}</dt>
              <dd>
                {modeLabel(section.instructionMode, locale) ||
                  text(locale, "Not posted", "未公布")}
              </dd>
            </div>
            <div>
              <dt>{text(locale, "Waitlist", "候补")}</dt>
              <dd>{section.waitlistTotal ?? "—"}</dd>
            </div>
          </dl>
          {section.meetings.length ? (
            <div className={styles.meetingDetails}>
              {section.meetings.map((meeting, index) => (
                <div key={index}>
                  <strong>{meetingLabel(meeting, locale)}</strong>
                  <span>
                    {meeting.location ||
                      text(locale, "Location not posted", "地点未公布")}
                  </span>
                  <span>
                    {meeting.startDate
                      ? `${meeting.startDate}${meeting.endDate ? ` – ${meeting.endDate}` : ""}`
                      : text(locale, "Dates not posted", "日期未公布")}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function SectionsPanel({
  course,
  locale,
}: {
  course: CatalogCourse;
  locale: Locale;
}) {
  const [filters, setFilters] = useState<SectionFilterState>(emptyFilters);
  const id = useId();
  const { savedSections, savedInstructors, toggleSection, toggleInstructor } =
    usePreferences();
  const options = useMemo(
    () => getSectionFilterOptions(course.sections),
    [course.sections],
  );
  const sectionMatches = useMemo(
    () =>
      course.sections.map((section) => sectionMatchesFilters(section, filters)),
    [course.sections, filters],
  );
  const matchCount = sectionMatches.filter(Boolean).length;
  const savedSectionIds = new Set(savedSections.map((section) => section.id));
  const savedInstructorIds = new Set(
    savedInstructors
      .filter((instructor) =>
        instructor.courses.some((related) => related.id === course.id),
      )
      .map((instructor) => instructor.id),
  );
  const activeCount =
    filters.components.size +
    filters.instructionModes.size +
    filters.days.size +
    Number(filters.excludeEarly) +
    Number(filters.excludeLate) +
    Number(filters.excludeWeekends);
  function toggleComponent(value: ComponentKind) {
    setFilters((current) => ({
      ...current,
      components: toggleValue(current.components, value),
    }));
  }
  function toggleMode(value: string) {
    setFilters((current) => ({
      ...current,
      instructionModes: toggleValue(current.instructionModes, value),
    }));
  }
  function toggleDay(value: number) {
    setFilters((current) => ({
      ...current,
      days: toggleValue(current.days, value),
    }));
  }

  return (
    <div className={styles.root}>
      <div className={styles.filters}>
        <div className={styles.filterHeading}>
          <span>
            <SlidersHorizontal size={14} />
            {text(locale, "Refine sections", "筛选班次")}
          </span>
          {activeCount ? (
            <button
              className={styles.clearButton}
              type="button"
              onClick={() => setFilters(emptyFilters())}
            >
              <X size={13} />
              {text(locale, "Clear filters", "清除筛选")} ({activeCount})
            </button>
          ) : null}
        </div>
        <div className={styles.filterGroups}>
          {options.components.length ? (
            <fieldset>
              <legend>{text(locale, "Component", "班次类型")}</legend>
              <div className={styles.chips}>
                {options.components.map((component) => (
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={filters.components.has(component)}
                    onClick={() => toggleComponent(component)}
                    key={component}
                  >
                    {componentLabel(component, locale)}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          {options.instructionModes.length ? (
            <fieldset>
              <legend>{text(locale, "Instruction mode", "授课方式")}</legend>
              <div className={styles.chips}>
                {options.instructionModes.map((mode) => (
                  <button
                    type="button"
                    className={styles.chip}
                    aria-pressed={filters.instructionModes.has(mode)}
                    onClick={() => toggleMode(mode)}
                    key={mode}
                  >
                    {modeLabel(mode, locale)}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
          {options.days.length ? (
            <fieldset>
              <legend>{text(locale, "Meeting days", "上课日期")}</legend>
              <div className={styles.chips}>
                {options.days.map((day) => (
                  <button
                    type="button"
                    className={`${styles.chip} ${styles.dayChip}`}
                    aria-pressed={filters.days.has(day)}
                    onClick={() => toggleDay(day)}
                    key={day}
                  >
                    {DAYS[locale][day]}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
        {options.hasEarlyMeetings ||
        options.hasLateMeetings ||
        options.hasWeekendMeetings ? (
          <fieldset className={styles.exclusions}>
            <legend>{text(locale, "Schedule preferences", "时间偏好")}</legend>
            {options.hasEarlyMeetings ? (
              <label htmlFor={`${id}-early`}>
                <input
                  id={`${id}-early`}
                  type="checkbox"
                  checked={filters.excludeEarly}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      excludeEarly: event.target.checked,
                    }))
                  }
                />
                {text(locale, "No classes before 9 AM", "排除上午 9 点前的课")}
              </label>
            ) : null}
            {options.hasLateMeetings ? (
              <label htmlFor={`${id}-late`}>
                <input
                  id={`${id}-late`}
                  type="checkbox"
                  checked={filters.excludeLate}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      excludeLate: event.target.checked,
                    }))
                  }
                />
                {text(locale, "No classes after 6 PM", "排除下午 6 点后的课")}
              </label>
            ) : null}
            {options.hasWeekendMeetings ? (
              <label htmlFor={`${id}-weekends`}>
                <input
                  id={`${id}-weekends`}
                  type="checkbox"
                  checked={filters.excludeWeekends}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      excludeWeekends: event.target.checked,
                    }))
                  }
                />
                {text(locale, "No weekends", "排除周末")}
              </label>
            ) : null}
          </fieldset>
        ) : null}
      </div>
      <div className={styles.listHeading}>
        <p role="status" aria-live="polite">
          {text(
            locale,
            `${matchCount} match · ${course.sections.length - matchCount} don't match`,
            `${matchCount} 个符合 · ${course.sections.length - matchCount} 个不符合`,
          )}
        </p>
        {course.sectionsPartial ? (
          <span>
            {text(locale, "Counts reflect loaded sections", "仅统计已加载班次")}
          </span>
        ) : activeCount ? (
          <span>
            {text(
              locale,
              "Non-matching sections are dimmed",
              "不符合的班次已褪色",
            )}
          </span>
        ) : null}
      </div>
      {course.sections.length ? (
        <ul className={styles.list}>
          {course.sections.map((section, index) => (
            <SectionRow
              key={section.id}
              section={section}
              locale={locale}
              matches={sectionMatches[index]}
              saved={savedSectionIds.has(`${course.id}:${section.classNumber}`)}
              savedInstructors={savedInstructorIds}
              onSave={() => {
                toggleSection(course, section);
              }}
              onSaveInstructor={(instructor) => {
                toggleInstructor(course, instructor);
              }}
            />
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <strong>
            {text(locale, "No sections have been posted", "暂无已公布班次")}
          </strong>
        </div>
      )}
    </div>
  );
}

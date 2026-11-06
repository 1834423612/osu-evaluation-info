"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  getSectionFilterOptions,
  rankSectionsForFilters,
  type ComponentKind,
  type SectionFilterState,
} from "@/lib/catalog/section-filters";
import { usePreferences } from "@/hooks/use-preferences";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import { text, type Locale } from "@/lib/i18n";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MeetingStrip } from "./meeting-strip";
import { InstructorDirectoryIdentity } from "@/components/people/people-directory-lookup";
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
    earlyCutoffMinute: 9 * 60,
    lateCutoffMinute: 18 * 60,
  };
}

function toggleValue<T>(values: ReadonlySet<T>, value: T) {
  const next = new Set(values);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function componentLabel(value: string, locale: Locale) {
  return value.trim() || text(locale, "Section", "班次");
}

function formatCutoff(minute: number, locale: Locale) {
  const hour = Math.floor(minute / 60);
  const mins = String(minute % 60).padStart(2, "0");
  if (locale === "zh") return `${String(hour).padStart(2, "0")}:${mins}`;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${mins} ${suffix}`;
}

const QUARTER_HOURS = Array.from({ length: 24 * 4 }, (_, index) => index * 15);

function TimeCutoffSelect({
  value,
  label,
  locale,
  onChange,
}: {
  value: number;
  label: string;
  locale: Locale;
  onChange: (minute: number) => void;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(value) => onChange(Number(value))}
    >
      <SelectTrigger size="sm" className={styles.timeSelect} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        <SelectGroup>
          {QUARTER_HOURS.map((minute) => (
            <SelectItem value={String(minute)} key={minute}>
              {formatCutoff(minute, locale)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
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
  return (
    nameDotNumberFromEmail(instructor.email) ?? instructor.name.toLowerCase()
  );
}

function SectionRow({
  section,
  locale,
  subject,
  matches,
  highlighted,
  savedFocus,
  saved,
  savedInstructors,
  onSave,
  onSaveInstructor,
}: {
  section: CatalogSection;
  locale: Locale;
  subject: string;
  matches: boolean;
  highlighted: boolean;
  savedFocus: boolean;
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
      className={`${styles.row}${matches ? (highlighted ? ` ${styles.highlighted}` : "") : ` ${styles.unmatched}`}`}
      data-matches={matches}
      data-class-number={section.classNumber}
      data-saved-focus={savedFocus ? "true" : undefined}
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
              #{section.classNumber} · {section.instructionMode}
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
                  <InstructorDirectoryIdentity
                    name={instructor.name}
                    email={instructor.email}
                    locale={locale}
                    size={30}
                    subject={subject}
                  />
                  <button
                    className={`${styles.iconButton}${isSaved ? ` ${styles.saved}` : ""}`}
                    type="button"
                    aria-pressed={isSaved}
                    aria-label={text(
                      locale,
                      isSaved
                        ? `Remove ${instructor.name}'s saved course link`
                        : `Save ${instructor.name} with this course`,
                      isSaved
                        ? `取消收藏教师与课程的关联：${instructor.name}`
                        : `收藏教师与课程的关联：${instructor.name}`,
                    )}
                    title={text(
                      locale,
                      isSaved
                        ? "Remove saved instructor-course link"
                        : "Save instructor with this course",
                      isSaved
                        ? "取消教师与课程的关联收藏"
                        : "收藏教师与课程关联",
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
              <div className={styles.meeting} key={index}>
                <MeetingStrip meeting={meeting} locale={locale} compact />
                {meeting.location ? (
                  <span className={styles.location} title={meeting.location}>
                    {meeting.location}
                  </span>
                ) : null}
              </div>
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
                {section.instructionMode ||
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
  focusClassNumber = null,
}: {
  course: CatalogCourse;
  locale: Locale;
  focusClassNumber?: string | null;
}) {
  const [filters, setFilters] = useState<SectionFilterState>(emptyFilters);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const { savedSections, savedInstructors, toggleSection, toggleInstructor } =
    usePreferences();
  const options = useMemo(
    () => getSectionFilterOptions(course.sections),
    [course.sections],
  );
  const rankedSections = useMemo(
    () => rankSectionsForFilters(course.sections, filters),
    [course.sections, filters],
  );
  const matchCount = rankedSections.filter(({ matches }) => matches).length;
  const savedSectionIds = new Set(savedSections.map((section) => section.id));
  const savedInstructorIds = new Set(
    savedInstructors
      .filter((instructor) =>
        instructor.courses.some((related) => related.id === course.id),
      )
      .map(
        (instructor) =>
          nameDotNumberFromEmail(instructor.id || instructor.email) ??
          instructor.id.toLowerCase(),
      ),
  );
  const activeCount =
    filters.components.size +
    filters.instructionModes.size +
    filters.days.size +
    Number(filters.excludeEarly) +
    Number(filters.excludeLate) +
    Number(filters.excludeWeekends);
  const savedFocusFound = course.sections.some(
    (section) => section.classNumber === focusClassNumber,
  );
  const focusAnnouncement = !focusClassNumber
    ? ""
    : savedFocusFound
      ? text(
          locale,
          `Saved class ${focusClassNumber} highlighted.`,
          `已定位并标亮收藏的班次 ${focusClassNumber}。`,
        )
      : course.sectionsPartial
        ? ""
        : text(
            locale,
            `Saved class ${focusClassNumber} is not in the current course listing.`,
            `当前课程列表中未找到收藏的班次 ${focusClassNumber}。`,
          );

  useEffect(() => {
    if (!focusClassNumber) return;
    const target = [
      ...(listRef.current?.querySelectorAll<HTMLElement>(
        "[data-class-number]",
      ) ?? []),
    ].find((row) => row.dataset.classNumber === focusClassNumber);
    if (!target) return;
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
    target
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });
  }, [course.id, course.sections, focusClassNumber]);
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
                    {mode}
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
        {options.hasTimedMeetings ||
        options.hasLateMeetings ||
        options.hasWeekendMeetings ? (
          <fieldset className={styles.exclusions}>
            <legend>{text(locale, "Schedule preferences", "时间偏好")}</legend>
            {options.hasTimedMeetings ? (
              <div className={styles.timePreference}>
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
                  {text(locale, "No classes before", "排除早于")}
                </label>
                <TimeCutoffSelect
                  value={filters.earlyCutoffMinute ?? 9 * 60}
                  label={text(locale, "Early class cutoff", "最早上课时间")}
                  locale={locale}
                  onChange={(minute) =>
                    setFilters((current) => ({
                      ...current,
                      earlyCutoffMinute: minute,
                      excludeEarly: true,
                    }))
                  }
                />
              </div>
            ) : null}
            {options.hasTimedMeetings ? (
              <div className={styles.timePreference}>
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
                  {text(locale, "No classes after", "排除晚于")}
                </label>
                <TimeCutoffSelect
                  value={filters.lateCutoffMinute ?? 18 * 60}
                  label={text(locale, "Late class cutoff", "最晚下课时间")}
                  locale={locale}
                  onChange={(minute) =>
                    setFilters((current) => ({
                      ...current,
                      lateCutoffMinute: minute,
                      excludeLate: true,
                    }))
                  }
                />
              </div>
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
              "Matches first · other sections dimmed below",
              "符合的班次优先 · 其余班次在下方褪色显示",
            )}
          </span>
        ) : null}
      </div>
      {course.sections.length ? (
        <ul className={styles.list} ref={listRef}>
          {rankedSections.map(({ section, matches }) => (
            <SectionRow
              key={section.id}
              section={section}
              locale={locale}
              subject={course.subject}
              matches={matches}
              highlighted={activeCount > 0}
              savedFocus={focusClassNumber === section.classNumber}
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
      {focusAnnouncement ? (
        <p
          className={styles.focusAnnouncement}
          role="status"
          aria-live="polite"
        >
          {focusAnnouncement}
        </p>
      ) : null}
    </div>
  );
}

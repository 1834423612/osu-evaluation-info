"use client";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bookmark,
  GraduationCap,
  MapPin,
  ArrowUpRight,
  LoaderCircle,
  X,
} from "lucide-react";
import { useCourseDetails } from "@/hooks/use-course-details";
import { useAvailabilityFresh } from "@/hooks/use-availability";
import { withoutCourseAvailability } from "@/lib/catalog/availability";
import type { CatalogCourse } from "@/lib/catalog/types";
import { localizedCampus, localizedTerm, text, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RatingSummary } from "@/components/evaluations/rating-summary";
import { InstructorAvatar } from "@/components/people/instructor-avatar";
import SectionsPanel from "./sections-panel";
import { TranslateText } from "@/components/translation/translate-text";
import { trackUmamiEvent } from "@/components/analytics/umami-analytics";
import { EnrollmentWatchControl } from "./enrollment-watch-control";
import type { EnrollmentWatchInterval } from "@/hooks/use-preferences";

const EvaluationPanel = dynamic(
  () => import("@/components/evaluations/evaluation-panel"),
  {
    loading: () => (
      <div className="inline-loading">
        <LoaderCircle size={16} className="spin" />
      </div>
    ),
  },
);

const RmpPanel = dynamic(() => import("@/components/rmp/rmp-panel"), {
  loading: () => (
    <div className="inline-loading">
      <LoaderCircle size={16} className="spin" />
    </div>
  ),
});

const MOBILE_VIEWPORT = "(max-width: 800px)";

function subscribeToViewport(onChange: () => void) {
  const media = window.matchMedia(MOBILE_VIEWPORT);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isMobileViewport() {
  return window.matchMedia(MOBILE_VIEWPORT).matches;
}

function useMobileViewport() {
  return useSyncExternalStore(
    subscribeToViewport,
    isMobileViewport,
    () => false,
  );
}

function localizedCareer(value: string, locale: Locale) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("undergraduate"))
    return text(locale, "Undergraduate", "本科生");
  if (normalized.includes("graduate"))
    return text(locale, "Graduate", "研究生");
  if (normalized.includes("professional"))
    return text(locale, "Professional", "专业课程");
  if (normalized.includes("non-degree") || normalized.includes("nondegree"))
    return text(locale, "Non-degree", "非学位课程");
  return value;
}

function courseDetailEyeline(course: CatalogCourse, locale: Locale) {
  const careers = (course.academicCareers ?? [course.academicCareer])
    .filter(Boolean)
    .map((career) => localizedCareer(career, locale));
  return [
    `${course.subject} ${course.catalogNumber}`,
    localizedCampus(course.campusCode, locale) || course.campus,
    ...careers,
    localizedTerm(course.term, locale),
  ].join(" · ");
}

function CoursePreview({
  course,
  locale,
}: {
  course: CatalogCourse;
  locale: Locale;
}) {
  const live = useAvailabilityFresh(course);
  const instructors = new Map<string, { name: string; email: string | null }>();
  const activeDays = new Set<number>();
  const meetingPatterns = new Set<string>();
  let hasUnscheduledMeeting = false;
  const dayLabels =
    locale === "zh"
      ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const scheduleDayLabels =
    locale === "zh"
      ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      : [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ];
  let open = 0;
  let closed = 0;
  for (const section of course.sections) {
    if (live && /open|^o$/i.test(section.enrollmentStatus)) open++;
    if (live && /closed|^c$/i.test(section.enrollmentStatus)) closed++;
    for (const instructor of section.instructors)
      instructors.set(
        instructor.email?.toLowerCase() ?? instructor.name.toLowerCase(),
        instructor,
      );
    for (const meeting of section.meetings) {
      if (!meeting.days.length) hasUnscheduledMeeting = true;
      const time = meeting.startTime
        ? `${meeting.startTime}–${meeting.endTime ?? "?"}`
        : text(locale, "Time TBA", "时间待定");
      meeting.days.forEach((day) => activeDays.add(day));
      if (meeting.days.length)
        meetingPatterns.add(
          `${meeting.days.map((day) => scheduleDayLabels[day]).join(locale === "zh" ? "、" : "/")} · ${time}`,
        );
    }
  }
  const people = [...instructors.values()];
  const visiblePeople = people.slice(0, 4);
  return (
    <div
      className="course-preview"
      aria-label={text(locale, "Course overview", "课程概览")}
    >
      <div className="preview-instructor-group">
        <div
          className="preview-avatars"
          aria-label={people.map((person) => person.name).join(", ")}
        >
          {visiblePeople.map((person, index) => (
            <span
              className="preview-avatar"
              style={{ zIndex: 5 - index }}
              key={person.email ?? person.name}
            >
              <InstructorAvatar
                name={person.name}
                email={person.email}
                size={30}
              />
            </span>
          ))}
          {people.length > visiblePeople.length ? (
            <span className="preview-more">
              +{people.length - visiblePeople.length}
            </span>
          ) : null}
          {!people.length ? (
            <span className="preview-tba">{text(locale, "TBA", "待定")}</span>
          ) : null}
        </div>
        <span className="preview-summary-label">
          {people.length}{" "}
          {text(
            locale,
            people.length === 1 ? "instructor" : "instructors",
            "位教师",
          )}
        </span>
      </div>
      <div className="preview-schedule">
        <div
          className="preview-week"
          aria-label={text(locale, "Weekly schedule by day", "每周上课日程")}
        >
          {dayLabels.map((day, index) => {
            return (
              <span
                className={
                  activeDays.has(index) ? "preview-day active" : "preview-day"
                }
                key={`${day}-${index}`}
              >
                <strong>{day}</strong>
              </span>
            );
          })}
        </div>
        <div className="preview-times">
          {[...meetingPatterns].slice(0, 3).map((pattern) => (
            <span key={pattern}>{pattern}</span>
          ))}
          {hasUnscheduledMeeting ? (
            <span>
              {text(
                locale,
                "Additional sections have no posted days",
                "另有班次尚未公布上课日期",
              )}
            </span>
          ) : null}
          {meetingPatterns.size > 3 ? (
            <span>
              +{meetingPatterns.size - 3}{" "}
              {text(locale, "more schedules", "种其他安排")}
            </span>
          ) : null}
          {!meetingPatterns.size ? (
            <span>{text(locale, "Time not posted", "时间未公布")}</span>
          ) : null}
        </div>
      </div>
      <div className="preview-sections">
        <strong>
          {course.sections.length}
          {course.sectionsPartial ? "+" : ""}
        </strong>
        <span>{text(locale, "class sections", "个班次")}</span>
      </div>
      <div
        className="preview-availability"
        aria-label={text(locale, "Enrollment availability", "选课情况")}
      >
        {!live ? (
          <span>
            {text(locale, "Availability unavailable", "选课状态暂不可用")}
          </span>
        ) : null}
        {open ? (
          <span className="preview-open">
            {open} {text(locale, "open", "可选")}
          </span>
        ) : null}
        {closed ? (
          <span className="preview-closed">
            {closed} {text(locale, "full", "已满")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function CourseCard({
  course,
  locale,
  saved,
  onSave,
  enrollmentWatch,
  enrollmentWatchInterval,
  onEnrollmentWatchChange,
  onEnrollmentWatchIntervalChange,
}: {
  course: CatalogCourse;
  locale: Locale;
  saved: boolean;
  onSave: (course: CatalogCourse) => void;
  enrollmentWatch: boolean;
  enrollmentWatchInterval: EnrollmentWatchInterval;
  onEnrollmentWatchChange: (enabled: boolean) => void;
  onEnrollmentWatchIntervalChange: (seconds: EnrollmentWatchInterval) => void;
}) {
  const searchParams = useSearchParams();
  const isMobile = useMobileViewport();
  const detailId = useId();
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const isSelected = searchParams.get("course") === course.id;
  const requestedTab =
    searchParams.get("detailTab") === "ratings" ? "ratings" : "sections";
  const focusSectionValue = searchParams.get("focusSection");
  const focusSection =
    isSelected &&
    focusSectionValue &&
    /^[A-Za-z0-9_-]{1,24}$/.test(focusSectionValue)
      ? focusSectionValue
      : null;
  const ratingSource =
    searchParams.get("ratingSource") === "rmp" ? "rmp" : "official";
  const tab = isSelected ? requestedTab : null;
  const {
    course: detail,
    source: detailSource,
    loading,
    error,
    refresh: loadDetail,
  } = useCourseDetails(
    course,
    isSelected,
    requestedTab === "sections" && enrollmentWatch,
    enrollmentWatchInterval,
  );
  const loaded = detail ?? course;
  const fresh = useAvailabilityFresh(loaded);
  const current = fresh ? loaded : withoutCourseAvailability(loaded);
  const credit =
    course.creditsMin === course.creditsMax
      ? String(course.creditsMin)
      : `${course.creditsMin}–${course.creditsMax}`;

  useEffect(() => {
    if (!isSelected) return;
    if (window.history.state?.courseDetail !== course.id) {
      window.history.replaceState(
        { courseDetail: course.id, courseDetailDepth: 0 },
        "",
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    }
  }, [course.id, isSelected]);

  function openTab(next: "sections" | "ratings", keepOpen = false) {
    const nextTab = keepOpen || tab !== next ? next : null;
    if (!nextTab) {
      closeDetails();
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const needsHistoryEntry =
      params.get("course") !== course.id || params.get("detailTab") !== nextTab;
    params.set("course", course.id);
    params.set("detailTab", nextTab);
    if (nextTab !== "ratings") params.delete("ratingSource");
    if (needsHistoryEntry) {
      const query = params.toString();
      const currentDepth =
        window.history.state?.courseDetail === course.id &&
        Number.isSafeInteger(window.history.state?.courseDetailDepth)
          ? window.history.state.courseDetailDepth
          : 0;
      const state = {
        courseDetail: course.id,
        courseDetailDepth:
          currentDepth + Number(!isSelected || currentDepth > 0),
      };
      const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      if (!isSelected || currentDepth > 0)
        window.history.pushState(state, "", url);
      else window.history.replaceState(state, "", url);
    }
    if (error) void loadDetail();
  }

  function closeDetails() {
    if (!isSelected) return;
    if (window.history.state?.courseDetail === course.id) {
      const depth = window.history.state.courseDetailDepth;
      if (Number.isSafeInteger(depth) && depth > 0) {
        window.history.go(-depth);
        return;
      }
    }
    const params = new URLSearchParams(window.location.search);
    params.delete("course");
    params.delete("detailTab");
    params.delete("ratingSource");
    params.delete("focusSection");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  }

  function setRatingSource(value: string) {
    if (value !== "official" && value !== "rmp") return;
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("course") === course.id &&
      params.get("detailTab") === "ratings" &&
      params.get("ratingSource") === value
    )
      return;
    params.set("course", course.id);
    params.set("detailTab", "ratings");
    params.set("ratingSource", value);
    const query = params.toString();
    const currentDepth =
      window.history.state?.courseDetail === course.id &&
      Number.isSafeInteger(window.history.state?.courseDetailDepth)
        ? window.history.state.courseDetailDepth
        : 0;
    const state = {
      courseDetail: course.id,
      courseDetailDepth: currentDepth + Number(currentDepth > 0),
    };
    const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    if (currentDepth > 0) window.history.pushState(state, "", url);
    else window.history.replaceState(state, "", url);
  }

  const detailContent = (
    <div
      id={detailId}
      className="course-details"
      onTouchStart={(event) => {
        if (
          (event.target as HTMLElement).closest(
            "button, input, select, a, [role='slider'], [data-chart]",
          )
        ) {
          touchStart.current = null;
          return;
        }
        const touch = event.touches[0];
        if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        const touch = event.changedTouches[0];
        touchStart.current = null;
        if (!start || !touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
        trackUmamiEvent("ui_interaction", {
          action: "course_detail_swipe",
          direction: dx < 0 ? "ratings" : "sections",
          area: "course_details",
          path: window.location.pathname,
        });
        openTab(dx < 0 ? "ratings" : "sections", true);
      }}
    >
      <Tabs
        value={tab ?? "sections"}
        className="course-detail-tabs"
        onValueChange={(value) => {
          if (value === "sections") void openTab("sections", true);
          if (value === "ratings") void openTab("ratings", true);
        }}
      >
        <div className="detail-tabs-row">
          <TabsList
            className="detail-tabs"
            variant="line"
            aria-label={text(locale, "Course details", "课程详情")}
          >
            <TabsTrigger value="sections">
              {text(locale, "Class sections", "开课班次")}
            </TabsTrigger>
            <TabsTrigger value="ratings">
              {text(locale, "Evaluations & trends", "教学评价与趋势")}
            </TabsTrigger>
          </TabsList>
          <span className="detail-term">
            {localizedTerm(course.term, locale)}
          </span>
        </div>
        <TabsContent value="sections">
          <div
            role="region"
            aria-label={text(locale, "Course detail", "课程详情")}
          >
            {detailSource?.mode === "mirror" ? (
              <p className="detail-note snapshot-note">
                {text(
                  locale,
                  `Backup snapshot from ${new Date(detailSource.snapshotAt ?? "").toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}; the official course service was unavailable.`,
                  `官方课程服务暂不可用，以下为数据库备份（同步于 ${new Date(detailSource.snapshotAt ?? "").toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}）。`,
                )}
              </p>
            ) : null}
            <TranslateText
              text={course.description}
              locale={locale}
              className="full-description"
            />
            {course.attributes.length ? (
              <div className="attribute-list">
                {course.attributes.map((attribute) => (
                  <Badge variant="outline" key={attribute}>
                    {attribute}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="availability-refresh" aria-live="polite">
              <span>
                {fresh
                  ? text(
                      locale,
                      `Availability checked at ${new Date(loaded.availability!.fetchedAt!).toLocaleTimeString("en-US")}`,
                      `选课状态获取于 ${new Date(loaded.availability!.fetchedAt!).toLocaleTimeString("zh-CN")}`,
                    )
                  : text(
                      locale,
                      "Live availability is currently unavailable. Check the official search before enrolling.",
                      "实时选课状态暂不可用，请以官方选课系统为准。",
                    )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-analytics-action="enrollment_refresh"
                disabled={loading}
                onClick={() => void loadDetail()}
              >
                {text(locale, "Refresh availability", "刷新选课状态")}
              </Button>
              <EnrollmentWatchControl
                enabled={enrollmentWatch}
                intervalSeconds={enrollmentWatchInterval}
                locale={locale}
                onEnabledChange={onEnrollmentWatchChange}
                onIntervalChange={onEnrollmentWatchIntervalChange}
              />
            </div>
            {loading ? (
              <div className="inline-loading">
                <LoaderCircle className="spin" size={17} />
                {text(locale, "Fetching all sections…", "正在获取完整班次…")}
              </div>
            ) : null}
            {error ? (
              <div className="inline-error">
                {text(
                  locale,
                  "Couldn't refresh official data. Enrollment availability is hidden.",
                  "暂无法刷新官方信息，选课状态和人数已隐藏。",
                )}{" "}
                <button
                  data-analytics-action="enrollment_retry"
                  onClick={() => void openTab("sections", true)}
                >
                  {text(locale, "Retry", "重试")}
                </button>
              </div>
            ) : null}
            <SectionsPanel
              course={current}
              locale={locale}
              focusClassNumber={focusSection}
            />
          </div>
        </TabsContent>
        <TabsContent value="ratings">
          <div
            role="region"
            aria-label={text(locale, "Course detail", "课程详情")}
          >
            <p className="detail-note">
              {text(
                locale,
                `Historical course averages from ${course.campus} campus. Instructor results are shown separately below.`,
                `以下为 ${course.campus} 校区的历届课程汇总；教师个人评价在下方分别展示。`,
              )}
            </p>
            {loading ? (
              <p className="inline-loading" role="status">
                <LoaderCircle size={16} className="spin" />
                {text(
                  locale,
                  "Loading current instructors…",
                  "正在获取当前授课教师…",
                )}
              </p>
            ) : error ? (
              <p className="inline-error" role="status">
                {text(
                  locale,
                  "Current instructors could not be loaded. RMP reviews are unavailable.",
                  "当前授课教师暂时无法获取，无法展示对应的 RMP 评论。",
                )}{" "}
                <button onClick={() => void openTab("ratings", true)}>
                  {text(locale, "Retry", "重试")}
                </button>
              </p>
            ) : (
              <Tabs
                value={ratingSource}
                onValueChange={setRatingSource}
                className="rating-source-tabs"
              >
                <TabsList
                  aria-label={text(locale, "Evaluation source", "评价来源")}
                >
                  <TabsTrigger value="official">
                    {text(locale, "OSU official", "OSU 官方评价")}
                  </TabsTrigger>
                  <TabsTrigger value="rmp">
                    <AlertTriangle size={13} aria-hidden="true" />
                    {text(locale, "RMP · student reviews", "RMP · 学生评论")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="official">
                  <EvaluationPanel
                    summary={current.evaluation}
                    locale={locale}
                    subject={current.subject}
                  />
                </TabsContent>
                <TabsContent value="rmp">
                  <RmpPanel course={current} locale={locale} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <article
      className="course-card"
      data-analytics-label="course_card"
      data-analytics-value={`${course.subject} ${course.catalogNumber}`}
      tabIndex={0}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest(
            "button, a, input, select, textarea, [role=tab], [data-slot=sheet-content], [data-slot=drawer-content]",
          )
        )
          return;
        void openTab("sections", true);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void openTab("sections", true);
        }
      }}
      aria-label={`${course.subject} ${course.catalogNumber}: ${course.title}`}
    >
      <div className="course-main">
        <div className="course-content">
          <div className="course-eyeline">
            <span className="course-code">
              {course.subject} {course.catalogNumber}
            </span>
            <span className="course-credits">
              {credit} {text(locale, "credits", "学分")}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onSave(current)}
              aria-label={`${saved ? text(locale, "Unsave", "取消收藏") : text(locale, "Save", "收藏")} ${course.subject} ${course.catalogNumber}`}
              aria-pressed={saved}
              data-analytics-action="course_favorite"
              data-analytics-label="course"
              data-analytics-value={`${course.subject} ${course.catalogNumber}`}
              className="save-course"
            >
              <Bookmark fill={saved ? "currentColor" : "none"} />
            </Button>
          </div>
          <h2>
            <button
              data-analytics-action="course_open"
              data-analytics-label="course"
              data-analytics-value={`${course.subject} ${course.catalogNumber}`}
              onClick={() => void openTab("sections")}
              aria-haspopup="dialog"
              aria-expanded={Boolean(tab)}
              aria-controls={tab ? detailId : undefined}
            >
              {course.title || `${course.subject} ${course.catalogNumber}`}
            </button>
          </h2>
          <TranslateText
            text={course.description}
            locale={locale}
            className="course-description"
            preview
          />
          <div className="course-meta">
            <span>
              <GraduationCap size={13} />
              {(current.academicCareers ?? [current.academicCareer]).join(
                " / ",
              )}
            </span>
            <span>
              <MapPin size={13} />
              {course.campus}
            </span>
            {course.attributes.slice(0, 1).map((attribute) => (
              <Badge variant="secondary" key={attribute}>
                {attribute}
              </Badge>
            ))}
          </div>
        </div>
        <button
          className="rating-trigger"
          onClick={() => void openTab("ratings")}
          aria-expanded={Boolean(tab)}
          aria-haspopup="dialog"
          aria-controls={tab ? detailId : undefined}
          aria-label={text(
            locale,
            "Show historical course evaluations",
            "查看课程历史评价",
          )}
        >
          <span className="rating-caption">
            {text(locale, "COURSE EVALUATIONS", "课程历史评价")}
          </span>
          <RatingSummary summary={current.evaluation} locale={locale} />
          <span className="rating-detail-link">
            {text(locale, "Ratings & trends", "评价与趋势")}
            <ArrowUpRight size={12} />
          </span>
        </button>
      </div>
      <CoursePreview course={current} locale={locale} />
      {isMobile ? (
        <Drawer
          open={Boolean(tab)}
          onOpenChange={(open) => !open && closeDetails()}
          shouldScaleBackground={false}
          handleOnly
        >
          <DrawerContent
            className="course-detail-drawer"
            onHandleDismiss={closeDetails}
            handleLabel={text(
              locale,
              "Drag down to close course details",
              "向下拖动关闭课程详情",
            )}
            onInteractOutside={(event) => {
              const target = event.detail.originalEvent.target;
              if (
                target instanceof Element &&
                target.closest(
                  ".action-toast, [data-language-notice], [data-translation-popover]",
                )
              )
                event.preventDefault();
            }}
            onEscapeKeyDown={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest("[data-trend-point]") &&
                event.target
                  .closest("[data-trend-chart]")
                  ?.querySelector("[data-trend-tooltip]")
              )
                event.preventDefault();
            }}
          >
            <DrawerHeader className="course-detail-header">
              <div>
                <span className="course-detail-eyeline">
                  {courseDetailEyeline(course, locale)}
                </span>
                <DrawerTitle>
                  {course.title || `${course.subject} ${course.catalogNumber}`}
                </DrawerTitle>
                <DrawerDescription>
                  {text(
                    locale,
                    "Section times, instructors, enrollment, and historical evaluations.",
                    "查看班次时间、教师、选课人数与历史评价。",
                  )}
                </DrawerDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={text(
                  locale,
                  "Close course details",
                  "关闭课程详情",
                )}
                onClick={closeDetails}
              >
                <X />
              </Button>
            </DrawerHeader>
            {tab ? detailContent : null}
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet
          open={Boolean(tab)}
          onOpenChange={(open) => !open && closeDetails()}
        >
          <SheetContent
            side="right"
            className="course-detail-panel"
            showCloseButton={false}
            aria-describedby={`${detailId}-description`}
            onInteractOutside={(event) => {
              const target = event.detail.originalEvent.target;
              if (
                target instanceof Element &&
                target.closest(
                  ".action-toast, [data-language-notice], [data-translation-popover]",
                )
              )
                event.preventDefault();
            }}
            onEscapeKeyDown={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest("[data-trend-point]") &&
                event.target
                  .closest("[data-trend-chart]")
                  ?.querySelector("[data-trend-tooltip]")
              )
                event.preventDefault();
            }}
          >
            <SheetHeader className="course-detail-header">
              <div>
                <span className="course-detail-eyeline">
                  {courseDetailEyeline(course, locale)}
                </span>
                <SheetTitle>
                  {course.title || `${course.subject} ${course.catalogNumber}`}
                </SheetTitle>
                <SheetDescription id={`${detailId}-description`}>
                  {text(
                    locale,
                    "Section times, instructors, enrollment, and historical evaluations.",
                    "查看班次时间、教师、选课人数与历史评价。",
                  )}
                </SheetDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={text(
                  locale,
                  "Close course details",
                  "关闭课程详情",
                )}
                onClick={closeDetails}
              >
                <X />
              </Button>
            </SheetHeader>
            {tab ? detailContent : null}
          </SheetContent>
        </Sheet>
      )}
    </article>
  );
}

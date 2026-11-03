"use client";
import { useId, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  Bookmark,
  ChevronRight,
  GraduationCap,
  MapPin,
  ArrowUpRight,
  History,
  UsersRound,
  LoaderCircle,
  ListChecks,
  X,
} from "lucide-react";
import type { CatalogCourse, CatalogSection } from "@/lib/catalog/types";
import { localizedTerm, text, type Locale } from "@/lib/i18n";
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
import { MeetingStrip } from "./meeting-strip";
import { RatingSummary } from "./rating-summary";

const EvaluationPanel = dynamic(() => import("./evaluation-panel"), {
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

function status(section: CatalogSection, locale: Locale) {
  const open = /open|^o$/i.test(section.enrollmentStatus);
  const closed = /closed|^c$/i.test(section.enrollmentStatus);
  return (
    <span className={open ? "section-status open" : "section-status"}>
      <span />
      {open
        ? text(locale, "Open", "可选")
        : closed
          ? text(locale, "Closed", "已满")
          : section.enrollmentStatus || text(locale, "Unpublished", "尚未公布")}
    </span>
  );
}

function isFutureTerm(term: string) {
  const english = term.match(/(spring|summer|autumn)\s*(\d{4})/i);
  const chinese = term.match(/(\d{4})\s*(春季|夏季|秋季)/);
  const match = english ?? chinese;
  if (!match) return false;
  const season = (english ? match[1] : match[2]).toLowerCase();
  const year = Number(english ? match[2] : match[1]);
  const rank = (value: string) =>
    /spring|春季/.test(value) ? 0 : /summer|夏季/.test(value) ? 1 : 2;
  const now = new Date();
  const month = now.getMonth();
  const currentSeason = month < 4 ? 0 : month < 7 ? 1 : 2;
  return year * 3 + rank(season) > now.getFullYear() * 3 + currentSeason;
}

function bestRatedInstructor(course: CatalogCourse) {
  const evaluation = course.evaluation;
  const comparisonInstrument = evaluation?.primary?.instrument;
  if (!evaluation || !comparisonInstrument) return null;
  const instructors = new Map<
    string,
    { name: string; section: CatalogSection }
  >();
  for (const section of course.sections) {
    for (const instructor of section.instructors) {
      if (instructor.email)
        instructors.set(instructor.email.toLowerCase(), {
          name: instructor.name,
          section,
        });
    }
  }
  if (instructors.size < 2) return null;
  const candidates = evaluation.instructors.flatMap((instructor) => {
    const email = instructor.email?.toLowerCase();
    const listed = email ? instructors.get(email) : undefined;
    const metric = instructor.primary;
    if (
      instructor.match !== "exact-email" ||
      !listed ||
      !metric ||
      metric.instrument !== comparisonInstrument ||
      metric.recommendation === "insufficient"
    )
      return [];
    return [{ ...listed, metric }];
  });
  return (
    candidates.toSorted((a, b) => b.metric.score - a.metric.score)[0] ?? null
  );
}

function sectionMeetingLabel(section: CatalogSection, locale: Locale) {
  const weekdays =
    locale === "zh"
      ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const meetings = section.meetings
    .map((meeting) => {
      const days = meeting.days.flatMap((day) =>
        weekdays[day] ? [weekdays[day]] : [],
      );
      const time = [meeting.startTime, meeting.endTime]
        .filter(Boolean)
        .join("–");
      return [days.join(locale === "zh" ? "、" : "/"), time]
        .filter(Boolean)
        .join(" ");
    })
    .filter(Boolean);
  return meetings.join(" · ") || text(locale, "Time not posted", "时间未公布");
}

function SectionRow({
  section,
  locale,
}: {
  section: CatalogSection;
  locale: Locale;
}) {
  return (
    <div className="section-row">
      <div className="section-identity">
        <span className="section-number">
          {section.component} {section.section}
        </span>
        <span className="secondary-text">
          #{section.classNumber} · {section.instructionMode}
        </span>
        {status(section, locale)}
      </div>
      <div className="section-instructors">
        {section.instructors.length ? (
          section.instructors.map((instructor) => (
            <span key={instructor.email ?? instructor.name}>
              {instructor.name}
            </span>
          ))
        ) : (
          <span className="secondary-text">
            {text(locale, "Instructor TBA", "教师尚未公布")}
          </span>
        )}
      </div>
      <div className="section-meetings">
        {section.meetings.length ? (
          section.meetings.map((meeting, i) => (
            <div key={i}>
              <MeetingStrip meeting={meeting} locale={locale} />
              {meeting.startDate ? (
                <span className="meeting-dates">
                  {meeting.startDate} – {meeting.endDate}
                </span>
              ) : null}
            </div>
          ))
        ) : (
          <MeetingStrip locale={locale} />
        )}
      </div>
      <div className="section-enrollment">
        <span>
          {text(locale, "Enrolled", "已选人数")}{" "}
          <strong>{section.enrollmentTotal ?? "—"}</strong>
        </span>
        {section.waitlistTotal ? (
          <span>
            {text(locale, "Waitlist", "候补")} {section.waitlistTotal}
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
}: {
  course: CatalogCourse;
  locale: Locale;
  saved: boolean;
  onSave: (course: CatalogCourse) => void;
}) {
  const [tab, setTab] = useState<"sections" | "ratings" | null>(null);
  const [detail, setDetail] = useState<CatalogCourse | null>(null);
  const [detailSource, setDetailSource] = useState<{
    mode: "official" | "mirror";
    snapshotAt?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const isMobile = useMobileViewport();
  const detailId = useId();
  const current = detail ?? course;
  const preview = course.sections[0];
  const futureTerm = isFutureTerm(course.term);
  const instructorHint = bestRatedInstructor(current);
  const credit =
    course.creditsMin === course.creditsMax
      ? String(course.creditsMin)
      : `${course.creditsMin}–${course.creditsMax}`;

  async function openTab(next: "sections" | "ratings", keepOpen = false) {
    setTab(keepOpen || tab !== next ? next : null);
    if (next !== "sections" || detail || loading) return;
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({
        subject: course.subject,
        catalog: course.catalogNumber,
        term: course.termCode,
        campus: course.campusCode.toLowerCase(),
      });
      const response = await fetch(`/api/catalog/course?${params}`, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("Course details unavailable");
      const payload = await response.json();
      if (payload.course) {
        setDetail(payload.course);
        setDetailSource({
          mode: payload.sourceMode === "mirror" ? "mirror" : "official",
          snapshotAt: payload.snapshotAt,
        });
      } else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  const detailContent = (
    <div id={detailId} className="course-details">
      <Tabs
        value={tab ?? "sections"}
        className="course-detail-tabs"
        onValueChange={(value) => {
          if (value === "sections") void openTab("sections", true);
          if (value === "ratings") setTab("ratings");
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
            <p className="full-description">{course.description}</p>
            {course.attributes.length ? (
              <div className="attribute-list">
                {course.attributes.map((attribute) => (
                  <Badge variant="outline" key={attribute}>
                    {attribute}
                  </Badge>
                ))}
              </div>
            ) : null}
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
                  "Couldn't fetch complete sections. Showing loaded results.",
                  "暂无法获取完整班次，当前显示已加载结果。",
                )}{" "}
                <button onClick={() => void openTab("sections", true)}>
                  {text(locale, "Retry", "重试")}
                </button>
              </div>
            ) : null}
            <div className="section-list">
              {current.sections.map((section) => (
                <SectionRow
                  key={section.id}
                  section={section}
                  locale={locale}
                />
              ))}
            </div>
            {current.sectionsPartial && !loading ? (
              <p className="detail-note">
                {text(
                  locale,
                  "Some sections may be outside this result window. Narrow your filters or check the official search.",
                  "部分班次可能不在当前结果中，可细化筛选或查看官方搜索。",
                )}
              </p>
            ) : null}
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
                `Historical evaluations · ${course.campus} campus · Separate from the currently listed instructor.`,
                `历史评价 · ${course.campus} 校区 · 不代表当前班次教师的评分。`,
              )}
            </p>
            <EvaluationPanel summary={current.evaluation} locale={locale} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <article
      className="course-card"
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
              className="save-course"
            >
              <Bookmark fill={saved ? "currentColor" : "none"} />
            </Button>
          </div>
          <h2>
            <button
              onClick={() => void openTab("sections")}
              aria-haspopup="dialog"
              aria-expanded={Boolean(tab)}
              aria-controls={tab ? detailId : undefined}
            >
              {course.title || `${course.subject} ${course.catalogNumber}`}
            </button>
          </h2>
          <p className="course-description">{course.description}</p>
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
          <Button
            className="course-detail-action"
            variant="outline"
            size="sm"
            onClick={() => void openTab("sections")}
            aria-haspopup="dialog"
            aria-expanded={Boolean(tab)}
          >
            <ListChecks data-icon="inline-start" />
            {text(locale, "View class details", "查看课程详情")}
            <ChevronRight data-icon="inline-end" />
          </Button>
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
      {preview ? (
        <div className="course-preview">
          <div className="preview-instructor">
            <span className="preview-component">{preview.component}</span>
            <span>
              {preview.instructors[0]?.name ??
                text(locale, "Instructor TBA", "教师尚未公布")}
            </span>
          </div>
          <MeetingStrip meeting={preview.meetings[0]} locale={locale} compact />
          {status(preview, locale)}
          <span className="preview-section-count">
            {text(locale, "Sections", "全部班次")}
            <strong>
              {current.sections.length}
              {current.sectionsPartial ? "+" : ""}
            </strong>
          </span>
        </div>
      ) : null}
      {futureTerm && current.evaluation?.status === "available" ? (
        <p className="course-reference-note">
          <History size={14} />
          {text(
            locale,
            "Past offerings shown as a reference; these ratings are not for the listed instructor.",
            "以下为往届同课评价参考，不代表当前列出的教师。",
          )}
        </p>
      ) : null}
      {futureTerm && current.evaluation?.status === "no-data" ? (
        <p className="course-reference-note course-reference-empty">
          <History size={14} />
          {text(
            locale,
            "No prior course evaluations were found. The instructor may be new to this course, or historical records may not match.",
            "未找到往届课程评价，教师可能首次开设此课，也可能是历史记录未匹配；这只是推测。",
          )}
        </p>
      ) : null}
      {instructorHint ? (
        <p className="faculty-insight">
          <UsersRound size={14} />
          <span>
            {text(
              locale,
              "Highest eligible past rating among listed instructors:",
              "当前授课教师中可比的往届评分较高者：",
            )}{" "}
            <strong>{instructorHint.name}</strong>
            {" · "}
            {instructorHint.metric.score.toFixed(2)}/5
            {" · "}
            {instructorHint.metric.instrument}
            {" · "}
            {text(locale, "eligible responses", "有效回答")}{" "}
            {instructorHint.metric.responseCount.toLocaleString()}
            {" · "}
            {text(locale, "Section", "班次")} {instructorHint.section.section}
            {" · "}
            {sectionMeetingLabel(instructorHint.section, locale)}
            <span className="faculty-insight-note">
              {text(
                locale,
                "Historical course-specific data; check this section’s meeting time against your schedule.",
                "仅使用本课程的往届教师数据；请自行核对该班次时间是否冲突。",
              )}
            </span>
          </span>
        </p>
      ) : null}
      {isMobile ? (
        <Drawer
          open={Boolean(tab)}
          onOpenChange={(open) => !open && setTab(null)}
          shouldScaleBackground={false}
        >
          <DrawerContent className="course-detail-drawer">
            <DrawerHeader className="course-detail-header">
              <div>
                <span className="course-detail-eyeline">
                  {course.subject} {course.catalogNumber} ·{" "}
                  {localizedTerm(course.term, locale)}
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
                onClick={() => setTab(null)}
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
          onOpenChange={(open) => !open && setTab(null)}
        >
          <SheetContent
            side="right"
            className="course-detail-panel"
            showCloseButton={false}
            aria-describedby={`${detailId}-description`}
          >
            <SheetHeader className="course-detail-header">
              <div>
                <span className="course-detail-eyeline">
                  {course.subject} {course.catalogNumber} ·{" "}
                  {localizedTerm(course.term, locale)}
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
                onClick={() => setTab(null)}
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

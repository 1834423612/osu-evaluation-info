"use client";
import Link from "next/link";

import { debugFetch } from "@/lib/debug/services";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Mail,
  RefreshCw,
  SearchX,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { CatalogCourse } from "@/lib/catalog/types";
import type { CourseRmpSummary } from "@/lib/rmp/types";
import { REVIEW_PAGE_SIZE, reviewPagination } from "@/lib/rmp/pagination";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import { text, type Locale } from "@/lib/i18n";
import { InstructorDirectoryIdentity } from "@/components/people/people-directory-lookup";
import { RmpReviewContent } from "./review-content";
import { SceneMascot } from "@/components/brand/scene-mascot";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { RmpIdentityBadge } from "./library-shared";
import styles from "./rmp-panel.module.css";

function score(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)} / 5`;
}

function tagTone(tag: string) {
  if (/homework|workload|assignment|attendance|reading/i.test(tag))
    return "work";
  if (/test|exam|quiz|grade|grader/i.test(tag)) return "assessment";
  if (/tough|difficult|hard|strict/i.test(tag)) return "challenge";
  if (/helpful|caring|clear|amazing|respected/i.test(tag)) return "positive";
  return "neutral";
}

export default function RmpPanel({
  course,
  locale,
}: {
  course: CatalogCourse;
  locale: Locale;
}) {
  const usernames = [
    ...new Set([
      ...course.sections.flatMap((section) =>
        section.instructors.flatMap((instructor) => {
          const identity = nameDotNumberFromEmail(instructor.email);
          return identity ? [identity] : [];
        }),
      ),
      ...(course.evaluation?.instructors.flatMap((instructor) =>
        instructor.nameDotNumber ? [instructor.nameDotNumber] : [],
      ) ?? []),
    ]),
  ]
    .toSorted((a, b) => a.localeCompare(b))
    .slice(0, 120);
  const params = new URLSearchParams({
    subject: course.subject,
    catalog: course.catalogNumber,
    campus: course.campusCode,
    scope: "course-history",
  });
  for (const identity of usernames) params.append("instructor", identity);
  const query = params.toString();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    query: string;
    summary: CourseRmpSummary | null;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await debugFetch("rmp", `/api/rmp/course?${query}`, {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15_000),
          ]),
        });
        if (!response.ok) throw new Error("RMP unavailable");
        const summary: CourseRmpSummary = await response.json();
        if (!controller.signal.aborted) setResult({ query, summary });
      } catch {
        if (!controller.signal.aborted) setResult({ query, summary: null });
      }
    })();
    return () => controller.abort();
  }, [query, attempt]);

  const loaded = result?.query === query;
  const summary = loaded ? result.summary : null;
  const unavailable = loaded && (!summary || summary.status === "unavailable");
  return (
    <section
      className={styles.panel}
      data-analytics-area="rmp_reviews"
      aria-label={text(locale, "Rate My Professors reviews", "RMP 学生评论")}
    >
      <div className={styles.heading}>
        <h3>Rate My Professors</h3>
        <span
          className={styles.syncNote}
          title={text(locale, "Synced", "定期同步")}
        >
          <RefreshCw size={11} aria-hidden="true" />
          {text(locale, "Synced", "定期同步")}
        </span>
        <div
          className={styles.headingMeta}
          title={text(locale, "Not official OSU data", "非 OSU 官方数据")}
        >
          <DataSourceBadge source="unofficial">
            <AlertTriangle size={14} aria-hidden="true" />
            <span className={styles.fullSource}>
              {text(locale, "Not official OSU data", "非 OSU 官方数据")}
            </span>
            <span className={styles.shortSource}>
              {text(locale, "Unofficial", "非官方")}
            </span>
          </DataSourceBadge>
        </div>
      </div>
      <p className={styles.note}>
        {text(
          locale,
          `${course.subject} ${course.catalogNumber} · Averages from the past two years.`,
          `${course.subject} ${course.catalogNumber} · 均分取近两年评价。`,
        )}
      </p>
      <p className={styles.caution}>
        <AlertTriangle size={15} aria-hidden="true" />
        {text(
          locale,
          "Unofficial student opinions from Rate My Professors.",
          "Rate My Professors 非官方学生主观评价。",
        )}
      </p>
      {course.sectionsPartial ? (
        <p className={styles.note}>
          {text(
            locale,
            "Instructor coverage follows the loaded sections; some sections are not available.",
            "教师范围基于已加载班次，部分班次可能尚未获取。",
          )}
        </p>
      ) : null}
      {!loaded ? (
        <p className={styles.loading} role="status">
          <LoaderCircle size={15} className="spin" />
          {text(locale, "Loading course reviews…", "正在读取课程评论…")}
        </p>
      ) : null}
      {unavailable ? (
        <p className={styles.empty} role="status">
          {text(
            locale,
            "RMP data is temporarily unavailable.",
            "RMP 数据暂时无法读取。",
          )}{" "}
          <button
            type="button"
            data-analytics-action="rmp_retry"
            onClick={() => {
              setResult(null);
              setAttempt((value) => value + 1);
            }}
          >
            {text(locale, "Retry", "重试")}
          </button>
        </p>
      ) : null}
      {summary && summary.status !== "unavailable" ? (
        <>
          {summary.status === "no-data" ? (
            <div className={styles.emptyCard} role="status">
              <SceneMascot scene="rmp-empty" size={88} />
              <div>
                <strong>
                  {text(locale, "No course reviews", "暂无本课程评价")}
                </strong>
                <p>
                  {text(
                    locale,
                    "Browse the RMP library for other courses.",
                    "可前往 RMP 教师库查看其他课程。",
                  )}
                </p>
              </div>
              <SearchX size={22} strokeWidth={1.5} aria-hidden="true" />
            </div>
          ) : null}
          {summary.instructors
            .filter((instructor) => instructor.reviewCount > 0)
            .map((instructor) => (
              <InstructorReviews
                key={`${instructor.professorId}:${query}`}
                instructor={instructor}
                summary={summary}
                locale={locale}
                courseQuery={query}
                subject={course.subject}
              />
            ))}
          <footer className={styles.footer}>
            {text(
              locale,
              "Comments are ordered newest first.",
              "评论按日期从新到旧排列。",
            )}
            {summary.refreshedAt ? (
              <time dateTime={summary.refreshedAt}>
                {text(locale, " Data refreshed ", " 数据更新于 ")}
                {new Date(summary.refreshedAt).toLocaleDateString(
                  locale === "zh" ? "zh-CN" : "en-US",
                )}
              </time>
            ) : null}
          </footer>
        </>
      ) : null}
    </section>
  );
}

function InstructorReviews({
  instructor,
  summary,
  locale,
  courseQuery,
  subject,
}: {
  instructor: CourseRmpSummary["instructors"][number];
  summary: CourseRmpSummary;
  locale: Locale;
  courseQuery: string;
  subject: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [pages, setPages] = useState<Record<number, typeof instructor.reviews>>(
    {},
  );
  const [loadedPages, setLoadedPages] = useState<number[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const reviews = showAllReviews
    ? (pages[pageIndex] ?? [])
    : instructor.reviews;
  const [loadingPage, setLoadingPage] = useState(false);
  const [pageError, setPageError] = useState(false);
  const reviewViewportRef = useRef<HTMLDivElement>(null);
  const pageRequest = useRef<AbortController | null>(null);
  useEffect(() => () => pageRequest.current?.abort(), []);
  const commonTags = instructor.topTags.slice(0, 5);
  const siblingProfiles = summary.instructors.filter(
    (item) =>
      !!instructor.nameDotNumber &&
      item.nameDotNumber === instructor.nameDotNumber,
  ).length;
  const { pageCount, reachableCount } = reviewPagination(
    instructor.reviewCount,
  );

  async function loadPage(targetPage: number) {
    if (loadingPage || targetPage < 0 || targetPage >= pageCount) return;
    setPageIndex(targetPage);
    reviewViewportRef.current?.scrollTo({ top: 0 });
    if (loadedPages.includes(targetPage)) return;
    const controller = new AbortController();
    pageRequest.current = controller;
    setLoadingPage(true);
    setPageError(false);
    try {
      const params = new URLSearchParams(courseQuery);
      params.set("professor", instructor.professorId);
      params.set("offset", String(targetPage * REVIEW_PAGE_SIZE));
      const response = await debugFetch(
        "rmp",
        `/api/rmp/course/reviews?${params}`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15_000),
          ]),
        },
      );
      if (!response.ok) throw new Error("RMP review page unavailable");
      const page: {
        reviews: typeof instructor.reviews;
        total: number;
        nextOffset: number | null;
      } = await response.json();
      if (controller.signal.aborted) return;
      setPages((current) => ({ ...current, [targetPage]: page.reviews }));
      setLoadedPages((current) => [...current, targetPage]);
    } catch {
      if (!controller.signal.aborted) setPageError(true);
    } finally {
      if (!controller.signal.aborted) setLoadingPage(false);
    }
  }
  const visiblePages = new Set(
    [0, pageCount - 1, pageIndex - 1, pageIndex, pageIndex + 1].filter(
      (page) => page >= 0 && page < pageCount,
    ),
  );
  const pageSlots = [...visiblePages]
    .toSorted((a, b) => a - b)
    .flatMap((page, index, ordered) => {
      const previous = ordered[index - 1];
      return [
        ...(previous !== undefined && page - previous > 1
          ? [{ type: "ellipsis" as const, key: `ellipsis-${page}` }]
          : []),
        { type: "page" as const, page, key: `page-${page}` },
      ];
    });
  return (
    <Collapsible
      className={styles.instructor}
      data-rmp-card
      data-professor-id={instructor.professorId}
      data-association={instructor.association}
      open={expanded}
      onOpenChange={setExpanded}
      onClick={(event) => {
        if (event.defaultPrevented || !(event.target instanceof Element))
          return;
        if (
          event.target.closest(
            "button, a, input, select, textarea, [role=button], [role=switch], [contenteditable=true], [data-directory-popover], [data-translation-popover], [data-rmp-review-content]",
          )
        )
          return;
        const selection = window.getSelection();
        if (
          selection &&
          !selection.isCollapsed &&
          selection.anchorNode &&
          event.currentTarget.contains(selection.anchorNode)
        )
          return;
        setExpanded((value) => !value);
      }}
      role="group"
      aria-label={text(
        locale,
        `${instructor.name}'s RMP reviews`,
        `${instructor.name} 的 RMP 评论`,
      )}
    >
      <div className={styles.instructorHeading}>
        <div className={styles.identity}>
          {instructor.nameDotNumber ? (
            <InstructorDirectoryIdentity
              name={instructor.name}
              email={`${instructor.nameDotNumber}@osu.edu`}
              locale={locale}
              size={36}
              subject={subject}
            />
          ) : (
            <strong className={styles.rawName}>{instructor.name}</strong>
          )}
          <div className={styles.identityStatus}>
            <RmpIdentityBadge
              profile={{ username: instructor.nameDotNumber }}
              locale={locale}
            />
            {instructor.association === "unconfirmed" &&
            instructor.nameDotNumber ? (
              <span>
                {text(locale, "Teaching link unconfirmed", "任课关联待确认")}
              </span>
            ) : null}
          </div>
        </div>
        <CollapsibleTrigger
          className={styles.instructorToggle}
          aria-label={text(
            locale,
            `${expanded ? "Hide" : "View"} ${instructor.name}'s reviews`,
            `${expanded ? "收起" : "查看"} ${instructor.name} 的评论`,
          )}
        >
          <span className={styles.summaryScore}>
            <strong
              data-tone={
                instructor.recentQuality === null
                  ? "none"
                  : instructor.recentQuality >= 4.2
                    ? "positive"
                    : instructor.recentQuality <= 3.3
                      ? "caution"
                      : "mixed"
              }
            >
              {score(instructor.recentQuality)}
            </strong>
            <small>
              {text(
                locale,
                `${instructor.recentReviewCount} recent · ${instructor.reviewCount} total`,
                `近两年 ${instructor.recentReviewCount} 条 · 总计 ${instructor.reviewCount} 条`,
              )}
            </small>
          </span>
          <span className={styles.disclosureCue}>
            <span className={styles.expandLabel}>
              {text(locale, "View reviews", "查看评论")}
            </span>
            <span className={styles.collapseLabel}>
              {text(locale, "Hide reviews", "收起评论")}
            </span>
            <ChevronDown
              className={styles.disclosureIcon}
              size={15}
              aria-hidden="true"
            />
          </span>
        </CollapsibleTrigger>
        <a href={instructor.profileUrl} target="_blank" rel="noreferrer">
          RMP <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      {instructor.nameDotNumber ? (
        <InstructorEmail locale={locale} username={instructor.nameDotNumber} />
      ) : null}
      {siblingProfiles > 1 ? (
        <p className={styles.note}>
          {text(
            locale,
            `RMP #${instructor.professorId} · ${siblingProfiles} separate profiles for this verified instructor`,
            `RMP #${instructor.professorId} · 本教师关联 ${siblingProfiles} 个独立档案`,
          )}
        </p>
      ) : null}
      {commonTags.length ? (
        <ul
          className={styles.tagCloud}
          aria-label={text(locale, "Common course topics", "常见课程关键词")}
        >
          {commonTags.map(({ tag, count }) => (
            <li key={tag} data-tone={tagTone(tag)}>
              <span>{tag}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      ) : null}
      <CollapsibleContent data-rmp-review-content>
        <dl className={styles.stats}>
          <div>
            <dt>{text(locale, "Recent quality", "近期教学评价")}</dt>
            <dd>{score(instructor.recentQuality)}</dd>
            <small>n = {instructor.recentQualityCount}</small>
          </div>
          <div>
            <dt>{text(locale, "Recent difficulty", "近期难度")}</dt>
            <dd>{score(instructor.recentDifficulty)}</dd>
            <small>n = {instructor.recentDifficultyCount}</small>
          </div>
          <div>
            <dt>
              {text(
                locale,
                "This instructor's course reviews",
                "该教师针对本课程的评论",
              )}
            </dt>
            <dd>{instructor.reviewCount}</dd>
            <small>
              {text(
                locale,
                `${instructor.recentReviewCount} in past 2 years`,
                `近两年 ${instructor.recentReviewCount} 条`,
              )}
            </small>
          </div>
        </dl>
        {instructor.recentReviewCount > 0 &&
        instructor.recentReviewCount < 5 ? (
          <p className={styles.note}>
            {text(
              locale,
              "Small recent sample; individual experiences may differ.",
              "近期样本较少，个人体验可能不同。",
            )}
          </p>
        ) : null}
        {instructor.reviewCount > 0 ? (
          <div className={styles.reviews}>
            <h5>
              {text(
                locale,
                `${instructor.name}'s course reviews`,
                `${instructor.name} 的课程评论`,
              )}
            </h5>
            <Link
              className={styles.fullHistory}
              href={`/rmp/${instructor.professorId}`}
              target="_blank"
              rel="noopener"
            >
              {text(
                locale,
                "This teacher’s reviews across all courses",
                "查看该教师全部课程评价",
              )}{" "}
              <ArrowUpRight size={12} />
            </Link>
            <div
              className={
                showAllReviews ? styles.reviewViewport : styles.reviewPreview
              }
              ref={reviewViewportRef}
              tabIndex={showAllReviews ? 0 : undefined}
              aria-label={text(
                locale,
                "Scrollable instructor reviews",
                "可滚动的教师评论",
              )}
            >
              {reviews.map((review) => (
                <div className={styles.review} key={review.id}>
                  <div className={styles.reviewMeta}>
                    {review.date ? (
                      <time
                        className={styles.reviewDate}
                        dateTime={review.date}
                      >
                        {review.date}
                      </time>
                    ) : (
                      <span>
                        {text(locale, "Date unavailable", "日期未知")}
                      </span>
                    )}
                    {review.date && review.date < summary.recentSince ? (
                      <span className={styles.olderReview}>
                        {text(
                          locale,
                          "Older review · may be outdated",
                          "较早评论，可能已过时",
                        )}
                      </span>
                    ) : null}
                  </div>
                  <RmpReviewContent review={review} locale={locale} />
                </div>
              ))}
              {showAllReviews && loadingPage && !reviews.length ? (
                <p className={styles.loading} role="status">
                  <LoaderCircle size={15} className="spin" />
                  {text(locale, "Loading reviews…", "正在加载评论…")}
                </p>
              ) : null}
              {showAllReviews && pageError && !reviews.length ? (
                <p className={styles.pageError} role="alert">
                  {text(
                    locale,
                    "Couldn't load this page.",
                    "暂时无法加载这一页评论。",
                  )}
                  <button
                    type="button"
                    data-analytics-action="rmp_review_retry"
                    onClick={() => void loadPage(pageIndex)}
                  >
                    {text(locale, "Retry", "重试")}
                  </button>
                </p>
              ) : null}
            </div>
            {!showAllReviews && instructor.reviewCount > reviews.length ? (
              <button
                className={styles.viewAll}
                type="button"
                data-analytics-action="rmp_reviews_expand"
                onClick={() => {
                  setShowAllReviews(true);
                  void loadPage(0);
                }}
              >
                {text(
                  locale,
                  reachableCount < instructor.reviewCount
                    ? `Browse ${reachableCount} reviews`
                    : `View all ${instructor.reviewCount} reviews`,
                  reachableCount < instructor.reviewCount
                    ? `浏览 ${reachableCount} 条评论`
                    : `查看全部 ${instructor.reviewCount} 条评论`,
                )}
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            ) : null}
            {showAllReviews ? (
              <button
                className={styles.viewAll}
                type="button"
                data-analytics-action="rmp_reviews_collapse"
                onClick={() => {
                  setShowAllReviews(false);
                  setPageIndex(0);
                }}
              >
                {text(locale, "Show latest 3", "收起至最新 3 条")}
                <ChevronDown size={15} aria-hidden="true" />
              </button>
            ) : null}
            {showAllReviews && pageCount > 1 ? (
              <div className={styles.moreReviews}>
                <button
                  type="button"
                  data-analytics-action="rmp_review_page_previous"
                  onClick={() => void loadPage(pageIndex - 1)}
                  disabled={loadingPage || pageIndex === 0}
                  title={text(locale, "Previous page", "上一页评论")}
                  aria-label={text(locale, "Previous page", "上一页评论")}
                >
                  <ChevronLeft size={14} />
                  <span>{text(locale, "Previous", "上一页")}</span>
                </button>
                <nav
                  className={styles.pageNumbers}
                  aria-label={text(locale, "Review pages", "评论页码")}
                >
                  {pageSlots.map((slot) =>
                    slot.type === "ellipsis" ? (
                      <span key={slot.key} aria-hidden="true">
                        …
                      </span>
                    ) : (
                      <button
                        key={slot.key}
                        type="button"
                        data-analytics-action="rmp_review_page_select"
                        aria-current={
                          slot.page === pageIndex ? "page" : undefined
                        }
                        aria-label={text(
                          locale,
                          `Page ${slot.page + 1}`,
                          `第 ${slot.page + 1} 页`,
                        )}
                        onClick={() => void loadPage(slot.page)}
                        disabled={loadingPage || slot.page === pageIndex}
                      >
                        {slot.page + 1}
                      </button>
                    ),
                  )}
                </nav>
                <span className={styles.pageStatus}>
                  {pageIndex + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  data-analytics-action="rmp_review_page_next"
                  onClick={() => void loadPage(pageIndex + 1)}
                  disabled={loadingPage || pageIndex >= pageCount - 1}
                  title={text(locale, "Next page", "下一页评论")}
                  aria-label={text(locale, "Next page", "下一页评论")}
                >
                  {loadingPage ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  <span>{text(locale, "Next", "下一页")}</span>
                </button>
              </div>
            ) : null}
            {showAllReviews && !loadingPage && reviews.length ? (
              <p className={styles.pageSummary} aria-live="polite">
                {text(
                  locale,
                  `Showing ${pageIndex * REVIEW_PAGE_SIZE + 1}–${pageIndex * REVIEW_PAGE_SIZE + reviews.length} of ${instructor.reviewCount} reviews`,
                  `显示第 ${pageIndex * REVIEW_PAGE_SIZE + 1}–${pageIndex * REVIEW_PAGE_SIZE + reviews.length} 条，共 ${instructor.reviewCount} 条评论`,
                )}
              </p>
            ) : null}
            {showAllReviews && reachableCount < instructor.reviewCount ? (
              <p className={styles.note}>
                {text(
                  locale,
                  `The first ${reachableCount} reviews are available here. Open the RMP profile for older reviews.`,
                  `这里可浏览前 ${reachableCount} 条评论，更早的评论可打开 RMP 教师页面查看。`,
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function InstructorEmail({
  locale,
  username,
}: {
  locale: Locale;
  username: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <button
      className={styles.emailReveal}
      type="button"
      data-analytics-action="instructor_email_reveal"
      onClick={() => setVisible((value) => !value)}
    >
      <Mail size={13} aria-hidden="true" />
      {visible
        ? `${username}@osu.edu`
        : text(locale, "Show OSU email", "显示 OSU 邮箱")}
    </button>
  );
}

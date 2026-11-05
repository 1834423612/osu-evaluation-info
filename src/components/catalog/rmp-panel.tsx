"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Mail,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { CatalogCourse } from "@/lib/catalog/types";
import type { CourseRmpSummary } from "@/lib/rmp/types";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import { text, type Locale } from "@/lib/i18n";
import { InstructorAvatar } from "./instructor-avatar";
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
        const response = await fetch(`/api/rmp/course?${query}`, {
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
      aria-label={text(locale, "Rate My Professors reviews", "RMP 学生评论")}
    >
      <div className={styles.heading}>
        <h3>Rate My Professors</h3>
        <span>
          {text(
            locale,
            "Student reviews · separate source",
            "学生自主评论 · 独立来源",
          )}
        </span>
      </div>
      <p className={styles.note}>
        {text(
          locale,
          `Reviews for ${course.subject} ${course.catalogNumber} from teachers identified in current classes or official course history. Recent averages use the past two years; older comments keep their dates. These samples are separate from OSU SEI/SSLE responses.`,
          `展示当前班次或 OSU 官方课程历史记录中教师的 ${course.subject} ${course.catalogNumber} 评论。近期均分采用近两年样本，较早评论保留原日期；RMP 样本与官方 SEI/SSLE 回答数量分别统计。`,
        )}
      </p>
      <p className={styles.caution}>
        <AlertTriangle size={15} aria-hidden="true" />
        {text(
          locale,
          "Unofficial Rate My Professors reviews. Profiles may include self-ratings, and student opinions can be strongly subjective or unrepresentative.",
          "以下为 Rate My Professors 非官方评论；资料可能包含教师自评，学生观点也可能较主观或无法代表多数体验。",
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
            <p className={styles.empty}>
              {text(
                locale,
                "No RMP reviews are available for this course.",
                "这门课程目前没有可显示的 RMP 评论。",
              )}
            </p>
          ) : null}
          {summary.instructors
            .filter((instructor) => instructor.reviewCount > 0)
            .map((instructor) => (
              <InstructorReviews
                key={instructor.professorId}
                instructor={instructor}
                summary={summary}
                locale={locale}
                courseQuery={query}
              />
            ))}
          <footer className={styles.footer}>
            {text(
              locale,
              "Scores summarize Rate My Professors reviews for this course. Recent averages use up to the last two years; comments are ordered newest first.",
              "评分汇总了 Rate My Professors 上与本课程相关的评论。近期均分使用近两年样本，评论按日期从新到旧排列。",
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
}: {
  instructor: CourseRmpSummary["instructors"][number];
  summary: CourseRmpSummary;
  locale: Locale;
  courseQuery: string;
}) {
  const [pages, setPages] = useState([
    {
      reviews: instructor.reviews,
      offset: 0,
      nextOffset:
        instructor.reviews.length < instructor.reviewCount
          ? instructor.reviews.length
          : null,
    },
  ]);
  const [pageIndex, setPageIndex] = useState(0);
  const { reviews, offset, nextOffset } = pages[pageIndex];
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const commonTags = instructor.topTags.slice(0, 5);

  async function loadMore() {
    if (loadingMore || nextOffset === null) return;
    if (pages[pageIndex + 1]) {
      setPageIndex((current) => current + 1);
      return;
    }
    setLoadingMore(true);
    setPageError(false);
    try {
      const params = new URLSearchParams(courseQuery);
      params.set("professor", instructor.professorId);
      params.set("offset", String(nextOffset));
      const response = await fetch(`/api/rmp/course/reviews?${params}`, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("RMP review page unavailable");
      const page: {
        reviews: typeof instructor.reviews;
        total: number;
        nextOffset: number | null;
      } = await response.json();
      setPages((current) => [
        ...current,
        {
          reviews: page.reviews,
          offset: nextOffset,
          nextOffset:
            page.nextOffset !== null && page.nextOffset <= 5_000
              ? page.nextOffset
              : null,
        },
      ]);
      setPageIndex((current) => current + 1);
    } catch {
      setPageError(true);
    } finally {
      setLoadingMore(false);
    }
  }
  return (
    <Collapsible className={styles.instructor}>
      <div className={styles.instructorHeading}>
        <CollapsibleTrigger className={styles.instructorToggle}>
          <div className={styles.identity}>
            <InstructorAvatar
              name={instructor.name}
              email={`${instructor.nameDotNumber}@osu.edu`}
            />
            <div>
              <h4>{instructor.name}</h4>
              <span>{text(locale, "Instructor reviews", "教师评价")}</span>
            </div>
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
            <ChevronDown
              className={styles.disclosureIcon}
              size={15}
              aria-hidden="true"
            />
          </div>
        </CollapsibleTrigger>
        <a href={instructor.profileUrl} target="_blank" rel="noreferrer">
          RMP <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      <InstructorEmail locale={locale} username={instructor.nameDotNumber} />
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
      <CollapsibleContent>
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
            <dt>{text(locale, "This course", "本课程评论")}</dt>
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
        {reviews.length ? (
          <div className={styles.reviews}>
            <h5>
              {text(
                locale,
                `${instructor.name}'s course reviews`,
                `${instructor.name} 的课程评论`,
              )}
            </h5>
            {reviews.map((review) => (
              <div className={styles.review} key={review.id}>
                <div className={styles.reviewMeta}>
                  {review.date ? (
                    <time className={styles.reviewDate} dateTime={review.date}>
                      {review.date}
                    </time>
                  ) : (
                    <span>{text(locale, "Date unavailable", "日期未知")}</span>
                  )}
                  {review.date && review.date < summary.recentSince ? (
                    <span>
                      {text(locale, "Older than two years", "两年前的评论")}
                    </span>
                  ) : null}
                  <span
                    className={styles.reviewQuality}
                    data-tone={
                      review.quality === null
                        ? "none"
                        : review.quality >= 4
                          ? "positive"
                          : review.quality < 3
                            ? "caution"
                            : "mixed"
                    }
                  >
                    {text(locale, "Quality", "评价")} {score(review.quality)}
                  </span>
                  <span
                    className={styles.reviewDifficulty}
                    data-tone={
                      review.difficulty === null
                        ? "none"
                        : review.difficulty >= 4
                          ? "caution"
                          : review.difficulty < 2.5
                            ? "positive"
                            : "mixed"
                    }
                  >
                    {text(locale, "Difficulty", "难度")}{" "}
                    {score(review.difficulty)}
                  </span>
                </div>
                <p>
                  {review.comment ||
                    text(locale, "No written comment.", "未填写文字评论。")}
                </p>
                {review.tags.length ? (
                  <ul
                    className={styles.tags}
                    aria-label={text(locale, "Review tags", "评论标签")}
                  >
                    {review.tags.map((tag) => (
                      <li key={tag} data-tone={tagTone(tag)}>
                        {tag}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            {instructor.reviewCount > instructor.reviews.length ? (
              <div className={styles.moreReviews}>
                {pageError ? (
                  <span role="alert">
                    {text(
                      locale,
                      "Couldn't load more reviews.",
                      "暂时无法加载更多评论。",
                    )}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setPageIndex((current) => Math.max(0, current - 1))
                  }
                  disabled={loadingMore || pageIndex === 0}
                  title={text(locale, "Previous reviews", "上一页评论")}
                  aria-label={text(locale, "Previous reviews", "上一页评论")}
                >
                  <ChevronLeft size={14} />
                </button>
                <span>
                  {offset + 1}–{offset + reviews.length} /{" "}
                  {instructor.reviewCount}
                </span>
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore || nextOffset === null}
                  title={text(locale, "More reviews", "更多评论")}
                  aria-label={text(locale, "More reviews", "更多评论")}
                >
                  {loadingMore ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              </div>
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
      onClick={() => setVisible((value) => !value)}
    >
      <Mail size={13} aria-hidden="true" />
      {visible
        ? `${username}@osu.edu`
        : text(locale, "Show OSU email", "显示 OSU 邮箱")}
    </button>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, LoaderCircle } from "lucide-react";
import type { CatalogCourse } from "@/lib/catalog/types";
import type { CourseRmpSummary } from "@/lib/rmp/types";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import { text, type Locale } from "@/lib/i18n";
import { InstructorAvatar } from "./instructor-avatar";
import styles from "./rmp-panel.module.css";

function score(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)} / 5`;
}

export default function RmpPanel({
  course,
  locale,
}: {
  course: CatalogCourse;
  locale: Locale;
}) {
  const usernames = [
    ...new Set(
      course.sections.flatMap((section) =>
        section.instructors.flatMap((instructor) => {
          const identity = nameDotNumberFromEmail(instructor.email);
          return identity ? [identity] : [];
        }),
      ),
    ),
  ].sort();
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
          `Reviews for ${course.subject} ${course.catalogNumber} by the currently listed instructors. Recent averages use the past two years; older comments keep their dates. These samples are separate from OSU SEI/SSLE responses.`,
          `仅展示当前授课教师在 ${course.subject} ${course.catalogNumber} 的评论。近期均分采用近两年样本，较早评论保留原日期；RMP 样本与官方 SEI/SSLE 回答数量分别统计。`,
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
          <p className={styles.note}>
            {text(
              locale,
              `${summary.matchedInstructorCount} of ${summary.requestedInstructorCount} identified instructors have a confirmed RMP match.`,
              `${summary.requestedInstructorCount} 位有官方身份的教师中，${summary.matchedInstructorCount} 位已确认 RMP 映射。`,
            )}
          </p>
          {summary.status === "no-data" ? (
            <p className={styles.empty}>
              {text(
                locale,
                "No confirmed RMP reviews for this course. Missing reviews do not imply a negative rating.",
                "本课程暂无已确认的 RMP 评论；缺少评论不代表负面评价。",
              )}
            </p>
          ) : null}
          {summary.instructors.map((instructor) => (
            <article className={styles.instructor} key={instructor.professorId}>
              <div className={styles.instructorHeading}>
                <div className={styles.identity}>
                  <InstructorAvatar
                    name={instructor.name}
                    email={`${instructor.nameDotNumber}@osu.edu`}
                  />
                  <div>
                    <h4>{instructor.name}</h4>
                    <span>
                      {text(
                        locale,
                        "Confirmed OSU identity",
                        "已确认 OSU 身份",
                      )}
                    </span>
                  </div>
                </div>
                <a
                  href={instructor.profileUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  RMP <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </div>
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
                  <dt>{text(locale, "Course reviews", "本课程评论")}</dt>
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
              {instructor.reviews.length ? (
                <div className={styles.reviews}>
                  <h5>
                    {text(locale, "Latest course comments", "本课程最近评论")}
                  </h5>
                  {instructor.reviews.map((review) => (
                    <div className={styles.review} key={review.id}>
                      <div className={styles.reviewMeta}>
                        {review.date ? (
                          <time dateTime={review.date}>{review.date}</time>
                        ) : (
                          <span>
                            {text(locale, "Date unavailable", "日期未知")}
                          </span>
                        )}
                        {review.date && review.date < summary.recentSince ? (
                          <span>
                            {text(
                              locale,
                              "Older than two years",
                              "两年前的评论",
                            )}
                          </span>
                        ) : null}
                        <span>
                          {text(locale, "Quality", "评价")}{" "}
                          {score(review.quality)}
                        </span>
                        <span>
                          {text(locale, "Difficulty", "难度")}{" "}
                          {score(review.difficulty)}
                        </span>
                      </div>
                      <p>
                        {review.comment ||
                          text(
                            locale,
                            "No written comment.",
                            "未填写文字评论。",
                          )}
                      </p>
                      {review.tags.length ? (
                        <ul
                          className={styles.tags}
                          aria-label={text(locale, "Review tags", "评论标签")}
                        >
                          {review.tags.map((tag) => (
                            <li key={tag}>{tag}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
          <footer className={styles.footer}>
            {text(
              locale,
              `Recent window starts ${summary.recentSince}. Quality is the mean of available helpfulness/clarity fields; difficulty uses its own sample. Up to three latest comments per matched profile.`,
              `近期窗口始于 ${summary.recentSince}。教学评价取可用的帮助程度/清晰度均值，难度采用其独立样本；每位已匹配教授最多展示三条最近评论。`,
            )}
          </footer>
        </>
      ) : null}
    </section>
  );
}

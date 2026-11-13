"use client";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { TranslateText } from "@/components/translation/translate-text";
import { text, type Locale } from "@/lib/i18n";
import type { RmpReview } from "@/lib/rmp/types";
import { rmpReviewFact, rmpTextbookFact } from "@/lib/rmp/review-facts";
import { rmpTagTone } from "@/lib/rmp/insights";
import styles from "./review-content.module.css";

/** Source-only feedback: these are counts, never vote controls. */
export function RmpReviewContent({
  review,
  locale,
}: {
  review: RmpReview;
  locale: Locale;
}) {
  const yesNo = (value: boolean | null) =>
    typeof value !== "boolean"
      ? null
      : value
        ? text(locale, "Yes", "是")
        : text(locale, "No", "否");
  const facts = [
    [text(locale, "Grade", "课程成绩"), rmpReviewFact(review.grade, locale)],
    [
      text(locale, "Attendance", "出勤要求"),
      rmpReviewFact(review.attendance, locale),
    ],
    [
      text(locale, "Textbook use", "教材使用"),
      rmpTextbookFact(review.textbook, locale),
    ],
    [text(locale, "Online course", "线上课程"), yesNo(review.online)],
    [text(locale, "For credit", "计学分"), yesNo(review.forCredit)],
  ].filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  return (
    <div className={styles.content} data-rmp-review={review.id}>
      <div className={styles.scores}>
        {(
          [
            [text(locale, "Quality", "综合"), review.quality, false],
            [text(locale, "Helpfulness", "帮助度"), review.helpfulness, false],
            [text(locale, "Clarity", "清晰度"), review.clarity, false],
            [text(locale, "Difficulty", "难度"), review.difficulty, true],
          ] as const
        ).map(([label, value, inverse]) =>
          typeof value === "number" ? (
            <span
              key={label}
              data-tone={
                inverse
                  ? value >= 4
                    ? "caution"
                    : value < 2.5
                      ? "positive"
                      : "mixed"
                  : value >= 4
                    ? "positive"
                    : value < 3
                      ? "caution"
                      : "mixed"
              }
            >
              {label} <b>{value.toFixed(1)}</b>
              <small>/5</small>
            </span>
          ) : null,
        )}
        {typeof review.wouldTakeAgain === "boolean" ? (
          <span>
            {text(locale, "Would take again", "愿意再选")}{" "}
            <b>{yesNo(review.wouldTakeAgain)}</b>
          </span>
        ) : null}
      </div>
      {review.comment ? (
        <TranslateText
          text={review.comment}
          locale={locale}
          className={styles.comment}
        />
      ) : (
        <p className={styles.noComment}>
          {text(locale, "No written comment.", "未填写文字评论。")}
        </p>
      )}
      {review.tags.length ? (
        <ul
          className={styles.tags}
          aria-label={text(locale, "Review tags", "评论标签")}
        >
          {review.tags.map((tag) => (
            <li key={tag} data-tone={rmpTagTone(tag)}>
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      {review.teacherReply?.comment ? (
        <blockquote className={styles.reply}>
          <header>
            <strong>{text(locale, "Teacher response", "教师回复")}</strong>
            {review.teacherReply.date ? (
              <time>{review.teacherReply.date}</time>
            ) : null}
          </header>
          <TranslateText text={review.teacherReply.comment} locale={locale} />
        </blockquote>
      ) : null}
      <div className={styles.footer}>
        {facts.length ? (
          <details className={styles.details}>
            <summary>{text(locale, "Review details", "评价详情")}</summary>
            <dl>
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
        <div
          className={styles.feedback}
          role="group"
          aria-label={text(
            locale,
            "Feedback recorded on RMP (read only)",
            "RMP 原站反馈（只读）",
          )}
          title={text(
            locale,
            "RMP counts · Read only",
            "RMP 原站数量 · 仅展示",
          )}
        >
          <span
            role="img"
            aria-label={text(
              locale,
              `Thumbs up: ${review.thumbsUp ?? "unknown"}`,
              `赞同：${review.thumbsUp ?? "未知"}`,
            )}
          >
            <ThumbsUp size={13} aria-hidden="true" />
            {review.thumbsUp ?? "—"}
          </span>
          <span
            role="img"
            aria-label={text(
              locale,
              `Thumbs down: ${review.thumbsDown ?? "unknown"}`,
              `不赞同：${review.thumbsDown ?? "未知"}`,
            )}
          >
            <ThumbsDown size={13} aria-hidden="true" />
            {review.thumbsDown ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

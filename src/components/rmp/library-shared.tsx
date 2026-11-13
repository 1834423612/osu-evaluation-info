"use client";
import { AlertTriangle, BadgeCheck, ExternalLink } from "lucide-react";
import { text, type Locale } from "@/lib/i18n";
import type { RmpLibraryReview, RmpProfile } from "@/lib/rmp/library-types";
import { TranslateText } from "@/components/translation/translate-text";
import styles from "./library.module.css";
export const rating = (value: number | null) =>
  value === null ? "—" : value.toFixed(1);
export function RmpIdentityBadge({
  profile,
  locale,
}: {
  profile: Pick<RmpProfile, "username">;
  locale: Locale;
}) {
  return (
    <span className={profile.username ? styles.verified : styles.warning}>
      {profile.username ? (
        <BadgeCheck size={12} />
      ) : (
        <AlertTriangle size={12} />
      )}{" "}
      {profile.username
        ? text(locale, "Identity verified", "身份已确认")
        : text(locale, "Identity unconfirmed", "身份待确认")}
    </span>
  );
}
export function RmpProfileSource({
  profile,
  locale,
}: {
  profile: RmpProfile;
  locale: Locale;
}) {
  return (
    <div className={styles.source}>
      <a
        href={`https://www.ratemyprofessors.com/professor/${profile.id}`}
        target="_blank"
        rel="noreferrer"
      >
        RMP #{profile.id}
        <ExternalLink size={12} />
      </a>
      <span>
        {text(locale, "Synced", "同步于")}{" "}
        {new Date(profile.updatedAt).toLocaleString(
          locale === "zh" ? "zh-CN" : "en-US",
          { dateStyle: "medium", timeStyle: "short" },
        )}
      </span>
      {!profile.active ? (
        <span className={styles.warning}>
          {text(locale, "Source profile archived", "原站档案已归档")}
        </span>
      ) : null}
    </div>
  );
}
export function RmpLibraryReviewCard({
  review,
  locale,
}: {
  review: RmpLibraryReview;
  locale: Locale;
}) {
  return (
    <article className={styles.review} data-library-review={review.id}>
      <div className={styles.reviewMeta}>
        <strong>
          {review.course || text(locale, "Course unspecified", "未注明课程")}
        </strong>
        <time>{review.date ?? text(locale, "Date unknown", "日期未知")}</time>
        {!review.active ? (
          <span className={styles.warning}>
            {text(locale, "Archived source review", "原站已移除 · 留存")}
          </span>
        ) : null}
      </div>
      <div className={styles.reviewScores}>
        <span
          data-tone={
            (review.quality ?? 0) >= 4
              ? "good"
              : (review.quality ?? 5) < 3
                ? "low"
                : "mixed"
          }
        >
          {text(locale, "Quality", "教学")} <b>{rating(review.quality)}</b>/5
        </span>
        <span>
          {text(locale, "Difficulty", "难度")}{" "}
          <b>{rating(review.difficulty)}</b>/5
        </span>
        {review.wouldTakeAgain !== null ? (
          <span>
            {text(locale, "Would take again", "愿意再选")}{" "}
            {review.wouldTakeAgain
              ? text(locale, "Yes", "是")
              : text(locale, "No", "否")}
          </span>
        ) : null}
      </div>
      <TranslateText
        text={review.comment}
        locale={locale}
        className={styles.comment}
      />
      {review.tags.length ? (
        <ul className={styles.tags}>
          {review.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}
      {review.teacherReply ? (
        <blockquote className={styles.teacherReply}>
          <strong>{text(locale, "Teacher response", "教师回复")}</strong>
          <p>{review.teacherReply.comment}</p>
        </blockquote>
      ) : null}
      <details className={styles.reviewDetails}>
        <summary>{text(locale, "Review details", "评价详情")}</summary>
        <dl>
          {[
            [text(locale, "Grade", "成绩"), review.grade],
            [text(locale, "Attendance", "出勤要求"), review.attendance],
            [text(locale, "Textbook", "教材使用"), review.textbook],
            [
              text(locale, "Online", "线上课程"),
              review.online === null
                ? null
                : review.online
                  ? text(locale, "Yes", "是")
                  : text(locale, "No", "否"),
            ],
            [
              text(locale, "For credit", "计学分"),
              review.forCredit === null
                ? null
                : review.forCredit
                  ? text(locale, "Yes", "是")
                  : text(locale, "No", "否"),
            ],
            [
              text(locale, "Helpful / unhelpful", "赞同 / 不赞同"),
              `${review.thumbsUp} / ${review.thumbsDown}`,
            ],
          ]
            .filter(([, value]) => value !== null && value !== "")
            .map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
      </details>
    </article>
  );
}

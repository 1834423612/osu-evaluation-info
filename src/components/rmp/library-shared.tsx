"use client";
import { AlertTriangle, BadgeCheck, ExternalLink } from "lucide-react";
import { text, type Locale } from "@/lib/i18n";
import type { RmpLibraryReview, RmpProfile } from "@/lib/rmp/library-types";
import { RmpReviewContent } from "./review-content";
import styles from "./library.module.css";
export {
  formatRmpRating as rating,
  formatRmpPercent as percentage,
  profileInitials,
  ratingTone,
} from "@/lib/rmp/display";
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
      <RmpReviewContent review={review} locale={locale} />
    </article>
  );
}

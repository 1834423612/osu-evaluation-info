"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, BookOpen, MessageSquare } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { EmptyResult } from "@/components/brand/empty-result";
import { usePreferences } from "@/hooks/use-preferences";
import { useRmpResource } from "@/hooks/use-rmp-resource";
import { text } from "@/lib/i18n";
import type { RmpProfileDetail } from "@/lib/rmp/library-types";
import {
  RmpIdentityBadge,
  profileInitials,
  ratingTone,
  RmpProfileSource,
  RmpLibraryReviewCard,
  rating,
  percentage,
} from "./library-shared";
import styles from "./library.module.css";
export function RmpProfilePage({
  id,
  course = null,
  offset = 0,
}: {
  id: string;
  course?: string | null;
  offset?: number;
}) {
  const { locale } = usePreferences();
  const router = useRouter();
  const params = new URLSearchParams({ offset: String(offset) });
  if (course !== null) params.set("course", course);
  const { data, loading, error, retry } = useRmpResource<RmpProfileDetail>(
    `/api/rmp/professors/${id}?${params}`,
  );
  const profile = data?.profile;
  function link(code: string | null, next = 0) {
    const p = new URLSearchParams({ offset: String(next) });
    if (code !== null) p.set("course", code);
    return `/rmp/${id}?${p}` as const;
  }
  return (
    <>
      <AppHeader active="rmp" />
      <main className={styles.page}>
        <Link href="/rmp" className={styles.back}>
          <ArrowLeft size={14} />
          {text(locale, "RMP faculty library", "RMP 教师库")}
        </Link>
        {loading ? (
          <p role="status">
            {text(locale, "Loading reviews…", "正在读取评价…")}
          </p>
        ) : error ? (
          <p role="alert">
            {text(locale, "Profile unavailable.", "档案暂不可用。")}{" "}
            <button onClick={retry}>{text(locale, "Retry", "重试")}</button>
          </p>
        ) : null}
        {data && profile ? (
          <>
            <header className={styles.profileHeader}>
              <div className={styles.profileIdentity}>
                <span className={styles.profileMonogram} aria-hidden="true">
                  {profileInitials(profile.name)}
                </span>
                <div>
                  <span className={styles.eyebrow}>
                    {profile.campuses.join(" / ")} · {profile.department}
                  </span>
                  <h1>{profile.name}</h1>
                  <div className={styles.identityLine}>
                    <RmpIdentityBadge profile={profile} locale={locale} />
                    {profile.username ? (
                      <span>
                        {profile.officialName &&
                        profile.officialName !== profile.name
                          ? `${profile.officialName} · `
                          : ""}
                        {profile.username}
                      </span>
                    ) : null}
                  </div>
                  <RmpProfileSource profile={profile} locale={locale} />
                </div>
              </div>
              <div className={styles.ratings}>
                <div data-tone={ratingTone(profile.quality)}>
                  <span>{text(locale, "RMP overall", "RMP 原站均分")}</span>
                  <b>
                    {rating(profile.quality)}
                    <small>/5</small>
                  </b>
                </div>
                <div data-tone={ratingTone(profile.difficulty, true)}>
                  <span>{text(locale, "Difficulty", "难度")}</span>
                  <b>
                    {rating(profile.difficulty)}
                    <small>/5</small>
                  </b>
                </div>
                <div>
                  <span>{text(locale, "Would take again", "愿意再选")}</span>
                  <b>{percentage(profile.wouldTakeAgain)}</b>
                </div>
              </div>
            </header>
            <p
              className={styles.notice}
              data-tone={profile.username ? "neutral" : "warning"}
            >
              {profile.username
                ? text(
                    locale,
                    "RMP student reviews · Course labels are not official teaching records.",
                    "RMP 学生评价 · 课程代码不代表官方任课证明。",
                  )
                : text(
                    locale,
                    "Identity unconfirmed · Profile and course labels come from RMP.",
                    "身份待确认 · 档案及课程标注来自 RMP。",
                  )}
            </p>
            <div className={styles.profileLayout}>
              <aside className={styles.courseList}>
                <h2>
                  <BookOpen size={14} aria-hidden="true" />
                  {text(locale, "Courses reviewed", "有评价的课程")}{" "}
                  <small>{data.courses.length}</small>
                </h2>
                <select
                  className={styles.mobileCourseSelect}
                  aria-label={text(locale, "Courses reviewed", "有评价的课程")}
                  value={course === null ? "all" : `course:${course}`}
                  onChange={(event) =>
                    router.push(
                      link(
                        event.target.value === "all"
                          ? null
                          : event.target.value.slice("course:".length),
                      ),
                    )
                  }
                >
                  <option value="all">
                    {text(locale, "All courses", "全部课程")} ·{" "}
                    {profile.storedReviewCount}
                  </option>
                  {data.courses.map((item) => (
                    <option key={item.code} value={`course:${item.code}`}>
                      {item.code ||
                        text(locale, "Course unspecified", "未注明课程")}{" "}
                      · {item.count}
                    </option>
                  ))}
                </select>
                <Link
                  href={link(null)}
                  aria-current={course === null ? "page" : undefined}
                >
                  {text(locale, "All courses", "全部课程")}
                  <span>{profile.storedReviewCount}</span>
                </Link>
                {data.courses.map((item) => (
                  <Link
                    key={item.code}
                    href={link(item.code)}
                    aria-current={course === item.code ? "page" : undefined}
                  >
                    <span>
                      {item.code ||
                        text(locale, "Course unspecified", "未注明课程")}
                    </span>
                    <span>{item.count}</span>
                  </Link>
                ))}
              </aside>
              <section
                className={styles.reviewList}
                aria-label={text(locale, "Student reviews", "学生评价")}
              >
                <div className={styles.toolbar}>
                  <h2>
                    <MessageSquare size={15} aria-hidden="true" />
                    {course === null
                      ? text(locale, "All reviews", "全部评价")
                      : course ||
                        text(locale, "Course unspecified", "未注明课程")}{" "}
                    <small>{data.total}</small>
                  </h2>
                  <button onClick={retry}>
                    <RefreshCw size={13} />
                    {text(locale, "Reload", "重新读取")}
                  </button>
                </div>
                <p className={styles.caption}>
                  {text(
                    locale,
                    `${profile.sourceReviewCount} reported by RMP · ${profile.storedReviewCount} saved · ${profile.archivedReviewCount} archived`,
                    `原站 ${profile.sourceReviewCount} 条 · 已保存 ${profile.storedReviewCount} 条 · 其中归档 ${profile.archivedReviewCount} 条`,
                  )}
                </p>
                {data.reviews.length ? (
                  data.reviews.map((review) => (
                    <RmpLibraryReviewCard
                      key={review.id}
                      review={review}
                      locale={locale}
                    />
                  ))
                ) : (
                  <EmptyResult>
                    {text(
                      locale,
                      "No saved reviews for this selection",
                      "此筛选下暂无已保存评价",
                    )}
                  </EmptyResult>
                )}
                <nav
                  className={styles.pagination}
                  aria-label={text(locale, "Review pages", "评价分页")}
                >
                  {offset > 0 ? (
                    <Link href={link(course, Math.max(0, offset - 12))}>
                      {text(locale, "Previous", "上一页")}
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span>
                    {Math.floor(offset / 12) + 1} /{" "}
                    {Math.max(1, Math.ceil(data.total / 12))}
                  </span>
                  {data.nextOffset !== null ? (
                    <Link href={link(course, data.nextOffset)}>
                      {text(locale, "Next", "下一页")}
                    </Link>
                  ) : (
                    <span />
                  )}
                </nav>
                {data.supplements?.length ? (
                  <details className={styles.supplements}>
                    <summary>
                      {text(
                        locale,
                        "Unverified historical supplements",
                        "未核验的历史补充",
                      )}{" "}
                      · {data.supplements.length}
                    </summary>
                    <p>
                      {text(
                        locale,
                        "Possible duplicates; excluded from review counts and averages.",
                        "重复关系待核实，不计入评价数量和均分。",
                      )}
                    </p>
                    {data.supplements.map((item) => (
                      <article key={item.key} className={styles.review}>
                        <div className={styles.reviewMeta}>
                          <strong>
                            {item.course ||
                              text(locale, "Course unspecified", "未注明课程")}
                          </strong>
                          <time>{item.date}</time>
                        </div>
                        <div className={styles.reviewScores}>
                          <span>
                            {text(locale, "Recorded quality", "记录评分")}{" "}
                            {rating(item.quality)}
                          </span>
                          <span>
                            {text(locale, "Difficulty", "难度")}{" "}
                            {rating(item.difficulty)}
                          </span>
                        </div>
                        <p className={styles.comment}>{item.comment}</p>
                      </article>
                    ))}
                  </details>
                ) : null}
              </section>
            </div>
          </>
        ) : null}
      </main>
      <AppFooter />
    </>
  );
}

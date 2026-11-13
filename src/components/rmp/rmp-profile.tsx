"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { EmptyResult } from "@/components/brand/empty-result";
import { usePreferences } from "@/hooks/use-preferences";
import { useRmpResource } from "@/hooks/use-rmp-resource";
import { text } from "@/lib/i18n";
import type { RmpProfileDetail } from "@/lib/rmp/library-types";
import {
  RmpIdentityBadge,
  RmpProfileSource,
  RmpLibraryReviewCard,
  rating,
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
              <div>
                <span className={styles.eyebrow}>
                  {profile.campuses.join(" / ")} · {profile.department}
                </span>
                <h1>{profile.name}</h1>
                <div className={styles.identityLine}>
                  <RmpIdentityBadge profile={profile} locale={locale} />
                  {profile.username ? (
                    <span>
                      {profile.officialName} · {profile.username}
                    </span>
                  ) : null}
                </div>
                <RmpProfileSource profile={profile} locale={locale} />
              </div>
              <div className={styles.ratings}>
                <div>
                  <span>{text(locale, "RMP overall", "RMP 原站均分")}</span>
                  <b>
                    {rating(profile.quality)}
                    <small>/5</small>
                  </b>
                </div>
                <div>
                  <span>{text(locale, "Difficulty", "难度")}</span>
                  <b>
                    {rating(profile.difficulty)}
                    <small>/5</small>
                  </b>
                </div>
                <div>
                  <span>{text(locale, "Would take again", "愿意再选")}</span>
                  <b>
                    {profile.wouldTakeAgain === null
                      ? "—"
                      : Math.round(profile.wouldTakeAgain) + "%"}
                  </b>
                </div>
              </div>
            </header>
            <p className={styles.notice}>
              {profile.username
                ? text(
                    locale,
                    "Student opinions from RMP; course labels are not official teaching records.",
                    "以下为 RMP 学生主观评价，课程代码不代表官方任课证明。",
                  )
                : text(
                    locale,
                    "Official identity unconfirmed. Name, department and courses below are from RMP.",
                    "官方身份待确认。以下姓名、院系及课程信息来自 RMP。",
                  )}
            </p>
            <div className={styles.profileLayout}>
              <aside className={styles.courseList}>
                <h2>
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
              </section>
            </div>
          </>
        ) : null}
      </main>
      <AppFooter />
    </>
  );
}

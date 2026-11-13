"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, MessageSquare, RefreshCw } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { EmptyResult } from "@/components/brand/empty-result";
import { usePreferences } from "@/hooks/use-preferences";
import { useRmpResource } from "@/hooks/use-rmp-resource";
import { text } from "@/lib/i18n";
import type { RmpLibraryResult } from "@/lib/rmp/library-types";
import { RmpIdentityBadge, rating } from "./library-shared";
import styles from "./library.module.css";
export function RmpLibrary({
  query = "",
  campus = "ALL",
  identity = "all",
  offset = 0,
}: {
  query?: string;
  campus?: string;
  identity?: string;
  offset?: number;
}) {
  const { locale } = usePreferences();
  const router = useRouter();
  const params = new URLSearchParams({
    q: query,
    campus,
    identity,
    offset: String(offset),
  });
  const { data, loading, error, retry } = useRmpResource<RmpLibraryResult>(
    `/api/rmp/professors?${params}`,
  );
  function pageLink(next: number) {
    const p = new URLSearchParams(params);
    p.set("offset", String(next));
    return `/rmp?${p}` as const;
  }
  return (
    <>
      <AppHeader active="rmp" />
      <main className={styles.page}>
        <header className={styles.hero}>
          <span className={styles.eyebrow}>
            <MessageSquare size={15} /> RATE MY PROFESSORS
          </span>
          <h1>{text(locale, "RMP faculty library", "RMP 教师库")}</h1>
          <p>
            {text(
              locale,
              "Browse every saved profile and its course reviews.",
              "查看所有已保存教师档案及其课程评价。",
            )}
          </p>
        </header>
        <form
          className={styles.filters}
          key={`${query}:${campus}:${identity}`}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const p = new URLSearchParams();
            for (const [key, value] of form) p.set(key, String(value));
            router.push(`/rmp?${p}`);
          }}
        >
          <label className={styles.search}>
            <span>
              {text(
                locale,
                "Name, department or RMP course code",
                "姓名、院系或 RMP 课程代码",
              )}
            </span>
            <div>
              <Search size={16} />
              <input
                name="q"
                defaultValue={query}
                maxLength={100}
                placeholder={text(
                  locale,
                  "Search teachers or courses",
                  "搜索教师或课程",
                )}
              />
            </div>
          </label>
          <label>
            <span>{text(locale, "Campus", "校区")}</span>
            <select name="campus" defaultValue={campus}>
              {[
                ["ALL", text(locale, "All campuses", "所有校区")],
                ["COL", "Columbus"],
                ["LMA", "Lima"],
                ["MNS", "Mansfield"],
                ["MRN", "Marion"],
                ["NWK", "Newark"],
                ["WST", "Wooster"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text(locale, "Official identity", "官方身份")}</span>
            <select name="identity" defaultValue={identity}>
              <option value="all">
                {text(locale, "All profiles", "全部档案")}
              </option>
              <option value="verified">
                {text(locale, "Verified", "已确认")}
              </option>
              <option value="unverified">
                {text(locale, "Unconfirmed", "待确认")}
              </option>
            </select>
          </label>
          <button type="submit" className={styles.primary}>
            {text(locale, "Search", "搜索")}
          </button>
        </form>
        <div className={styles.toolbar}>
          <span>
            {data
              ? text(
                  locale,
                  `${data.total.toLocaleString()} profiles`,
                  `${data.total.toLocaleString()} 份档案`,
                )
              : "RMP"}
          </span>
          <button
            type="button"
            onClick={retry}
            aria-label={text(locale, "Reload saved data", "重新读取已保存数据")}
          >
            <RefreshCw size={13} />
            {text(locale, "Reload", "重新读取")}
          </button>
        </div>
        <p className={styles.notice}>
          {text(
            locale,
            "RMP names and course labels are user supplied. Unconfirmed profiles are kept separate from official ratings.",
            "RMP 姓名与课程代码由用户填写；待确认档案不计入官方评分。",
          )}
        </p>
        {loading ? (
          <p role="status">
            {text(locale, "Loading profiles…", "正在读取档案…")}
          </p>
        ) : error ? (
          <p role="alert">
            {text(locale, "Could not load RMP data.", "RMP 数据暂不可用。")}{" "}
            <button onClick={retry}>{text(locale, "Retry", "重试")}</button>
          </p>
        ) : data && !data.profiles.length ? (
          <EmptyResult layout="stack">
            {text(locale, "No matching profiles", "没有找到相关档案")}
          </EmptyResult>
        ) : null}
        <div className={styles.grid}>
          {data?.profiles.map((profile) => (
            <Link
              className={styles.profileCard}
              key={profile.id}
              href={`/rmp/${profile.id}`}
              data-rmp-profile={profile.id}
            >
              <div className={styles.cardTitle}>
                <h2>{profile.name}</h2>
                <ArrowRight size={15} />
              </div>
              <div className={styles.cardDept}>
                {profile.department ||
                  text(locale, "Department unspecified", "未注明院系")}{" "}
                · {profile.campuses.join(" / ")}
              </div>
              <RmpIdentityBadge profile={profile} locale={locale} />
              {!profile.active ? (
                <span className={styles.archive}>
                  {text(locale, "Source archived", "原站已归档")}
                </span>
              ) : null}
              <div className={styles.cardStats}>
                <span>
                  {text(locale, "RMP quality", "RMP 评分")}{" "}
                  <b>{rating(profile.quality)}</b>
                  <small>/5</small>
                </span>
                <span>
                  {profile.storedReviewCount}{" "}
                  {text(locale, "saved reviews", "条已保存评价")}
                </span>
              </div>
            </Link>
          ))}
        </div>
        {data ? (
          <nav
            className={styles.pagination}
            aria-label={text(locale, "Profile pages", "档案分页")}
          >
            {offset > 0 ? (
              <Link href={pageLink(Math.max(0, offset - 24))}>
                {text(locale, "Previous", "上一页")}
              </Link>
            ) : (
              <span />
            )}
            <span>
              {Math.floor(offset / 24) + 1} /{" "}
              {Math.max(1, Math.ceil(data.total / 24))}
            </span>
            {data.nextOffset !== null ? (
              <Link href={pageLink(data.nextOffset)}>
                {text(locale, "Next", "下一页")}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </main>
      <AppFooter />
    </>
  );
}

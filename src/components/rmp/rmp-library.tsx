"use client";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { browserStorage } from "@/lib/preferences/browser-storage";
import { useRouter } from "next/navigation";
import {
  Search,
  ArrowUpRight,
  LayoutGrid,
  List,
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { EmptyResult } from "@/components/brand/empty-result";
import { usePreferences } from "@/hooks/use-preferences";
import { useRmpResource } from "@/hooks/use-rmp-resource";
import { text } from "@/lib/i18n";
import type { RmpLibraryResult } from "@/lib/rmp/library-types";
import {
  RmpIdentityBadge,
  rating,
  percentage,
  profileInitials,
  ratingTone,
} from "./library-shared";
import styles from "./library.module.css";
const VIEW_KEY = "course-atlas:rmp-view:v1";
const viewEvent = "course-atlas:rmp-view-change";
let memoryView: "grid" | "list" | null = null;
const readView = (): "grid" | "list" => {
  if (memoryView) return memoryView;
  try {
    return browserStorage().getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};
const subscribeView = (listener: () => void) => {
  const storageChanged = () => {
    memoryView = null;
    listener();
  };
  window.addEventListener("storage", storageChanged);
  window.addEventListener(viewEvent, listener);
  return () => {
    window.removeEventListener("storage", storageChanged);
    window.removeEventListener(viewEvent, listener);
  };
};
const serverView = () => "grid" as const;
function saveView(value: "grid" | "list") {
  memoryView = value;
  try {
    browserStorage().setItem(VIEW_KEY, value);
  } catch {
    /* Restricted storage keeps the page usable. */
  }
  window.dispatchEvent(new Event(viewEvent));
}

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
  const view = useSyncExternalStore(subscribeView, readView, serverView);
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
          <div className={styles.toolbarActions}>
            <div
              className={styles.viewSwitch}
              role="group"
              aria-label={text(locale, "Display", "显示方式")}
            >
              <button
                type="button"
                aria-pressed={view === "grid"}
                onClick={() => saveView("grid")}
                aria-label={text(locale, "Grid view", "网格视图")}
              >
                <LayoutGrid size={14} />
                <span>{text(locale, "Grid", "网格")}</span>
              </button>
              <button
                type="button"
                aria-pressed={view === "list"}
                onClick={() => saveView("list")}
                aria-label={text(locale, "List view", "列表视图")}
              >
                <List size={14} />
                <span>{text(locale, "List", "列表")}</span>
              </button>
            </div>
            <button
              type="button"
              onClick={retry}
              aria-label={text(
                locale,
                "Reload saved data",
                "重新读取已保存数据",
              )}
            >
              <RefreshCw size={13} />
              {text(locale, "Reload", "重新读取")}
            </button>
          </div>
        </div>
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
        <div
          className={styles.grid}
          data-rmp-library-view={view}
          data-view={view}
        >
          {data?.profiles.map((profile) => (
            <Link
              className={styles.profileCard}
              key={profile.id}
              href={`/rmp/${profile.id}`}
              data-rmp-profile={profile.id}
            >
              <div className={styles.cardIdentity}>
                <span
                  className={styles.monogram}
                  data-palette={Number(profile.id) % 3}
                  aria-hidden="true"
                >
                  {profileInitials(profile.name)}
                </span>
                <div className={styles.cardIdentityText}>
                  <h2>{profile.name}</h2>
                  <p className={styles.cardDept}>
                    {profile.department ||
                      text(locale, "Department unspecified", "未注明院系")}
                  </p>
                  <div className={styles.cardBadges}>
                    <RmpIdentityBadge profile={profile} locale={locale} />
                    <span className={styles.campus}>
                      {profile.campuses.join(" / ")}
                    </span>
                    {!profile.active ? (
                      <span className={styles.archive}>
                        {text(locale, "Archived", "已归档")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ArrowUpRight size={15} className={styles.cardArrow} />
              </div>
              <dl className={styles.cardMetrics}>
                <div data-tone={ratingTone(profile.quality)}>
                  <dt>{text(locale, "RMP quality", "RMP 评分")}</dt>
                  <dd>
                    {rating(profile.quality)}
                    <small>/5</small>
                  </dd>
                </div>
                <div data-tone={ratingTone(profile.difficulty, true)}>
                  <dt>{text(locale, "Difficulty", "难度")}</dt>
                  <dd>
                    {rating(profile.difficulty)}
                    <small>/5</small>
                  </dd>
                </div>
                <div>
                  <dt>{text(locale, "Would take again", "愿意再选")}</dt>
                  <dd>{percentage(profile.wouldTakeAgain)}</dd>
                </div>
              </dl>
              <div className={styles.cardFoot}>
                <span>
                  <MessageSquare size={12} />
                  {profile.storedReviewCount.toLocaleString()}{" "}
                  {text(locale, "reviews", "条评价")}
                </span>
                <span>RMP #{profile.id}</span>
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

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { Bookmark, ArrowUpRight, RefreshCw, TrendingUp } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyResult } from "@/components/brand/empty-result";
import { CourseCard } from "./course-card";
import { usePreferences } from "@/hooks/use-preferences";
import type {
  PopularResult,
  PopularItem,
  PopularKind,
} from "@/lib/user-data/statistics";
import { text } from "@/lib/i18n";
import { sharingDate } from "@/lib/saved/share-links";
import styles from "@/components/ui/workspace.module.css";
export function PopularPage() {
  const {
      locale,
      saved,
      toggleSaved,
      enrollmentWatch,
      enrollmentWatchInterval,
      setEnrollmentWatch,
      setEnrollmentWatchInterval,
    } = usePreferences(),
    params = useSearchParams();
  const raw = params.get("kind"),
    kind: PopularKind =
      raw === "section" || raw === "instructor" ? raw : "course";
  const [data, setData] = useState<PopularResult | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [chosen, setChosen] = useState<PopularItem | null>(null);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/popular?kind=" + kind, { signal: c.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((value) => {
        if (!c.signal.aborted) {
          setData(value);
          setError(false);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) {
          setData(null);
          setError(true);
          setLoading(false);
        }
      });
    return () => c.abort();
  }, [kind, retry]);
  const selected =
    (chosen?.course?.id === params.get("course")
      ? chosen
      : data?.items.find(
          (x) =>
            x.course?.id === params.get("course") &&
            (!params.get("focusSection") ||
              x.focusSection === params.get("focusSection")),
        )) ?? null;
  function chooseKind(value: string) {
    setLoading(true);
    setChosen(null);
    window.history.replaceState(
      null,
      "",
      "/popular?" + new URLSearchParams({ kind: value }),
    );
  }
  function open(item: PopularItem) {
    if (!item.course) return;
    setChosen(item);
    const query = new URLSearchParams({
      kind,
      course: item.course.id,
      detailTab: "sections",
    });
    if (item.focusSection) query.set("focusSection", item.focusSection);
    window.history.pushState(
      { courseDetail: item.course.id, courseDetailDepth: 1 },
      "",
      "/popular?" + query,
    );
  }
  return (
    <>
      <AppHeader active="popular" />
      <main className={styles.shell}>
        <div className={styles.heading}>
          <div>
            <h1 className={styles.pageTitle}>
              <TrendingUp size={22} />
              {text(locale, "Most saved", "热门收藏")}
            </h1>
            <p>
              {text(
                locale,
                "Active favorites in synced accounts",
                "已同步账号当前保留的收藏",
              )}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRetry((x) => x + 1);
            }}
          >
            <RefreshCw size={14} />
            {text(locale, "Refresh", "刷新")}
          </Button>
        </div>
        <section className={styles.panel}>
          <div className={styles.panelHeading + " " + styles.popularHeading}>
            <Tabs value={kind} onValueChange={chooseKind}>
              <TabsList>
                <TabsTrigger value="course">
                  {text(locale, "Courses", "课程")}
                </TabsTrigger>
                <TabsTrigger value="section">
                  {text(locale, "Sections", "班次")}
                </TabsTrigger>
                <TabsTrigger value="instructor">
                  {text(locale, "Instructors", "教师")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {data ? (
              <small className={styles.muted}>
                {sharingDate(data.asOf, locale)}
              </small>
            ) : null}
          </div>
          {loading ? (
            <p role="status">{text(locale, "Loading…", "正在读取…")}</p>
          ) : error ? (
            <p role="status" className={styles.notice}>
              {text(
                locale,
                "Saved counts are unavailable. Retry later.",
                "收藏统计暂不可用，请稍后重试。",
              )}
            </p>
          ) : !data?.items.length ? (
            <EmptyResult layout="stack" size={56}>
              {text(locale, "No synced favorites yet", "暂无已同步的收藏")}
            </EmptyResult>
          ) : (
            <ol className={styles.popularGrid}>
              {data.items.map((item, index) => {
                const body = (
                  <>
                    <span className={styles.rank}>{index + 1}</span>
                    <span className={styles.popularCopy}>
                      <strong>{item.label}</strong>
                      {item.context ? <small>{item.context}</small> : null}
                    </span>
                    <span className={styles.badge}>
                      <Bookmark size={12} />
                      {item.accounts}{" "}
                      {text(
                        locale,
                        item.accounts === 1 ? "account" : "accounts",
                        "个账号",
                      )}
                    </span>
                    <ArrowUpRight size={14} />
                  </>
                );
                return (
                  <li key={item.key}>
                    {item.course ? (
                      <button
                        className={styles.popularItem}
                        onClick={() => open(item)}
                      >
                        {body}
                      </button>
                    ) : (
                      <Link
                        className={styles.popularItem}
                        href={(item.href ?? "/rmp") as Route}
                      >
                        {body}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <small className={styles.muted}>
            {text(
              locale,
              "One count per account and item. Updated within a minute.",
              "同一账号每项计一次，最多延迟一分钟更新。",
            )}
          </small>
        </section>
        {selected?.course ? (
          <div className={styles.previewCard}>
            <CourseCard
              key={selected.key}
              course={selected.course}
              locale={locale}
              saved={saved.some((x) => x.id === selected.course!.id)}
              onSave={toggleSaved}
              enrollmentWatch={enrollmentWatch}
              enrollmentWatchInterval={enrollmentWatchInterval}
              onEnrollmentWatchChange={setEnrollmentWatch}
              onEnrollmentWatchIntervalChange={setEnrollmentWatchInterval}
            />
          </div>
        ) : null}
      </main>
      <AppFooter />
    </>
  );
}

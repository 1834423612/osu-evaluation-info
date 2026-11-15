"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { Star, ArrowUpRight, RefreshCw, Sparkles } from "lucide-react";
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
import flow from "@/components/personal/exchange.module.css";
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
    [subject, setSubject] = useState(""),
    [chosen, setChosen] = useState<PopularItem | null>(null);
  useEffect(() => {
    const c = new AbortController();
    fetch(
      "/api/popular?" +
        new URLSearchParams({ kind, subject, seed: String(retry) }),
      { signal: c.signal },
    )
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
  }, [kind, retry, subject]);
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
              <Sparkles size={22} />
              {text(locale, "Discover your next class", "发现下一门好课")}
            </h1>
            <p>
              {text(
                locale,
                "A fresh mix of courses, ratings and teaching options",
                "从课程、评价与教学安排中，探索新的选择",
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
          <label className={flow.subjectFilter}>
            <span className={styles.muted}>
              {text(locale, "Subject", "学科")}
            </span>
            <select
              className={styles.input}
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setLoading(true);
              }}
            >
              <option value="">
                {text(locale, "All subjects", "全部学科")}
              </option>
              {(data?.subjects ?? []).map((code) => (
                <option value={code} key={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
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
                "Recommendations are unavailable. Retry later.",
                "推荐暂不可用，请稍后重试。",
              )}
            </p>
          ) : !data?.items.length ? (
            <EmptyResult layout="stack" size={56}>
              {text(
                locale,
                "No recommendations in this subject yet",
                "该学科暂无推荐",
              )}
            </EmptyResult>
          ) : (
            <ul className={flow.discoverGrid}>
              {data.items.map((item) => {
                const body = (
                  <>
                    <div className={flow.discoverTop}>
                      <span>
                        {item.course ? (
                          <small className={flow.discoverCode}>
                            {item.course.subject} {item.course.catalogNumber}
                          </small>
                        ) : null}
                        <strong>{item.course?.title ?? item.label}</strong>
                      </span>
                      <ArrowUpRight size={16} />
                    </div>
                    <div className={flow.discoverBottom}>
                      <span>{item.context}</span>
                      {item.course?.evaluation?.primary ? (
                        <span className={flow.discoverRating}>
                          <Star size={12} />
                          {item.course.evaluation.primary.score.toFixed(1)} / 5
                          · {item.course.evaluation.primary.instrument}
                        </span>
                      ) : null}
                    </div>
                  </>
                );
                return (
                  <li key={item.key}>
                    {item.course ? (
                      <button
                        className={flow.discoverItem}
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
            </ul>
          )}
          <small className={styles.muted}>
            {text(
              locale,
              "Explore a suggestion to check its latest course details.",
              "打开推荐，查看最新课程详情。",
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

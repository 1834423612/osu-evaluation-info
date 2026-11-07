"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search,
  SlidersHorizontal,
  X,
  ArrowUpRight,
  LoaderCircle,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  SearchX,
} from "lucide-react";
import type {
  CatalogCourse,
  CatalogResponse,
  CatalogFacet,
} from "@/lib/catalog/types";
import { text, localizedCampus, localizedTerm } from "@/lib/i18n";
import { usePreferences } from "@/hooks/use-preferences";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { BrandMascot } from "@/components/brand/brand-mascot";
import { SceneMascot } from "@/components/brand/scene-mascot";
import { brand } from "@/lib/brand";
import brandStyles from "@/components/brand/brand-identity.module.css";
import { FilterPanel } from "./filter-panel";
import { CourseCard } from "./course-card";
import { EnrollmentWatchControl } from "./enrollment-watch-control";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

const PAGE_HISTORY_PARAM = "pageHistory";
const MAX_SAVED_PAGE_CURSORS = 20;

function restorePageState(history: string | null, cursor: string | null) {
  if (history) {
    try {
      const parsed: unknown = JSON.parse(history);
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "page" in parsed &&
        "cursors" in parsed &&
        typeof parsed.page === "number" &&
        Number.isSafeInteger(parsed.page) &&
        parsed.page >= 1 &&
        Array.isArray(parsed.cursors) &&
        parsed.cursors.length > 0 &&
        parsed.cursors.length ===
          Math.min(parsed.page, MAX_SAVED_PAGE_CURSORS) &&
        parsed.cursors.every(
          (value) =>
            value === null ||
            (typeof value === "string" && value.length <= 2048),
        ) &&
        parsed.cursors.at(-1) === cursor
      ) {
        return {
          cursors: parsed.cursors as (string | null)[],
          pageIndex: parsed.page - 1,
        };
      }
    } catch {
      // Ignore stale or malformed client-side pagination history.
    }
  }
  return cursor
    ? { cursors: [cursor], pageIndex: 0 }
    : { cursors: [null], pageIndex: 0 };
}

export function CourseExplorer() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const catalogQuery = (() => {
    const params = new URLSearchParams(query);
    params.delete("course");
    params.delete("detailTab");
    params.delete("ratingSource");
    params.delete("focusSection");
    return params.toString();
  })();
  const {
    locale,
    saved,
    toggleSaved,
    enrollmentWatch,
    enrollmentWatchInterval,
    setEnrollmentWatch,
    setEnrollmentWatchInterval,
  } = usePreferences();
  const [result, setResult] = useState<CatalogResponse | null>(null);
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
  const [storageError, setStorageError] = useState(false);
  const [baseFacets, setBaseFacets] = useState<CatalogFacet[]>([]);
  const inflight = useRef(false);
  const generation = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const skipQueryFetch = useRef<string | null>(null);
  const facetTerm = searchParams.get("term") ?? result?.terms[0]?.code ?? "";

  useEffect(() => {
    if (!facetTerm) return;
    const controller = new AbortController();
    void fetch(
      `/api/catalog/facets?term=${encodeURIComponent(facetTerm)}&campus=all`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          setBaseFacets(data.filters);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [facetTerm]);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(query);
    params.delete("cursor");
    params.delete(PAGE_HISTORY_PARAM);
    if (value) params.set(key, value);
    else params.delete(key);
    window.history.pushState(null, "", `/?${params}`);
  }
  function resetFilters() {
    const params = new URLSearchParams();
    if (searchParams.get("q")) params.set("q", searchParams.get("q")!);
    if (searchParams.get("term")) params.set("term", searchParams.get("term")!);
    window.history.pushState(null, "", `/?${params}`);
  }

  useEffect(() => {
    const controller = new AbortController();
    if (skipQueryFetch.current === catalogQuery) {
      skipQueryFetch.current = null;
      requestController.current?.abort();
      requestController.current = controller;
      return () => controller.abort();
    }
    requestController.current?.abort();
    requestController.current = controller;
    const current = ++generation.current;
    const params = new URLSearchParams(catalogQuery);
    const restoredPage = restorePageState(
      params.get(PAGE_HISTORY_PARAM),
      params.get("cursor"),
    );
    params.delete(PAGE_HISTORY_PARAM);
    inflight.current = false;
    async function load() {
      setLoading(true);
      setError(false);
      setPageIndex(restoredPage.pageIndex);
      setPageCursors(restoredPage.cursors);
      setLoadingMore(false);
      try {
        const response = await fetch(`/api/catalog?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unavailable");
        const data: CatalogResponse = await response.json();
        if (current === generation.current) {
          setResult(data);
          setCourses(data.courses);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
          setCourses([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [catalogQuery, retry]);

  const loadPage = useCallback(
    async (direction: "next" | "previous" | "current") => {
      if (inflight.current || loading) return;
      if (direction === "next" && !result?.nextCursor) return;
      if (direction === "previous" && pageIndex === 0) return;
      inflight.current = true;
      setLoadingMore(true);
      const current = generation.current;
      const params = new URLSearchParams(query);
      params.delete("cursor");
      params.delete(PAGE_HISTORY_PARAM);
      params.delete("course");
      params.delete("detailTab");
      params.delete("ratingSource");
      params.delete("focusSection");
      const targetIndex =
        direction === "next"
          ? pageIndex + 1
          : direction === "previous"
            ? pageIndex - 1
            : pageIndex;
      const historyOffset = pageIndex - (pageCursors.length - 1);
      const targetCursor =
        direction === "next"
          ? (result?.nextCursor ?? null)
          : (pageCursors[targetIndex - historyOffset] ?? null);
      if (targetCursor) params.set("cursor", targetCursor);
      try {
        const response = await fetch(`/api/catalog?${params}`, {
          signal: requestController.current?.signal,
        });
        if (!response.ok) throw new Error("Unavailable");
        const data: CatalogResponse = await response.json();
        if (current !== generation.current) return;
        setResult(data);
        setCourses(data.courses);
        setError(false);
        const switchedToMirror =
          direction !== "current" &&
          data.sourceMode === "mirror" &&
          result?.sourceMode !== "mirror";
        let nextCursors = pageCursors;
        let nextIndex = targetIndex;
        if (switchedToMirror) {
          nextCursors = [null];
          nextIndex = 0;
          setPageCursors(nextCursors);
          setPageIndex(nextIndex);
        } else if (direction === "next") {
          const currentCursorIndex = pageIndex - historyOffset;
          nextCursors = [
            ...pageCursors.slice(0, currentCursorIndex + 1),
            targetCursor,
          ].slice(-MAX_SAVED_PAGE_CURSORS);
          setPageCursors(nextCursors);
          setPageIndex(nextIndex);
        } else if (direction === "previous") {
          const targetCursorIndex = targetIndex - historyOffset;
          nextCursors = pageCursors.slice(0, targetCursorIndex + 1);
          setPageCursors(nextCursors);
          setPageIndex(nextIndex);
        } else {
          setPageIndex(targetIndex);
        }
        if (direction !== "current" || switchedToMirror) {
          const urlParams = new URLSearchParams(query);
          if (switchedToMirror) {
            urlParams.delete("cursor");
            urlParams.delete(PAGE_HISTORY_PARAM);
          } else {
            if (targetCursor) urlParams.set("cursor", targetCursor);
            else urlParams.delete("cursor");
            const pageHistory = {
              page: nextIndex + 1,
              cursors: nextCursors,
            };
            if (pageHistory.cursors.length > 1)
              urlParams.set(PAGE_HISTORY_PARAM, JSON.stringify(pageHistory));
            else urlParams.delete(PAGE_HISTORY_PARAM);
          }
          const nextQuery = urlParams.toString();
          if (nextQuery !== query) {
            const fetchParams = new URLSearchParams(nextQuery);
            fetchParams.delete("course");
            fetchParams.delete("detailTab");
            fetchParams.delete("ratingSource");
            fetchParams.delete("focusSection");
            skipQueryFetch.current = fetchParams.toString();
            window.history.pushState(
              null,
              "",
              nextQuery ? `/?${nextQuery}` : "/",
            );
          }
        }
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      } catch {
        if (
          current === generation.current &&
          !requestController.current?.signal.aborted
        )
          setError(true);
      } finally {
        if (current === generation.current) {
          inflight.current = false;
          setLoadingMore(false);
        }
      }
    },
    [result, query, pageIndex, pageCursors, loading],
  );

  const activeFilters = [...searchParams.entries()].filter(
    ([key]) =>
      ![
        "q",
        "term",
        "sort",
        "cursor",
        PAGE_HISTORY_PARAM,
        "course",
        "detailTab",
        "ratingSource",
        "focusSection",
      ].includes(key),
  );
  const filters = (
    <FilterPanel
      facets={baseFacets.length ? baseFacets : (result?.filters ?? [])}
      params={new URLSearchParams(query)}
      locale={locale}
      onChange={updateParam}
      onReset={resetFilters}
    />
  );
  const selectedTerm = searchParams.get("term") ?? result?.terms[0]?.code ?? "";
  const count = result?.matchedSections ?? result?.totalItems;
  const selectedCampus = searchParams.get("campus") ?? "col";
  const campusLabel =
    searchParams.get("campus") === "all"
      ? text(locale, "All campuses", "所有校区")
      : (result?.courses[0]?.campus ??
        result?.filters
          .find((facet) => facet.slug === "campus")
          ?.items.find((item) => item.value.toLowerCase() === selectedCampus)
          ?.label ??
        localizedCampus(selectedCampus, locale));
  return (
    <>
      <AppHeader />
      <main className="explorer-shell">
        <div className={`page-heading ${brandStyles.hero}`}>
          <div className={brandStyles.heroCopy}>
            <span className={brandStyles.heroEyebrow}>
              {brand.context[locale]}
            </span>
            <h1
              className={brandStyles.slogan}
              lang={locale === "zh" ? "zh-CN" : "en"}
            >
              <span>{brand.slogan[locale][0]}</span>
              {locale === "en" ? " " : null}
              <span>{brand.slogan[locale][1]}</span>
            </h1>
            <p className={brandStyles.heroDescription}>
              {text(
                locale,
                "Explore Ohio State courses, compare schedules, and get to know your professors.",
                "查课程、看课表、了解教授，为下一学期做好准备。",
              )}
            </p>
          </div>
          <div className="term-control">
            <label htmlFor="term-select">
              {text(locale, "ACADEMIC TERM", "开课学期")}
            </label>
            <Select
              value={selectedTerm}
              onValueChange={(value) => updateParam("term", value)}
            >
              <SelectTrigger id="term-select" className="term-select">
                <SelectValue
                  placeholder={text(locale, "Loading terms…", "正在获取学期…")}
                />
              </SelectTrigger>
              <SelectContent>
                {result?.terms.map((term) => (
                  <SelectItem key={term.code} value={term.code}>
                    {localizedTerm(term.label, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <form
          className="search-bar"
          onSubmit={(event) => {
            event.preventDefault();
            const value = String(
              new FormData(event.currentTarget).get("q") ?? "",
            ).trim();
            updateParam("q", value);
          }}
        >
          <Search size={20} />
          <input
            key={searchParams.get("q") ?? ""}
            name="q"
            type="search"
            aria-label={text(locale, "Search courses", "搜索课程")}
            placeholder={text(
              locale,
              "Search a course, subject, or topic…",
              "搜索课程编号、学科或关键词…",
            )}
            defaultValue={searchParams.get("q") ?? ""}
          />
          <span className="search-shortcut">↵</span>
          <Button type="submit">{text(locale, "Search", "搜索")}</Button>
        </form>
        <div className="workspace-layout">
          <aside className="desktop-filters">{filters}</aside>
          <section
            className="results-area"
            aria-label={text(locale, "Course results", "课程结果")}
          >
            <div className="results-toolbar">
              <div className="result-summary">
                <span className="result-count">
                  <strong>
                    {loading
                      ? "…"
                      : (
                          result?.totalCourses ?? courses.length
                        ).toLocaleString()}
                  </strong>
                  <span>
                    {result?.totalCourses === null
                      ? text(locale, "courses on this page", "门课程（本页）")
                      : text(locale, "courses", "门课程")}
                  </span>
                </span>
                <span className="count-divider" />
                <span className="result-count">
                  <strong>
                    {loading ? "…" : (count?.toLocaleString() ?? "—")}
                    {!loading &&
                    result?.capped &&
                    result.matchedSections === null
                      ? "+"
                      : ""}
                  </strong>
                  <span>{text(locale, "class results", "条班次结果")}</span>
                </span>
                <span className="count-divider" />
                <span className="results-campus">{campusLabel}</span>
              </div>
              <div className="result-controls">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      className="mobile-filter-trigger"
                      variant="outline"
                      size="sm"
                    >
                      <SlidersHorizontal data-icon="inline-start" />
                      {text(locale, "Filters", "筛选")}
                      {activeFilters.length ? ` (${activeFilters.length})` : ""}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="mobile-filter-sheet">
                    <SheetHeader>
                      <SheetTitle>
                        {text(locale, "Refine your results", "筛选课程")}
                      </SheetTitle>
                      <SheetDescription>
                        {text(
                          locale,
                          "Changes apply immediately.",
                          "修改后立即更新结果。",
                        )}
                      </SheetDescription>
                    </SheetHeader>
                    <div className="mobile-filter-panel">{filters}</div>
                    <SheetClose asChild>
                      <Button className="mx-5 mb-5">
                        {text(locale, "Show results", "查看结果")}
                      </Button>
                    </SheetClose>
                  </SheetContent>
                </Sheet>
                <label htmlFor="sort-select" className="sr-only">
                  {text(locale, "Sort results", "结果排序")}
                </label>
                <Select
                  value={searchParams.get("sort") ?? "subject"}
                  onValueChange={(value) => updateParam("sort", value)}
                >
                  <SelectTrigger id="sort-select" className="sort-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subject">
                      {text(locale, "Subject A–Z", "学科 A–Z")}
                    </SelectItem>
                    <SelectItem value="-subject">
                      {text(locale, "Subject Z–A", "学科 Z–A")}
                    </SelectItem>
                    <SelectItem value="catalogNumber">
                      {text(locale, "Course number ↑", "课程编号升序")}
                    </SelectItem>
                    <SelectItem value="-catalogNumber">
                      {text(locale, "Course number ↓", "课程编号降序")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <EnrollmentWatchControl
                  enabled={enrollmentWatch}
                  intervalSeconds={enrollmentWatchInterval}
                  locale={locale}
                  onEnabledChange={setEnrollmentWatch}
                  onIntervalChange={setEnrollmentWatchInterval}
                />
              </div>
            </div>
            {activeFilters.length ? (
              <div className="active-filters">
                {activeFilters.map(([key, value]) => (
                  <button key={key} onClick={() => updateParam(key, "")}>
                    {key === "campus" && value === "all"
                      ? text(locale, "All campuses", "所有校区")
                      : key === "campus"
                        ? localizedCampus(value, locale)
                        : (result?.filters
                            .find((facet) => facet.slug === key)
                            ?.items.find((item) => item.value === value)
                            ?.label ?? value)}
                    <X size={12} />
                  </button>
                ))}
                <button onClick={resetFilters} className="clear-filters">
                  {text(locale, "Clear filters", "清除筛选")}
                </button>
              </div>
            ) : null}
            <div className="results-context">
              <span>{text(locale, "CURRENT OFFERINGS", "当前开课信息")}</span>
              <span className="source-status">
                <span className="source-dot" />
                {result?.sourceMode === "mirror"
                  ? `${text(locale, "OSU snapshot", "OSU 快照")} · ${new Date(result.snapshotAt ?? result.fetchedAt).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" })}`
                  : text(locale, "Official OSU data", "OSU 官方数据")}
              </span>
            </div>
            {!loading && result?.capped ? (
              <p className="query-limit-note">
                <CircleAlert size={15} />
                <span>
                  {text(
                    locale,
                    "This official query is limited to 10,000 class results. Select a subject or add filters to see the complete matching set.",
                    "官方接口对此查询最多返回 10,000 条班次。请选择学科或细化筛选，以获取完整匹配结果。",
                  )}
                </span>
              </p>
            ) : null}
            {storageError ? (
              <p role="alert" className="inline-error">
                {text(
                  locale,
                  "Browser storage is unavailable. This course could not be saved.",
                  "浏览器存储不可用，暂时无法收藏。",
                )}
              </p>
            ) : null}
            {loading ? (
              <div
                className="course-list"
                aria-label={text(locale, "Loading courses", "正在加载课程")}
                aria-busy="true"
              >
                <div className="mascot-loading" role="status">
                  <BrandMascot expression="tired-typing" size={64} eager />
                  <span>
                    {text(locale, "Looking up your courses…", "正在查找课程…")}
                  </span>
                </div>
                {[1, 2, 3].map((i) => (
                  <div className="course-skeleton" key={i}>
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-3/5" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-8 w-4/5" />
                  </div>
                ))}
              </div>
            ) : courses.length ? (
              <div className="course-list">
                {courses.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    locale={locale}
                    saved={saved.some((item) => item.id === course.id)}
                    enrollmentWatch={enrollmentWatch}
                    enrollmentWatchInterval={enrollmentWatchInterval}
                    onEnrollmentWatchChange={setEnrollmentWatch}
                    onEnrollmentWatchIntervalChange={setEnrollmentWatchInterval}
                    onSave={(item) => setStorageError(!toggleSaved(item))}
                  />
                ))}
              </div>
            ) : !error ? (
              <div className="empty-results">
                <div className="empty-result-illustration" aria-hidden="true">
                  <SceneMascot scene="no-results" size={128} />
                  <span className="empty-result-line-art">
                    <SearchX size={30} strokeWidth={1.4} />
                  </span>
                </div>
                <h2>
                  {searchParams.get("subject")
                    ? text(
                        locale,
                        `No classes found for ${searchParams.get("subject")}`,
                        `暂未找到 ${searchParams.get("subject")} 科目的课程`,
                      )
                    : text(locale, "No matching classes", "未找到匹配课程")}
                </h2>
                <p>
                  {text(
                    locale,
                    "Try a different course name, or broaden the campus and filter choices.",
                    "换个课程名称试试，或放宽校区与筛选条件。",
                  )}
                </p>
                <Button variant="outline" onClick={resetFilters}>
                  {text(locale, "Reset filters", "重置筛选")}
                </Button>
              </div>
            ) : null}
            {error ? (
              <div className="error-state" role="alert">
                <SceneMascot scene="error" size={64} />
                <div>
                  <strong>
                    {text(
                      locale,
                      "Course data is temporarily unavailable",
                      "课程数据暂时无法获取",
                    )}
                  </strong>
                  <p>
                    {text(
                      locale,
                      "The official source could not be reached. Your search is preserved.",
                      "暂时无法连接官方数据源，你的搜索条件已保留。",
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    courses.length
                      ? void loadPage("current")
                      : setRetry((value) => value + 1)
                  }
                >
                  {text(locale, "Retry", "重试")}
                </Button>
              </div>
            ) : null}
            {!loading && result && courses.length ? (
              <nav
                className="course-pagination"
                aria-label={text(locale, "Course result pages", "课程结果分页")}
              >
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadPage("previous")}
                  disabled={pageCursors.length < 2 || loadingMore}
                >
                  <ChevronLeft data-icon="inline-start" />
                  {text(locale, "Previous", "上一页")}
                </Button>
                <span aria-live="polite">
                  {text(
                    locale,
                    `Page ${pageIndex + 1}`,
                    `第 ${pageIndex + 1} 页`,
                  )}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadPage("next")}
                  disabled={!result.hasMore || loadingMore}
                >
                  {loadingMore ? (
                    <LoaderCircle data-icon="inline-end" className="spin" />
                  ) : (
                    <ChevronRight data-icon="inline-end" />
                  )}
                  {loadingMore
                    ? text(locale, "Loading…", "加载中…")
                    : text(locale, "Next", "下一页")}
                </Button>
              </nav>
            ) : null}
            {!loading && result ? (
              <div className="results-footer">
                <span>
                  {text(
                    locale,
                    result.sourceMode === "mirror"
                      ? "Complete synced catalog · Counted by distinct class section. Filter counts come from the live official index and may include duplicates."
                      : "Official search hit counts · Results are grouped by course; official duplicate hits can affect counts.",
                    result.sourceMode === "mirror"
                      ? "完整同步目录 · 结果按独立班次计数；筛选项数量来自官方实时索引，可能包含重复命中。"
                      : "官方搜索命中数量 · 列表已按课程归类，官方重复命中可能影响计数。",
                  )}
                </span>
                <a href={result.source} target="_blank" rel="noreferrer">
                  {text(locale, "Official search", "官方搜索")}
                  <ArrowUpRight size={12} />
                </a>
                <span>
                  {result.sourceMode === "mirror"
                    ? text(locale, "Synced", "同步于")
                    : text(locale, "Fetched", "获取于")}{" "}
                  {new Date(result.fetchedAt).toLocaleString(
                    locale === "zh" ? "zh-CN" : "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}
                </span>
              </div>
            ) : null}
          </section>
        </div>
      </main>
      <AppFooter />
    </>
  );
}

"use client";
import { SearchField } from "@/components/ui/search-field";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, Info } from "lucide-react";
import { searchCatalogWithRelated } from "@/lib/catalog/search-client";
import { CourseSearchHelp } from "@/components/catalog/course-search-help";
import type { CatalogCourse } from "@/lib/catalog/types";
import { creditLabel } from "@/lib/planning/course-catalog";
import { text, type Locale } from "@/lib/i18n";
import { requirementSearch } from "@/lib/planning/requirement-search";
import { usePlanningCatalog } from "./course-catalog";
import styles from "./semester-board.module.css";

type PlanningSearchProps = {
  locale: Locale;
  unavailable?: string[];
  initialQuery?: string;
  requirementLabel?: string;
  inspect: (code: { subject: string; number: string }) => void;
  add: (code: { subject: string; number: string }) => void;
};

export function PlanningSearch(props: PlanningSearchProps) {
  const context = usePlanningCatalog();
  const [query, setQuery] = useState(
    requirementSearch(props.initialQuery ?? "")
      ? ""
      : (props.initialQuery ?? ""),
  );
  return (
    <ScopedPlanningSearch
      {...props}
      key={context.campus + "|" + context.term}
      query={query}
      setQuery={setQuery}
    />
  );
}

function ScopedPlanningSearch({
  locale,
  inspect,
  add,
  initialQuery = "",
  requirementLabel,
  unavailable = [],
  query,
  setQuery,
}: PlanningSearchProps & {
  query: string;
  setQuery: (query: string) => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const context = usePlanningCatalog();
  const [scoped, setScoped] = useState(Boolean(initialQuery));
  const category = scoped ? requirementSearch(initialQuery) : null;
  const [results, setResults] = useState<CatalogCourse[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (query.trim() || category) void search();
    return () => request.current?.abort();
    // Each catalog scope remounts results and retries the preserved query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function search() {
    if (!query.trim() && !category) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setMessage("");
    setResults([]);
    try {
      const data = await searchCatalogWithRelated(
        "/api/catalog?" +
          new URLSearchParams({
            q: query.trim(),
            term: context.term,
            campus: context.campus.toLowerCase(),
            limit: "12",
            ...(category ? { "gen-categories": category } : {}),
          }),
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setResults(data.courses ?? []);
        if (!data.courses?.length)
          setMessage(
            t(
              "No courses found for this catalog selection.",
              "当前目录条件下未找到课程。",
            ),
          );
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : t(
                "Search unavailable. Try a full course code or retry.",
                "查询暂不可用，请尝试完整课号或重试。",
              ),
        );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  return (
    <div className={styles.searchPanel} data-analytics-area="planning_search">
      {scoped && (
        <nav
          aria-label={t("Search path", "搜索路径")}
          className={styles.searchBreadcrumbs}
        >
          <button
            type="button"
            onClick={() => {
              request.current?.abort();
              setScoped(false);
              setQuery("");
              setResults([]);
              setMessage("");
              setSearching(false);
            }}
          >
            {t("All courses", "全部课程搜索")}
          </button>
          <span aria-hidden="true">/</span>
          <span aria-current="page">
            {requirementLabel || category || initialQuery}
          </span>
        </nav>
      )}
      {requirementLabel && scoped && (
        <p className={styles.requirementFilter}>
          {t("Replacing requirement", "替换要求占位项")} · {requirementLabel}
        </p>
      )}
      {category && <p className={styles.requirementFilter}>{category}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <Search size={16} aria-hidden="true" />
        <SearchField
          aria-label={t("Course code or keyword", "课号或关键词")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="CSE 2221"
          maxLength={120}
        />
        <button data-analytics-action="planning_search" disabled={searching}>
          {t("Search", "搜索")}
        </button>
      </form>
      <CourseSearchHelp locale={locale} />
      <p role="status">
        {searching ? t("Searching catalog…", "正在查询目录…") : message}
      </p>
      {results.map((c) => (
        <article key={c.id} className={styles.searchResult}>
          <button
            className={styles.resultTitle}
            onClick={() =>
              inspect({ subject: c.subject, number: c.catalogNumber })
            }
          >
            <strong>
              {c.subject} {c.catalogNumber}{" "}
              <Info size={12} aria-hidden="true" />
            </strong>
            <span>{c.title}</span>
          </button>
          <div>
            <span>
              {creditLabel({ min: c.creditsMin, max: c.creditsMax })}{" "}
              {t("credits", "学分")}
            </span>
            <button
              data-analytics-action="planning_course_add"
              disabled={unavailable.includes(`${c.subject} ${c.catalogNumber}`)}
              aria-label={`${t("Add", "添加")} ${c.subject} ${c.catalogNumber}`}
              onClick={() =>
                add({ subject: c.subject, number: c.catalogNumber })
              }
            >
              <Plus size={16} />
              {unavailable.includes(`${c.subject} ${c.catalogNumber}`)
                ? t("On record", "已有修读记录")
                : t("Add", "添加")}
            </button>
          </div>
        </article>
      ))}
      {!results.length && !searching && (
        <p className={styles.helper}>
          {t(
            "Search by prefix, course number or title. Select a result for prerequisites and course details.",
            "可搜索课程前缀、课号或名称。选择结果可查看先修与课程详情。",
          )}
        </p>
      )}
    </div>
  );
}

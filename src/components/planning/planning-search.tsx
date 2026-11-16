"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Search } from "lucide-react";
import { fetchCatalogResource } from "@/lib/catalog/browser-transport";
import type { CatalogCourse } from "@/lib/catalog/types";
import { creditLabel } from "@/lib/planning/course-catalog";
import { text, type Locale } from "@/lib/i18n";
import { usePlanningCatalog } from "./course-catalog";
import styles from "./semester-board.module.css";

export function PlanningSearch({
  locale,
  inspect,
  add,
}: {
  locale: Locale;
  inspect: (code: { subject: string; number: string }) => void;
  add: (code: { subject: string; number: string }) => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const context = usePlanningCatalog();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogCourse[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => request.current?.abort(),
    [context.campus, context.term],
  );
  async function search() {
    if (!query.trim()) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setMessage("");
    setResults([]);
    try {
      const response = await fetchCatalogResource(
        "/api/catalog?" +
          new URLSearchParams({
            q: query.trim(),
            term: context.term,
            campus: context.campus.toLowerCase(),
            limit: "12",
            exactPreview: "1",
          }),
        { signal: controller.signal },
      );
      if (!response.ok) throw Error();
      const data = await response.json();
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
    } catch {
      if (!controller.signal.aborted)
        setMessage(
          t(
            "Search unavailable. Try a full course code or retry.",
            "查询暂不可用，请尝试完整课号或重试。",
          ),
        );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }
  return (
    <div className={styles.searchPanel}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <label>
          {t("Course code or keyword", "课号或关键词")}
          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="CSE 2221"
              maxLength={120}
            />
            <button
              disabled={searching}
              aria-label={t("Search courses", "搜索课程")}
            >
              <Search size={17} />
            </button>
          </div>
        </label>
      </form>
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
              {c.subject} {c.catalogNumber}
            </strong>
            <span>{c.title}</span>
          </button>
          <div>
            <span>
              {creditLabel({ min: c.creditsMin, max: c.creditsMax })}{" "}
              {t("credits", "学分")}
            </span>
            <button
              aria-label={`${t("Add", "添加")} ${c.subject} ${c.catalogNumber}`}
              onClick={() =>
                add({ subject: c.subject, number: c.catalogNumber })
              }
            >
              <Plus size={16} />
              {t("Add", "添加")}
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

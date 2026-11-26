"use client";
import { SearchField } from "@/components/ui/search-field";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import subjectVocabulary from "../../../data/planning/subjects.json";
import { sampleReferenceReader } from "@/lib/planning/public-samples";
import type { CatalogCourse } from "@/lib/catalog/types";
import { readRequirementCourses } from "@/lib/planning/requirement-catalog";
import { requirementCatalogFilter } from "@/lib/planning/requirement-search";
import { fetchCatalogResource } from "@/lib/catalog/browser-transport";
import { text, type Locale } from "@/lib/i18n";
import { usePlanningCatalog } from "./course-catalog";
import styles from "./requirement-choices.module.css";
const subjectReference = sampleReferenceReader(subjectVocabulary.subjects);
export function RequirementChoices({
  title,
  locale,
  unavailable,
  add,
  inspect,
  relatedSubjects = [],
}: {
  title: string;
  relatedSubjects?: string[];
  locale: Locale;
  unavailable: string[];
  add: (code: { subject: string; number: string }) => void;
  inspect?: (code: { subject: string; number: string }) => void;
}) {
  const context = usePlanningCatalog();
  const [chosenSubject, setSubject] = useState("");
  const [browseAll, setBrowseAll] = useState(false),
    [subjectQuery, setSubjectQuery] = useState("");
  const suggestions = [
    ...new Set(
      relatedSubjects.flatMap((value) =>
        subjectReference(`${value} 1000`).map((code) => code.subject),
      ),
    ),
  ].slice(0, 12);
  const category = "";
  const mapped = !!requirementCatalogFilter(title);
  const subject = mapped ? "" : chosenSubject || suggestions[0] || "";
  const anchor = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    courses: CatalogCourse[];
    cursor: string | null;
    loading: boolean;
    error: boolean;
    mapped: boolean;
  } | null>(null);
  const key = [title, context.campus, context.term, subject, category].join(
    "|",
  );
  const current = state?.key === key ? state : null;
  const request = useRef<AbortController | null>(null);
  const t = (en: string, zh: string) => text(locale, en, zh);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    });
    if (anchor.current) observer.observe(anchor.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    request.current = controller;
    readRequirementCourses(
      title,
      context,
      fetchCatalogResource,
      controller.signal,
      undefined,
      { subject, category },
    )
      .then((data) => {
        if (!controller.signal.aborted)
          setState({
            key,
            courses: data.courses,
            cursor: data.nextCursor,
            mapped: data.mapped,
            loading: false,
            error: false,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({
            key,
            courses: [],
            cursor: null,
            mapped: true,
            loading: false,
            error: true,
          });
      });
    return () => controller.abort();
  }, [visible, key, title, context, attempt, subject, category]);
  async function more() {
    if (!current?.cursor || current.loading) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setState({ ...current, loading: true });
    try {
      const data = await readRequirementCourses(
        title,
        context,
        fetchCatalogResource,
        controller.signal,
        current.cursor,
        { subject, category },
      );
      if (!controller.signal.aborted)
        setState({
          ...current,
          courses: [
            ...new Map(
              [...current.courses, ...data.courses].map((c) => [c.id, c]),
            ).values(),
          ],
          cursor: data.nextCursor,
          loading: false,
          error: false,
        });
    } catch {
      if (!controller.signal.aborted)
        setState({ ...current, loading: false, error: true });
    }
  }
  useEffect(() => () => request.current?.abort(), []);
  return (
    <div ref={anchor} className={styles.list}>
      {!mapped && (
        <div className={styles.browse}>
          <strong>{t("Related program subjects", "专业相关科目")}</strong>
          <div className={styles.subjects}>
            {suggestions.map((value) => (
              <button
                key={value}
                aria-pressed={subject === value}
                onClick={() => setSubject(value)}
              >
                {value}
              </button>
            ))}
            {!!suggestions.length && (
              <button
                aria-expanded={browseAll}
                onClick={() => setBrowseAll(!browseAll)}
              >
                {t("Other subjects", "其他科目")}
              </button>
            )}
          </div>
          {(!suggestions.length || browseAll) && (
            <>
              <SearchField
                className={styles.subjectQuery}
                aria-label={t("Find a catalog subject", "查找目录科目")}
                placeholder={t("Subject code or name", "科目代码或名称")}
                value={subjectQuery}
                onChange={(event) => setSubjectQuery(event.target.value)}
              />
              <div className={styles.subjects}>
                {subjectVocabulary.subjects
                  .filter((row) =>
                    `${row.code} ${row.title}`
                      .toLowerCase()
                      .includes(subjectQuery.trim().toLowerCase()),
                  )
                  .slice(0, 12)
                  .map((row) => (
                    <button
                      key={row.code}
                      title={row.title}
                      aria-pressed={subject === row.code}
                      onClick={() => setSubject(row.code)}
                    >
                      {row.code}
                    </button>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
      {current?.courses.map((c) => {
        const code = { subject: c.subject, number: c.catalogNumber },
          id = `${c.subject} ${c.catalogNumber}`;
        return (
          <div key={c.id} className={styles.row}>
            <button
              className={styles.course}
              disabled={!inspect}
              onClick={() => inspect?.(code)}
            >
              <b>
                {id} <span aria-hidden="true">↗</span>
              </b>
              <span>{c.title}</span>
            </button>
            <small>
              {c.creditsMin}
              {c.creditsMax !== c.creditsMin ? `–${c.creditsMax}` : ""}{" "}
              {t("credits", "学分")}
            </small>
            <button
              className={styles.add}
              disabled={unavailable.includes(id)}
              onClick={() => add(code)}
              aria-label={`${t("Add", "添加")} ${id}`}
            >
              <Plus size={15} />
            </button>
          </div>
        );
      })}
      {visible && !current && (
        <p role="status">
          {mapped
            ? t("Loading eligible courses…", "正在加载符合此项要求的课程…")
            : t("Loading related courses…", "正在加载专业相关课程…")}
        </p>
      )}
      {current?.error && (
        <button
          onClick={() =>
            current.cursor ? void more() : setAttempt((n) => n + 1)
          }
        >
          {t("Retry course list", "重试课程列表")}
        </button>
      )}
      {current && !current.error && !current.courses.length && (
        <p className={styles.ruleNote}>
          {current.mapped
            ? t(
                "No matching classes in this campus and catalog term.",
                "此校区和目录学期暂无符合该要求的课程。",
              )
            : t(
                "No related courses in this campus and term.",
                "此校区与学期暂无相关课程。",
              )}
        </p>
      )}
      {current?.cursor && (
        <button disabled={current.loading} onClick={() => void more()}>
          {current.loading
            ? t("Loading…", "加载中…")
            : mapped
              ? t("More eligible courses", "更多符合要求的课程")
              : t("More related courses", "更多专业相关课程")}
        </button>
      )}
    </div>
  );
}

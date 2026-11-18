"use client";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { CatalogCourse } from "@/lib/catalog/types";
import { readRequirementCourses } from "@/lib/planning/requirement-catalog";
import { requirementSearch } from "@/lib/planning/requirement-search";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { fetchCatalogResource } from "@/lib/catalog/browser-transport";
import { text, type Locale } from "@/lib/i18n";
import { usePlanningCatalog } from "./course-catalog";
import styles from "./requirement-choices.module.css";
export function RequirementChoices({
  title,
  locale,
  unavailable,
  add,
  inspect,
}: {
  title: string;
  locale: Locale;
  unavailable: string[];
  add: (code: { subject: string; number: string }) => void;
  inspect?: (code: { subject: string; number: string }) => void;
}) {
  const context = usePlanningCatalog();
  const [subject, setSubject] = useState(""),
    [category, setCategory] = useState("");
  const [vocabulary, setVocabulary] = useState<
    { slug: string; items: { value: string; label: string }[] }[]
  >([]);
  const mapped = !!requirementSearch(title);
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
    if (!visible || mapped) return;
    const controller = new AbortController();
    Promise.allSettled([
      fetchCatalogResource(
        "/api/catalog/facets?" +
          new URLSearchParams({
            term: context.term,
            campus: context.campus.toLowerCase(),
          }),
        { signal: controller.signal },
      ).then((response) => (response.ok ? response.json() : Promise.reject())),
      fetch("/api/catalog/subjects?term=" + context.term, {
        signal: controller.signal,
      }).then((response) => (response.ok ? response.json() : Promise.reject())),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const filters = results.flatMap((result) =>
        result.status === "fulfilled" ? (result.value.filters ?? []) : [],
      );
      setVocabulary([
        ...new Map(
          filters.map(
            (filter: {
              slug: string;
              items: { value: string; label: string }[];
            }) => [filter.slug, filter],
          ),
        ).values(),
      ] as typeof vocabulary);
    });
    return () => controller.abort();
  }, [visible, mapped, context]);
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
          <p>
            {t(
              "Browse the official catalog; confirm applicability against this requirement.",
              "直接浏览官方目录，课程是否适用以此项要求原文为准。",
            )}
          </p>
          <ChoiceSelect
            aria-label={t("Course category", "课程类别")}
            value={category}
            onValueChange={setCategory}
          >
            <option value="">
              {t("All academic categories", "全部学业类别")}
            </option>
            {vocabulary
              .find((filter) => filter.slug === "gen-categories")
              ?.items.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
          </ChoiceSelect>
          <ChoiceSelect
            aria-label={t("Subject", "科目")}
            value={subject}
            onValueChange={setSubject}
          >
            <option value="">{t("Choose a subject", "选择科目")}</option>
            {vocabulary
              .find((filter) => filter.slug === "subject")
              ?.items.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value} · {item.label}
                </option>
              ))}
          </ChoiceSelect>
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
          {t("Loading eligible courses…", "正在加载符合此项要求的课程…")}
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
                "Choose a catalog category or subject above.",
                "选择上方课程类别或科目，即可列出课程。",
              )}
        </p>
      )}
      {current?.cursor && (
        <button disabled={current.loading} onClick={() => void more()}>
          {current.loading
            ? t("Loading…", "加载中…")
            : t("More eligible courses", "更多符合要求的课程")}
        </button>
      )}
    </div>
  );
}

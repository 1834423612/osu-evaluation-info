"use client";
import {
  ArrowLeft,
  ArrowUpRight,
  Plus,
  RefreshCw,
  GitBranch,
} from "lucide-react";
import subjectVocabulary from "../../../data/planning/subjects.json";
import type { Plan } from "@/lib/planning/model";
import {
  prerequisiteText,
  prerequisiteReferences,
  creditLabel,
  planningCredits,
} from "@/lib/planning/course-catalog";
import { CourseStatus } from "./course-status";
import { boardCourses } from "@/lib/planning/workspace";
import { usePlanningCourse } from "./course-catalog";
import { text, type Locale } from "@/lib/i18n";
import styles from "./semester-board.module.css";

export function CourseInspector({
  code,
  plan,
  locale,
  back,
  add,
  inspect,
}: {
  code: { subject: string; number: string };
  plan: Plan;
  locale: Locale;
  back: () => void;
  add: (code: { subject: string; number: string }) => void;
  inspect: (code: { subject: string; number: string }) => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const lookup = usePlanningCourse(code.subject, code.number);
  const course = lookup.detail?.course;
  const prereq = course ? prerequisiteText(course.description) : null;
  const overview = prereq
    ? course?.description.slice(0, course.description.indexOf(prereq)).trim()
    : course?.description;
  const references = prerequisiteReferences(
    prereq ?? "",
    code.subject,
    subjectVocabulary.subjects,
  );
  const observations = plan.semesters
    .flatMap((s) => s.courses)
    .filter(
      (c) =>
        c.subject === code.subject &&
        c.number === code.number &&
        c.evidenceRole !== "option",
    );
  const rating = course?.evaluation?.primary;
  return (
    <div className={styles.inspector}>
      <button onClick={back} className={styles.back}>
        <ArrowLeft size={15} />
        {t("Back to choices", "返回选课")}
      </button>
      <div className={styles.detailCode}>
        {code.subject} {code.number}
      </div>
      <h3>
        {course?.title ??
          (lookup.status === "loading"
            ? t("Loading course…", "正在查询课程…")
            : t("Course details unavailable", "课程详情暂不可用"))}
      </h3>
      {course && (
        <p className={styles.detailFacts}>
          {creditLabel(
            planningCredits({ kind: "course", credits: null }, lookup.detail)
              .range,
          )}{" "}
          {t("credits", "学分")}
          <span>
            {course.term} · {course.campus}
          </span>
          {rating && (
            <span>
              {rating.instrument} {rating.score?.toFixed(2)} / 5
            </span>
          )}
        </p>
      )}
      {lookup.status === "error" && (
        <button onClick={lookup.retry}>
          <RefreshCw size={14} />
          {t("Retry details", "重试查询")}
        </button>
      )}
      {overview && <p className={styles.description}>{overview}</p>}
      <section className={styles.prerequisites}>
        <h4>
          <GitBranch size={16} />
          {t("Prerequisites & restrictions", "先修与选课条件")}
        </h4>
        <p>
          {prereq ??
            t(
              "Check the course catalog for the applicable prerequisite wording.",
              "请在课程目录核对适用的先修条件。",
            )}
        </p>
        {references.length > 0 && (
          <ul>
            {references.map((c) => {
              const recorded = boardCourses(plan).filter(
                (row) =>
                  row.course.subject === c.subject &&
                  row.course.number === c.number,
              );
              const status = [
                "completed",
                "in-progress",
                "planned",
                "withdrawn",
                "dropped",
                "failed",
                "unknown",
              ].find((status) =>
                recorded.some((row) => row.course.status === status),
              ) as
                | Plan["semesters"][number]["courses"][number]["status"]
                | undefined;

              return (
                <li key={c.subject + c.number}>
                  <button onClick={() => inspect(c)}>
                    {c.subject} {c.number}
                  </button>
                  <CourseStatus
                    status={status ?? "remaining"}
                    locale={locale}
                  />
                </li>
              );
            })}
          </ul>
        )}
        {references.length > 0 && (
          <small>
            {t(
              "Follow the full wording above for alternatives, concurrent study and minimum grades.",
              "替代条件、同时修读和最低成绩请按上方完整原文核对。",
            )}
          </small>
        )}
      </section>
      {observations.length > 0 && (
        <details>
          <summary>
            {t("Imported observations", "导入记录")} · {observations.length}
          </summary>
          {observations.map((c, index) => (
            <p key={c.id ?? index}>
              {t("Source", "来源")}{" "}
              {plan.documents.findIndex((d) => d.id === c.documentId) + 1} ·{" "}
              {t("Original credits", "原始学分")} {c.credits ?? "—"} ·{" "}
              <CourseStatus status={c.status} locale={locale} />
            </p>
          ))}
        </details>
      )}
      {lookup.detail && (
        <small>
          {lookup.detail.sourceMode === "mirror"
            ? t("Catalog snapshot", "目录快照")
            : t("Official catalog", "官方目录")}
          {lookup.detail.fetchedAt
            ? " · " + lookup.detail.fetchedAt.slice(0, 10)
            : ""}
        </small>
      )}
      <div className={styles.detailActions}>
        <button
          className={styles.primary}
          disabled={observations.some(
            (c) => c.status === "completed" || c.status === "in-progress",
          )}
          onClick={() => add(code)}
        >
          <Plus size={16} />
          {t("Add to selected semester", "加入所选学期")}
        </button>
        <a
          href={
            "/?" + new URLSearchParams({ q: `${code.subject} ${code.number}` })
          }
          target="_blank"
          rel="noreferrer"
        >
          {t("Sections & evaluations", "班次与评价")}
          <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}

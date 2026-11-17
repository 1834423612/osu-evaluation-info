"use client";
import { useState } from "react";
import { Plus, X, Layers, Check } from "lucide-react";
import type { Plan } from "@/lib/planning/model";
import {
  actionableRequirements,
  requirementCoverage,
  createAlternativeGroup,
  moveCourseGroup,
} from "@/lib/planning/groups";
import { planningPrograms } from "@/lib/planning/programs";
import { boardCourses, semesterLabel } from "@/lib/planning/workspace";
import { browserUuid } from "@/lib/uuid";
import { text, type Locale } from "@/lib/i18n";
import { ChoiceSelect } from "@/components/ui/choice-select";
import styles from "./course-groups.module.css";
type Props = {
  plan: Plan;
  locale: Locale;
  choose: (id: string, term?: string) => void;
};
export function PendingRequirements({ plan, locale, choose }: Props) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const pending = actionableRequirements(plan).filter(
    (r) =>
      !requirementCoverage(plan, r.id).fulfilled &&
      !plan.schedule.groups?.some((g) => g.requirementId === r.id),
  );
  if (!pending.length) return null;
  return (
    <section className={styles.pending} data-analytics-area="planning_pending">
      <h3>
        <Layers size={17} />
        {t("Requirements to arrange", "待安排的学业要求")}
        <span>{pending.length}</span>
      </h3>
      {planningPrograms(plan).map((p) => {
        const rules = pending.filter((r) => r.programId === p.id);
        return rules.length ? (
          <details key={p.id}>
            <summary>
              {p.title ?? p.code}
              <span>{rules.length}</span>
            </summary>
            <div className={styles.grid}>
              {rules.map((r) => {
                const coverage = requirementCoverage(plan, r.id);
                return (
                  <button
                    className={styles.requirement}
                    key={r.id}
                    onClick={() => choose(r.id)}
                  >
                    <strong>
                      {r.title?.split(/\s+[–—-]\s+Choose/i)[0] ??
                        r.alternatives
                          .map((c) => `${c.subject} ${c.number}`)
                          .join(" / ")}
                    </strong>
                    <small>
                      {r.kind === "any" &&
                      plan.requirements.some((child) => child.parentId === r.id)
                        ? t("Choose one course pathway", "选择一组课程方案")
                        : coverage.minimumCourses > 0 &&
                          `${coverage.count}/${coverage.minimumCourses} ${t("courses", "门课程")}`}
                      {coverage.minimumCredits > 0 &&
                        `${coverage.minimumCourses > 0 ? " · " : ""}${coverage.credits}/${coverage.minimumCredits} ${t("credits", "学分")}`}
                    </small>
                    <span>
                      <Plus size={12} />
                      {t("Choose courses", "选择课程")}
                    </span>
                  </button>
                );
              })}
            </div>
          </details>
        ) : null;
      })}
    </section>
  );
}
export function SemesterGroups({
  plan,
  term,
  terms,
  locale,
  choose,
  update,
}: {
  term: string;
  terms: string[];
  update: (fn: (p: Plan) => Plan) => void;
} & Props) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState("");
  const courses = plan.semesters.flatMap((s) => s.courses);
  const groups = plan.schedule.groups ?? [];
  const used = new Set(groups.flatMap((g) => g.courseIds));
  const placed = new Set(
    boardCourses(plan)
      .filter((row) => row.term === term)
      .map((row) => row.course.id),
  );
  const eligible = courses.filter(
    (c) =>
      c.id &&
      placed.has(c.id) &&
      c.kind === "course" &&
      c.status === "planned" &&
      !used.has(c.id),
  );
  const candidates = [
    ...new Map(eligible.map((c) => [`${c.subject} ${c.number}`, c])).values(),
  ];
  return (
    <div className={styles.groups} data-analytics-area="planning_groups">
      {groups
        .filter((g) => (g.term?.replace(/ /g, "") ?? "unassigned") === term)
        .map((g) => {
          const coverage = g.requirementId
            ? requirementCoverage(plan, g.requirementId)
            : null;
          return (
            <article
              key={g.id}
              className={styles.group}
              data-kind={g.kind}
              data-filled={coverage?.fulfilled ?? Boolean(g.selectedCourseId)}
            >
              <header>
                <strong>
                  {g.kind === "alternatives"
                    ? t("Choose one alternative", "备选课程 · 多选一")
                    : g.title}
                </strong>
                <button
                  aria-label={t("Remove group", "移除分组")}
                  onClick={() =>
                    update((p) => ({
                      ...p,
                      schedule: {
                        ...p.schedule,
                        groups: p.schedule.groups?.filter(
                          (row) => row.id !== g.id,
                        ),
                      },
                    }))
                  }
                >
                  <X size={13} />
                </button>
              </header>
              {coverage && (
                <small>
                  {coverage.minimumCourses > 0 &&
                    `${coverage.count}/${coverage.minimumCourses} ${t("courses", "门课程")}`}
                  {coverage.minimumCredits > 0 &&
                    `${coverage.minimumCourses > 0 ? " · " : ""}${coverage.credits}/${coverage.minimumCredits} ${t("credits", "学分")}`}
                  {coverage.fulfilled && <Check size={13} />}
                </small>
              )}
              <div>
                {g.courseIds.map((id) => {
                  const c = courses.find((c) => c.id === id);
                  if (!c) return null;
                  return g.kind === "alternatives" ? (
                    <button
                      key={id}
                      aria-pressed={g.selectedCourseId === id}
                      onClick={() =>
                        update((p) => ({
                          ...p,
                          schedule: {
                            ...p.schedule,
                            groups: p.schedule.groups?.map((row) =>
                              row.id === g.id
                                ? {
                                    ...row,
                                    selectedCourseId:
                                      row.selectedCourseId === id ? null : id,
                                  }
                                : row,
                            ),
                          },
                        }))
                      }
                    >
                      {g.selectedCourseId === id && <Check size={12} />}{" "}
                      {c.subject} {c.number}
                    </button>
                  ) : (
                    <span key={id}>
                      {c.subject} {c.number}
                    </span>
                  );
                })}
              </div>
              {g.requirementId && !coverage?.fulfilled && (
                <button onClick={() => choose(g.requirementId!, term)}>
                  <Plus size={13} />
                  {t("Add another course", "继续选择课程")}
                </button>
              )}
              <ChoiceSelect
                aria-label={t("Move group to semester", "移动分组学期")}
                value={term}
                onValueChange={(value) =>
                  update((p) =>
                    moveCourseGroup(
                      p,
                      g.id,
                      value === "unassigned" ? null : value,
                    ),
                  )
                }
              >
                <option value="unassigned">{t("To arrange", "待安排")}</option>
                {terms.map((value) => (
                  <option key={value} value={value}>
                    {semesterLabel(value, locale)}
                  </option>
                ))}
              </ChoiceSelect>
            </article>
          );
        })}
      {term !== "unassigned" && candidates.length > 1 && (
        <details className={styles.create}>
          <summary>
            <Plus size={13} />
            {t("Alternative course group", "备选课程组")}
          </summary>
          <div>
            {candidates.map((c) => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.id!)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked
                        ? [...ids, c.id!]
                        : ids.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.subject} {c.number}
              </label>
            ))}
          </div>
          <button
            disabled={selected.length < 2}
            onClick={() => {
              try {
                const next = createAlternativeGroup(
                  plan,
                  selected,
                  term,
                  browserUuid,
                );
                update(() => next);
                setSelected([]);
                setError("");
              } catch {
                setError(
                  t(
                    "Choose at least two available planned courses.",
                    "请选择至少两门未分组的计划课程。",
                  ),
                );
              }
            }}
          >
            {t("Create group", "创建备选组")}
          </button>
          <p role="status">{error}</p>
        </details>
      )}
    </div>
  );
}

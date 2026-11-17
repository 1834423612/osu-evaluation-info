"use client";
import { useState } from "react";
import { Check, Clock3, CircleDashed, Plus, GitBranch } from "lucide-react";
import type { Plan } from "@/lib/planning/model";
import { requirementProgress } from "@/lib/planning/snapshots";
import { boardCourses } from "@/lib/planning/workspace";
import { text, type Locale } from "@/lib/i18n";
import styles from "./requirement-map.module.css";
export function RequirementMap({
  plan,
  locale,
  addCourse,
  onReview,
  inspectCourse,
  searchRequirement,
  compact = false,
  remainingOnly = false,
}: {
  plan: Plan;
  locale: Locale;
  addCourse: (c: { subject: string; number: string }) => void;
  onReview: () => void;
  inspectCourse?: (c: { subject: string; number: string }) => void;
  searchRequirement?: (title: string) => void;
  compact?: boolean;
  remainingOnly?: boolean;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [selected, setSelected] = useState("");
  const [selectedMode, setMode] = useState<
    "official" | "planned" | "unknown" | null
  >(null);
  const mode =
    selectedMode ??
    (["planned", "official", "unknown"] as const).find((m) =>
      plan.documents.some(
        (d) =>
          d.auditMode === m &&
          plan.requirements.some((r) => r.documentId === d.id),
      ),
    ) ??
    "official";
  const [remaining, setRemaining] = useState(remainingOnly);
  const documents = new Map(plan.documents.map((d) => [d.id, d]));
  const programs = Array.from(
    new Map(
      plan.programs
        .filter(
          (p) =>
            plan.requirements.some((r) => r.programId === p.id) &&
            documents.get(p.documentId)?.auditMode === mode,
        )
        .map((p) => [p.code ?? p.title ?? p.id, p]),
    ).values(),
  );
  const program = programs.find((p) => p.id === selected) ?? programs[0];
  const rules = plan.requirements.filter((r) => r.programId === program?.id);
  const roster = boardCourses(plan),
    facts = new Map(
      roster
        .filter((r) => r.course.subject)
        .map((r) => [`${r.course.subject} ${r.course.number}`, r.course]),
    );
  function branch(parentId: string | null, depth = 0): React.ReactNode {
    if (depth > 24) return null;
    return rules
      .filter((r) => r.parentId === parentId)
      .map((r) => {
        const progress = requirementProgress(plan, r.id);
        if (remaining && progress.state === "satisfied") return null;
        const status =
          r.reportedStatus ??
          (
            {
              satisfied: "completed",
              planned: "planned",
              insufficient: "remaining",
              unresolved: "remaining",
            } as const
          )[progress.state];
        const Icon =
          status === "completed"
            ? Check
            : status === "in-progress" || status === "planned"
              ? Clock3
              : CircleDashed;
        const label = {
          completed: t("Completed", "已完成"),
          "in-progress": t("In progress", "正在修读"),
          planned: t("Planned", "已安排"),
          remaining: t("Remaining", "待完成"),
        }[status];
        const children = rules.filter((c) => c.parentId === r.id);
        const constraint =
          r.kind === "all"
            ? t("fulfill all", "全部满足")
            : r.kind === "any"
              ? t("fulfill any", "满足任一")
              : r.minimumCredits !== null
                ? `${r.minimumCredits} ${t("credits minimum", "最低学分")}`
                : r.minimumCourses !== null
                  ? `${r.minimumCourses} ${t("course(s)", "门课程")}`
                  : "";
        return (
          <li key={r.id}>
            <details
              className={styles.node}
              open={depth < 1}
              data-state={progress.state}
            >
              <summary>
                <span className={styles.icon}>
                  <Icon size={18} />
                </span>
                <span className={styles.nodeTitle}>
                  <strong>
                    {r.title ??
                      (r.alternatives.length
                        ? r.alternatives
                            .map((c) => `${c.subject} ${c.number}`)
                            .join(" / ")
                        : t("Degree requirement", "学业要求"))}
                  </strong>
                  {constraint && <span>{constraint}</span>}
                </span>
                <span className={styles.state}>{label}</span>
              </summary>
              {!!r.alternatives.length && (
                <div className={styles.courseRows}>
                  {r.alternatives.map((c) => {
                    const key = `${c.subject} ${c.number}`,
                      fact = facts.get(key),
                      locked =
                        fact?.status === "completed" ||
                        fact?.status === "in-progress";
                    return (
                      <div className={styles.courseRow} key={key}>
                        <span
                          className={styles.courseStatus}
                          data-status={fact?.status}
                        >
                          {fact?.status === "completed" ? (
                            <Check size={16} />
                          ) : fact?.status === "in-progress" ? (
                            <Clock3 size={16} />
                          ) : (
                            <CircleDashed size={16} />
                          )}
                        </span>
                        <button
                          onClick={() => inspectCourse?.(c)}
                          disabled={!inspectCourse}
                        >
                          <b>{key}</b>
                          {fact?.title && <span>{fact.title}</span>}
                        </button>
                        {locked ? (
                          <small>
                            {fact.status === "completed"
                              ? t("Completed", "已完成")
                              : t("In progress", "正在修读")}
                          </small>
                        ) : (
                          <button
                            aria-label={`${t("Add", "添加")} ${key}`}
                            onClick={() => addCourse(c)}
                          >
                            <Plus size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {children.length > 0 && <ol>{branch(r.id, depth + 1)}</ol>}
              {!children.length && !r.alternatives.length && (
                <div className={styles.ruleNote}>
                  {t(
                    "Choose a course with this requirement's attributes in the course search.",
                    "通过课程搜索选择符合此项要求属性的课程。",
                  )}
                  {searchRequirement && r.title && (
                    <button onClick={() => searchRequirement(r.title!)}>
                      <Plus size={14} />
                      {t("Find courses", "选择课程")}
                    </button>
                  )}
                </div>
              )}
            </details>
          </li>
        );
      });
  }
  return (
    <section className={styles.root} data-compact={compact}>
      {!compact && (
        <div className={styles.heading}>
          <div>
            <h2>{t("Track your progress", "学业进度")}</h2>
            <p>
              {t(
                "Your imported BDP requirements, organized by program.",
                "按专业查看导入的 BDP 学业要求。",
              )}
            </p>
          </div>
          <GitBranch size={30} />
        </div>
      )}
      <div className={styles.viewModes}>
        {(["official", "planned", "unknown"] as const)
          .filter(
            (value) =>
              value !== "unknown" ||
              plan.programs.some(
                (p) =>
                  documents.get(p.documentId)?.auditMode === "unknown" &&
                  plan.requirements.some((r) => r.programId === p.id),
              ),
          )
          .map((value) => (
            <button
              key={value}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setSelected("");
              }}
            >
              {value === "official"
                ? t("Official", "Official · 正式专业")
                : value === "planned"
                  ? t("Planned", "Planned · 目标专业")
                  : t("Other reports", "其他报告")}
            </button>
          ))}
      </div>
      <div className={styles.toolbar}>
        <label>
          {t("Program", "专业")}
          <select
            value={program?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {!program && (
              <option value="">
                {t("No report for this view", "尚未导入此视图报告")}
              </option>
            )}
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title ?? p.code ?? t("Program", "专业")}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={remaining}
            onChange={(e) => setRemaining(e.target.checked)}
          />
          {t("Hide completed", "隐藏已完成")}
        </label>
      </div>
      {program && (
        <div className={styles.program}>
          <h3>{program.title ?? program.code}</h3>
          {program.appliedVersion && (
            <span>Applied Version: {program.appliedVersion}</span>
          )}
          {program.catalogTerm && (
            <span>Catalog Term: {program.catalogTerm}</span>
          )}
        </div>
      )}
      {rules.length ? (
        <ol className={styles.tree}>{branch(null)}</ol>
      ) : (
        <div className={styles.empty}>
          <GitBranch size={32} />
          <h3>{t("Bring your degree requirements", "导入你的专业要求")}</h3>
          <p>
            {t(
              "Import the Official or Planned audit from Track Progress.",
              "从 Track Progress 导入 Official 或 Planned 审核报告。",
            )}
          </p>
          <button onClick={onReview}>{t("Import reports", "导入报告")}</button>
        </div>
      )}
      {!compact && (
        <p className={styles.note}>
          {t(
            "BDP report status reflects the export date. New planning choices do not change your official degree audit.",
            "BDP 状态对应报告导出时的结果。本站新增的课程安排不会修改官方毕业审核。",
          )}
        </p>
      )}
    </section>
  );
}

"use client";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { useState } from "react";
import { Plus, GitBranch } from "lucide-react";
import type { Plan } from "@/lib/planning/model";
import { requirementProgress } from "@/lib/planning/snapshots";
import { boardCourses } from "@/lib/planning/workspace";
import { text, type Locale } from "@/lib/i18n";
import { CourseStatus } from "./course-status";
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
            !plan.hiddenPrograms?.includes(p.code ?? "") &&
            plan.requirements.some((r) => r.programId === p.id) &&
            documents.get(p.documentId)?.auditMode === mode,
        )
        .map((p) => [p.code ?? p.title ?? p.id, p]),
    ).values(),
  );
  const activePrograms = selected
    ? programs.filter((p) => p.id === selected)
    : programs;
  const rules = plan.requirements.filter((r) =>
    activePrograms.some((p) => p.id === r.programId),
  );
  const roster = boardCourses(plan),
    statusPriority = {
      completed: 7,
      "in-progress": 6,
      planned: 5,
      repeated: 4,
      unknown: 3,
      failed: 2,
      withdrawn: 1,
      dropped: 0,
    },
    facts = new Map(
      roster
        .filter((r) => r.course.subject && r.course.kind !== "placeholder")
        .sort(
          (a, b) =>
            statusPriority[a.course.status] - statusPriority[b.course.status],
        )
        .map((r) => [`${r.course.subject} ${r.course.number}`, r.course]),
    );
  function branch(
    parentId: string | null,
    programId: string,
    depth = 0,
  ): React.ReactNode {
    if (depth > 24) return null;
    return rules
      .filter((r) => r.parentId === parentId && r.programId === programId)
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
              open={depth < 2}
              data-state={status}
            >
              <summary>
                <CourseStatus status={status} locale={locale} iconOnly />
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
                <span className={styles.chevron} aria-hidden="true">
                  ›
                </span>
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
                        <CourseStatus
                          status={fact?.status ?? "remaining"}
                          locale={locale}
                          iconOnly
                        />
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
              {children.length > 0 && (
                <ol>{branch(r.id, programId, depth + 1)}</ol>
              )}
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
                ? t("Official", "Official · 正式要求")
                : value === "planned"
                  ? t("Planned", "Planned · 规划要求")
                  : t("Other reports", "其他报告")}
            </button>
          ))}
      </div>
      <div className={styles.toolbar}>
        <label>
          {t("Program", "专业")}
          <ChoiceSelect
            value={selected}
            onValueChange={(value) => setSelected(value)}
          >
            <option value="">{t("All programs", "全部专业要求")}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title ?? p.code ?? t("Program", "专业")}
              </option>
            ))}
          </ChoiceSelect>
        </label>
        <button
          className={styles.check}
          aria-pressed={remaining}
          onClick={() => setRemaining(!remaining)}
        >
          {t("Hide completed", "隐藏已完成")}
        </button>
      </div>
      {rules.length ? (
        activePrograms.map((program) => (
          <div key={program.id}>
            <div className={styles.program}>
              <h3>{program.title ?? program.code}</h3>
              {program.declaration === "undeclared" && (
                <span>{t("Not declared", "目标专业 · 未正式注册")}</span>
              )}
              {program.appliedVersion && (
                <span>Applied Version {program.appliedVersion}</span>
              )}
              {program.catalogTerm && (
                <span>Catalog Term {program.catalogTerm}</span>
              )}
            </div>
            <ol className={styles.tree}>{branch(null, program.id)}</ol>
          </div>
        ))
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

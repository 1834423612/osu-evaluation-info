"use client";
import { useState } from "react";
import {
  GitBranch,
  Check,
  Clock3,
  CircleHelp,
  CircleDashed,
  Plus,
  ArrowUpRight,
} from "lucide-react";
import type { Plan } from "@/lib/planning/model";
import { requirementProgress } from "@/lib/planning/snapshots";
import { text, type Locale } from "@/lib/i18n";
import styles from "./requirement-map.module.css";
export function RequirementMap({
  plan,
  locale,
  addCourse,
  onReview,
}: {
  plan: Plan;
  locale: Locale;
  addCourse: (c: { subject: string; number: string }) => void;
  onReview: () => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [selected, setSelected] = useState("");
  const [remaining, setRemaining] = useState(false);
  const program =
    plan.programs.find((p) => p.id === selected) ?? plan.programs[0];
  const stateLabels = {
    satisfied: t("Completed numeric check", "已完成数值条件"),
    planned: t("Planned coverage", "计划覆盖"),
    insufficient: t("Add courses", "需添加课程"),
    unresolved: t("Needs review", "待核对"),
  };
  const categories = {
    general: t("Requirement", "要求"),
    launch: t("GE Launch", "通识导论"),
    writing: t("Writing & literacy", "写作与素养"),
    math: t("Math & quantitative reasoning", "数学与定量推理"),
    arts: t("Arts", "艺术"),
    history: t("History & culture", "历史与文化"),
    science: t("Science", "科学"),
    social: t("Social & behavioral science", "社会与行为科学"),
    diversity: t("Diversity", "多样性"),
    citizenship: t("Citizenship", "公民素养"),
    reflection: t("GE Reflection", "通识反思"),
    core: t("Major core", "专业核心"),
    electives: t("Electives", "选修"),
    survey: t("College survey", "学院导论"),
  };
  const rules = plan.requirements.filter((r) => r.programId === program?.id);
  function branch(parentId: string | null, depth = 0): React.ReactNode {
    if (depth > 24)
      return (
        <li>
          <button onClick={onReview}>
            {t(
              "Open deeper rules in source review",
              "在来源核对中查看更深层条件",
            )}
          </button>
        </li>
      );
    return rules
      .filter((r) => r.parentId === parentId)
      .map((r) => {
        const progress = requirementProgress(plan, r.id);
        if (remaining && progress.state === "satisfied") return null;
        const Icon = {
          satisfied: Check,
          planned: Clock3,
          insufficient: CircleDashed,
          unresolved: CircleHelp,
        }[progress.state];
        const title = categories[r.category ?? "general"];
        const rule =
          r.kind === "all"
            ? t("All child conditions", "全部子条件")
            : r.kind === "any"
              ? t("Any child condition", "任一子条件")
              : r.kind === "credits"
                ? (r.minimumCredits ?? "—") +
                  " " +
                  t("credits minimum", "最低学分")
                : r.kind === "courses"
                  ? (r.minimumCourses ?? "—") +
                    " " +
                    t("courses minimum", "最低课程数")
                  : t("Rule needs review", "规则待核对");
        const allocations = plan.allocations.filter(
          (a) => a.requirementId === r.id,
        );
        const children = rules.some((x) => x.parentId === r.id);
        return (
          <li key={r.id}>
            <details
              className={styles.node}
              open={depth === 0}
              data-state={progress.state}
            >
              <summary>
                <span className={styles.icon}>
                  <Icon size={17} />
                </span>
                <span className={styles.nodeTitle}>
                  <strong>
                    {title}
                    {r.alternatives.length === 1
                      ? " · " +
                        r.alternatives[0].subject +
                        " " +
                        r.alternatives[0].number
                      : ""}
                  </strong>
                  <span>{rule}</span>
                </span>
                <span className={styles.state}>
                  {stateLabels[progress.state]}
                </span>
              </summary>
              <div className={styles.nodeBody}>
                <div className={styles.facts}>
                  <span>
                    {progress.knownCredits} {t("known credits", "已知学分")} ·{" "}
                    {progress.distinctCourses}{" "}
                    {t("distinct courses", "门不同课程")}
                  </span>
                  <span>
                    {allocations.filter((a) => a.confirmed).length}/
                    {allocations.length}{" "}
                    {t("allocations reviewed", "项分配已核对")}
                    {r.page ? " · " + t("p.", "页") + " " + r.page : ""}
                  </span>
                </div>
                {r.alternatives.length > 0 && (
                  <details className={styles.choices}>
                    <summary>
                      {t("Course choices", "课程选项")} ({r.alternatives.length}
                      )
                    </summary>
                    <div className={styles.codes}>
                      {r.alternatives.map((c) => (
                        <div key={c.subject + c.number}>
                          <a
                            href={
                              "/?" +
                              new URLSearchParams({
                                q: c.subject + " " + c.number,
                              })
                            }
                            target="_blank"
                            rel="noreferrer"
                          >
                            <b>{c.subject}</b> {c.number}
                          </a>
                          <button
                            onClick={() => addCourse(c)}
                            aria-label={
                              t("Add to plan", "添加到规划") +
                              " " +
                              c.subject +
                              " " +
                              c.number
                            }
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {!r.hierarchyReviewed && (
                  <button onClick={onReview}>
                    {t("Review rule & parent", "核对规则及上级")}
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
              {children && <ol>{branch(r.id, depth + 1)}</ol>}
            </details>
          </li>
        );
      });
  }
  return (
    <section className={styles.root}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>
            {t("SEE THE CONNECTIONS", "看清每一条连接")}
          </span>
          <h2>{t("Your requirement map.", "你的学业要求图。")}</h2>
          <p>
            {t(
              "Expand branches to explore course choices. Progress uses verified rules and confirmed personal-course allocations.",
              "展开分支查看课程选项。进度依据已核对规则和已确认的个人课程分配。",
            )}
          </p>
        </div>
        <GitBranch size={42} strokeWidth={1.25} />
      </div>
      <div className={styles.toolbar}>
        <label>
          {t("Program & source version", "项目及来源版本")}
          <select
            value={program?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="" disabled>
              {t("Choose a program", "选择项目")}
            </option>
            {plan.programs.map((p, i) => (
              <option key={p.id} value={p.id}>
                {p.code ?? t("Program", "项目") + " " + (i + 1)} ·{" "}
                {p.appliedVersion ?? t("version unknown", "版本未知")} ·{" "}
                {t("Source", "来源")}{" "}
                {plan.documents.findIndex((d) => d.id === p.documentId) + 1}
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
          {t("Hide completed checks", "隐藏已完成条件")}
        </label>
        <button onClick={onReview}>
          {t("Edit rules & allocations", "编辑规则与分配")}
        </button>
      </div>
      <div className={styles.legend}>
        {Object.entries(stateLabels).map(([state, label]) => (
          <span data-state={state} key={state}>
            <i />
            {label}
          </span>
        ))}
      </div>
      {rules.length ? (
        <>
          <div className={styles.program}>
            <h3>{program?.code ?? t("Program", "项目")}</h3>
            <span>Applied Version: {program?.appliedVersion ?? "—"}</span>
            <span>Catalog Term: {program?.catalogTerm ?? "—"}</span>
          </div>
          <ol className={styles.tree}>{branch(null)}</ol>
        </>
      ) : (
        <div className={styles.empty}>
          <GitBranch size={36} />
          <h3>
            {t("Connect a program to its requirements", "为项目建立要求连接")}
          </h3>
          <p>
            {t(
              "Import an audit or add rules and course allocations in source review.",
              "导入审核文件，或在来源核对中添加规则及课程分配。",
            )}
          </p>
          <button onClick={onReview}>
            {t("Open source review", "打开来源核对")}
          </button>
        </div>
      )}
      <p className={styles.note}>
        {t(
          "Numeric coverage is not graduation approval. Grade, residency, prerequisite and exception checks still need official review.",
          "数值条件覆盖不代表毕业审核通过。成绩、修读地点、先修条件及例外仍须官方核对。",
        )}
      </p>
    </section>
  );
}

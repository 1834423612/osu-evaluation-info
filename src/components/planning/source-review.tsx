"use client";
import type { Plan } from "@/lib/planning/model";
import {
  removeRequirement,
  removeSnapshot,
  requirementProgress,
} from "@/lib/planning/snapshots";
import { text, type Locale } from "@/lib/i18n";
import { browserUuid } from "@/lib/uuid";
import styles from "./planning.module.css";
type Props = {
  plan: Plan;
  locale: Locale;
  update: (fn: (p: Plan) => Plan) => void;
};
export function SourceReview({ plan, locale, update }: Props) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const courses = plan.semesters.flatMap((s) => s.courses).filter((c) => c.id);
  function addProgram(documentId: string) {
    update((p) => ({
      ...p,
      programs: [
        ...p.programs,
        {
          id: browserUuid(),
          documentId,
          code: null,
          declaration: "unknown",
          appliedVersion: null,
          catalogTerm: null,
          remainingCredits: null,
        },
      ],
    }));
  }
  function addRequirement(
    program: Plan["programs"][number],
    parentId: string | null,
  ) {
    update((p) => ({
      ...p,
      requirements: [
        ...p.requirements,
        {
          id: browserUuid(),
          documentId: program.documentId,
          programId: program.id,
          parentId,
          kind: "unknown",
          minimumCredits: null,
          minimumCourses: null,
          alternatives: [],
          page: null,
        },
      ],
    }));
  }
  function editProgram(id: string, patch: Partial<Plan["programs"][number]>) {
    update((p) => ({
      ...p,
      programs: p.programs.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  }
  function editRequirement(
    id: string,
    patch: Partial<Plan["requirements"][number]>,
  ) {
    update((p) => ({
      ...p,
      requirements: p.requirements.map((x) =>
        x.id === id
          ? {
              ...x,
              ...patch,
              hierarchyReviewed: patch.hierarchyReviewed ?? false,
            }
          : x,
      ),
    }));
  }
  function requirementRows(
    program: Plan["programs"][number],
    parentId: string | null,
    depth = 0,
  ): React.ReactNode {
    return plan.requirements
      .filter((r) => r.programId === program.id && r.parentId === parentId)
      .map((r, index) => {
        const progress = requirementProgress(plan, r.id);
        return (
          <div
            className={styles.semester}
            key={r.id}
            style={{ marginInlineStart: Math.min(depth, 3) * 12 }}
          >
            <div className={styles.semesterHeading}>
              <strong>
                {t("Requirement", "要求")} {index + 1}
                {r.page ? ` · ${t("page", "页")} ${r.page}` : ""}
              </strong>
              <span>
                {t("Reviewed allocations only", "仅按已核对分配计算")}:{" "}
                {t(
                  progress.state,
                  progress.state === "satisfied"
                    ? "满足数值条件"
                    : progress.state === "insufficient"
                      ? "数值不足"
                      : "待核对",
                )}
              </span>
            </div>
            <div className={styles.panel}>
              <label className={styles.allocation}>
                <input
                  type="checkbox"
                  checked={r.hierarchyReviewed === true}
                  onChange={(e) =>
                    editRequirement(r.id, {
                      hierarchyReviewed: e.target.checked,
                    })
                  }
                />
                {t(
                  "I verified this rule and its parent against the source",
                  "我已对照来源核对本规则及其上级",
                )}
              </label>
              <div className={styles.meta}>
                <label className={styles.field}>
                  {t("Rule", "规则")}
                  <select
                    value={r.kind}
                    onChange={(e) =>
                      editRequirement(r.id, {
                        kind: e.target.value as typeof r.kind,
                      })
                    }
                  >
                    {(
                      ["unknown", "all", "any", "credits", "courses"] as const
                    ).map((kind, i) => (
                      <option key={kind} value={kind}>
                        {locale === "zh"
                          ? [
                              "待核对",
                              "全部子条件",
                              "任一子条件",
                              "最低学分",
                              "最低课程数",
                            ][i]
                          : kind}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  {t("Minimum credits", "最低学分")}
                  <input
                    type="number"
                    min="0"
                    max="999"
                    value={r.minimumCredits ?? ""}
                    onChange={(e) =>
                      editRequirement(r.id, {
                        minimumCredits:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className={styles.field}>
                  {t("Minimum courses", "最低课程数")}
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={r.minimumCourses ?? ""}
                    onChange={(e) =>
                      editRequirement(r.id, {
                        minimumCourses:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              {r.alternatives.length > 0 && (
                <p>
                  {t("Source course candidates", "来源课程候选")}:{" "}
                  {r.alternatives
                    .map((c) => `${c.subject} ${c.number}`)
                    .join(" / ")}
                </p>
              )}
              <label className={styles.field}>
                {t("Allocate a reviewed course", "分配已核对课程")}
                <select
                  value=""
                  onChange={(e) => {
                    const courseId = e.target.value;
                    if (courseId)
                      update((p) => ({
                        ...p,
                        allocations: p.allocations.some(
                          (a) =>
                            a.courseId === courseId && a.requirementId === r.id,
                        )
                          ? p.allocations
                          : [
                              ...p.allocations,
                              {
                                courseId,
                                requirementId: r.id,
                                confirmed: false,
                              },
                            ],
                      }));
                  }}
                >
                  <option value="">
                    {t("Select a course observation", "选择课程记录")}
                  </option>
                  {courses.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      {c.subject ?? "—"} {c.number ?? "—"} ·{" "}
                      {t("record", "记录")} {i + 1} · {c.credits ?? "?"}
                    </option>
                  ))}
                </select>
              </label>
              {plan.allocations
                .filter((a) => a.requirementId === r.id)
                .map((a) => {
                  const c = courses.find((c) => c.id === a.courseId);
                  return (
                    <label className={styles.allocation} key={a.courseId}>
                      <input
                        type="checkbox"
                        checked={a.confirmed}
                        onChange={(e) =>
                          update((p) => ({
                            ...p,
                            allocations: p.allocations.map((x) =>
                              x.courseId === a.courseId &&
                              x.requirementId === r.id
                                ? { ...x, confirmed: e.target.checked }
                                : x,
                            ),
                          }))
                        }
                      />
                      {c?.subject ?? "—"} {c?.number ?? "—"} ·{" "}
                      {t("I verified this allocation", "我已核对这项分配")}
                      <button
                        onClick={() =>
                          update((p) => ({
                            ...p,
                            allocations: p.allocations.filter((x) => x !== a),
                          }))
                        }
                      >
                        {t("Remove", "移除")}
                      </button>
                    </label>
                  );
                })}
              <div className={styles.actions}>
                <button onClick={() => addRequirement(program, r.id)}>
                  {t("Add child rule", "添加子条件")}
                </button>
                <button
                  onClick={() => update((p) => removeRequirement(p, r.id))}
                >
                  {t("Remove rule and children", "删除条件及子条件")}
                </button>
              </div>
            </div>
            {requirementRows(program, r.id, depth + 1)}
          </div>
        );
      });
  }
  return (
    <section className={styles.review}>
      <h2>{t("Sources, programs & requirements", "来源、项目与要求")}</h2>
      <p>
        {t(
          "Keep each document and program version separate. Numeric checks use only confirmed allocations and do not establish graduation eligibility. Unrecognized rules need manual review; remaining credits are never added across programs.",
          "分别保留每份文档和项目版本。数值检查仅使用已确认分配，不代表毕业资格。未识别规则需手动核对，不会跨项目累加剩余学分。",
        )}
      </p>
      {!plan.documents.length && (
        <button
          onClick={() =>
            update((p) => {
              const id = browserUuid();
              return {
                ...p,
                documents: [
                  {
                    id,
                    source: "manual",
                    pdfOrigin: "export",
                    auditMode: "unknown",
                    catalogTerm: null,
                  },
                ],
                semesters: p.semesters.map((s) => ({
                  ...s,
                  documentId: id,
                  courses: s.courses.map((c) => ({
                    ...c,
                    id: c.id ?? browserUuid(),
                    documentId: id,
                  })),
                })),
              };
            })
          }
        >
          {t("Add manual source", "添加手动来源")}
        </button>
      )}
      {plan.documents.map((d, index) => (
        <details className={styles.semester} key={d.id} open>
          <summary className={styles.semesterHeading}>
            {t("Source", "来源")} {index + 1} · {d.source} · {d.auditMode}
          </summary>
          <div className={styles.panel}>
            <label className={styles.field}>
              {t("Source audit mode", "来源审核模式")}
              <select
                value={d.auditMode}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    documents: p.documents.map((x) =>
                      x.id === d.id
                        ? {
                            ...x,
                            auditMode: e.target.value as typeof d.auditMode,
                          }
                        : x,
                    ),
                  }))
                }
              >
                <option value="unknown">{t("Unknown", "未知")}</option>
                <option value="official">Official</option>
                <option value="planned">Planned</option>
              </select>
            </label>
            <div className={styles.actions}>
              <button onClick={() => addProgram(d.id)}>
                {t("Add program", "添加项目")}
              </button>
              <button
                onClick={() => {
                  if (
                    confirm(
                      t(
                        "Remove this source and its requirements?",
                        "删除此来源及其要求？",
                      ),
                    )
                  )
                    update((p) => removeSnapshot(p, d.id));
                }}
              >
                {t("Remove source", "删除来源")}
              </button>
            </div>
            {plan.programs
              .filter((p) => p.documentId === d.id)
              .map((p, i) => (
                <div className={styles.review} key={p.id}>
                  <h3>
                    {t("Program", "项目")} {i + 1}
                  </h3>
                  <div className={styles.meta}>
                    <label className={styles.field}>
                      {t(
                        "Program code (no personal names)",
                        "项目代码（请勿输入姓名）",
                      )}
                      <input
                        placeholder="CIS"
                        value={p.code ?? ""}
                        onChange={(e) =>
                          editProgram(p.id, {
                            code: e.target.value.toUpperCase() || null,
                          })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      {t("Declaration", "申报状态")}
                      <select
                        value={p.declaration}
                        onChange={(e) =>
                          editProgram(p.id, {
                            declaration: e.target.value as typeof p.declaration,
                          })
                        }
                      >
                        <option value="unknown">{t("Unknown", "未知")}</option>
                        <option value="declared">
                          {t("Declared", "已申报")}
                        </option>
                        <option value="undeclared">
                          {t("Undeclared", "未申报")}
                        </option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      {t("Applied Version", "适用要求版本")}
                      <input
                        value={p.appliedVersion ?? ""}
                        placeholder="AU2022"
                        onChange={(e) =>
                          editProgram(p.id, {
                            appliedVersion: e.target.value || null,
                          })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      {t("Catalog Term", "目录学期")}
                      <input
                        value={p.catalogTerm ?? ""}
                        placeholder="Autumn2028"
                        onChange={(e) =>
                          editProgram(p.id, {
                            catalogTerm: e.target.value || null,
                          })
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      {t(
                        "Remaining credits for this program",
                        "此项目剩余学分",
                      )}
                      <input
                        type="number"
                        min="0"
                        max="999"
                        value={p.remainingCredits ?? ""}
                        onChange={(e) =>
                          editProgram(p.id, {
                            remainingCredits:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  {requirementRows(p, null)}
                  <button onClick={() => addRequirement(p, null)}>
                    {t("Add requirement", "添加要求")}
                  </button>
                </div>
              ))}
          </div>
        </details>
      ))}
    </section>
  );
}

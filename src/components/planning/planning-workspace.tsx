"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  CalendarDays,
  FileUp,
  ShieldCheck,
  ArrowUpRight,
  Plus,
  Trash2,
  Download,
  Save,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import {
  emptyPlan,
  savePlan,
  loadPlan,
  serializePlan,
  courseSearchHref,
  PLAN_STORAGE_KEY,
  type Plan,
  type PlanCourse,
} from "@/lib/planning/model";
import { extractPlan } from "@/lib/planning/pdf";
import styles from "./planning.module.css";
const SourceReview = dynamic(() =>
  import("./source-review").then((m) => m.SourceReview),
);
const SemesterBoard = dynamic(() =>
  import("./semester-board").then((m) => m.SemesterBoard),
);
const RequirementMap = dynamic(() =>
  import("./requirement-map").then((m) => m.RequirementMap),
);
const CurriculumDirectory = dynamic(() =>
  import("./curriculum-directory").then((m) => m.CurriculumDirectory),
);
import { pruneAllocations } from "@/lib/planning/snapshots";
import { browserUuid } from "@/lib/uuid";
import { ImportGuard } from "@/lib/planning/import-guard";
import { importPlanningFiles } from "@/lib/planning/batch-import";
import { applyRecommendationBundle } from "@/lib/planning/recommendation";
const NextTerm = dynamic(() => import("./next-term").then((m) => m.NextTerm));

export function PlanningWorkspace() {
  const { locale } = usePreferences();
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [plan, setPlan] = useState<Plan>(emptyPlan);
  const [source, setSource] = useState<Plan["source"] | "auto">("auto");
  const [origin, setOrigin] = useState<Plan["pdfOrigin"]>("export");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<
    "private" | "board" | "map" | "official" | "next"
  >("private");
  const [dark, setDark] = useState(false);
  const [visibleSource, setVisibleSource] = useState("");
  const [importProgress, setImportProgress] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const importGuard = useRef(new ImportGuard());
  useEffect(() => {
    const guard = importGuard.current;
    return () => guard.invalidate();
  }, []);
  const cancelImport = () => {
    importGuard.current.invalidate();
    setBusy(false);
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const update = (fn: (p: Plan) => Plan) => {
    cancelImport();
    setPlan((p) => ({ ...pruneAllocations(fn(p)), reviewed: false }));
    setMessage("");
  };
  const updateCourse = (si: number, ci: number, patch: Partial<PlanCourse>) =>
    update((p) => ({
      ...p,
      allocations: p.allocations.map((a) =>
        a.courseId === p.semesters[si].courses[ci].id
          ? { ...a, confirmed: false }
          : a,
      ),
      semesters: p.semesters.map((s, i) =>
        i === si
          ? {
              ...s,
              courses: s.courses.map((c, j) =>
                j === ci ? { ...c, ...patch } : c,
              ),
            }
          : s,
      ),
    }));
  async function importPdf(files: File[]) {
    if (!files.length) return;
    if (
      importMode === "replace" &&
      plan.semesters.length &&
      !window.confirm(
        t(
          "Replace the current draft? Export it first to keep a copy.",
          "替换当前草稿？如需保留，请先导出。",
        ),
      )
    )
      return;
    setBusy(true);
    setMessage("");
    const token = importGuard.current.start();
    try {
      const result = await importPlanningFiles(files, {
        existing: plan,
        replace: importMode === "replace",
        signal: token.signal,
        extract: async (file) =>
          (await extractPlan(file as File, source, token.signal, origin)).plan,
        progress: (done, total) => {
          if (importGuard.current.current(token.generation))
            setImportProgress(`${done} / ${total}`);
        },
      });
      if (!importGuard.current.current(token.generation)) return;
      setPlan(result.plan);
      setMessage(
        result.imported === 0
          ? t(
              "No supported rows found. Add courses manually or try a Student Plan export.",
              "未识别到支持的课程行。请手动添加或使用 Student Plan 导出。",
            )
          : files.length === 1 && !result.failed && !result.empty
            ? t(
                "Candidates extracted. Check every row against your PDF before saving.",
                "已提取候选课程。保存前请逐行对照原 PDF。",
              )
            : t(
                `${result.imported} files imported · ${result.failed} could not be read · ${result.empty} had no supported rows. Review each source before saving.`,
                `已导入 ${result.imported} 个文件 · ${result.failed} 个读取失败 · ${result.empty} 个无可识别内容。保存前请分别核对来源。`,
              ),
      );
    } catch {
      if (!importGuard.current.current(token.generation)) return;
      setMessage(
        t(
          "Could not import. Select up to 12 files and 60 MB total. Each PDF must be a text PDF under 20 MB and 100 pages; JSON must be under 4 MB.",
          "无法导入。每次最多 12 个文件、合计 60 MB；文本 PDF 每份不超过 20 MB、100 页，JSON 不超过 4 MB。",
        ),
      );
    } finally {
      if (importGuard.current.current(token.generation)) {
        setBusy(false);
        setImportProgress("");
        if (fileInput.current) fileInput.current.value = "";
      }
    }
  }
  function openReview() {
    setReviewOpen(true);
    setTab("private");
    setTimeout(
      () =>
        document
          .getElementById("planning-source-review")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      100,
    );
  }
  function addCourse(code: { subject: string; number: string }) {
    const manualIds = new Set(
      plan.documents.filter((d) => d.source === "manual").map((d) => d.id),
    );
    if (
      plan.semesters.some(
        (s) =>
          manualIds.has(s.documentId ?? "") &&
          s.courses.some(
            (c) => c.subject === code.subject && c.number === code.number,
          ),
      )
    ) {
      setTab("board");
      setMessage(
        t(
          "This course is already in your manual plan.",
          "手动规划中已有这门课程。",
        ),
      );
      return;
    }
    update((p) => {
      const document = p.documents.find((d) => d.source === "manual") ?? {
        id: browserUuid(),
        source: "manual" as const,
        pdfOrigin: "export" as const,
        auditMode: "unknown" as const,
        catalogTerm: null,
      };
      const group = p.semesters.findIndex(
        (s) =>
          s.documentId === document.id &&
          s.term === null &&
          s.courses.length < 100,
      );
      const course: PlanCourse = {
        id: browserUuid(),
        documentId: document.id,
        subject: code.subject,
        number: code.number,
        kind: "course",
        evidenceRole: "observation",
        credits: null,
        status: "planned",
        page: null,
      };
      return {
        ...p,
        documents: p.documents.some((d) => d.id === document.id)
          ? p.documents
          : [...p.documents, document],
        semesters:
          group >= 0
            ? p.semesters.map((s, i) =>
                i === group ? { ...s, courses: [...s.courses, course] } : s,
              )
            : [
                ...p.semesters,
                {
                  documentId: document.id,
                  term: null,
                  reportedCredits: null,
                  courses: [course],
                },
              ],
      };
    });
    setTab("board");
    setMessage(
      t(
        "Course added to your plan. Choose a semester and check its credits.",
        "课程已加入规划，请选择学期并核对学分。",
      ),
    );
  }
  function persist(exporting: boolean) {
    try {
      if (exporting) {
        const blob = new Blob([serializePlan(plan)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "private-plan.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else savePlan(localStorage, plan);
      setMessage(
        exporting
          ? t("Structured plan exported.", "已导出结构化规划。")
          : t("Saved on this browser.", "已保存在当前浏览器。"),
      );
    } catch {
      setMessage(
        t(
          "Could not save. Check the fields and review checkbox; browser storage may be unavailable.",
          "无法保存。请检查字段并确认审核；浏览器存储也可能不可用。",
        ),
      );
    }
  }
  const selectedSource = plan.documents.some((d) => d.id === visibleSource)
    ? visibleSource
    : "";
  const count = plan.semesters.reduce((n, s) => n + s.courses.length, 0);
  return (
    <div
      className={`${styles.page} rr-block`}
      data-theme={dark ? "dark" : "light"}
    >
      <AppHeader active="planning" />
      <main className={styles.main}>
        <div className={styles.eyebrow}>
          <CalendarDays size={16} />
          {t("YOUR NEXT CHAPTER", "规划下一程")}
          <button onClick={() => setDark(!dark)}>
            {dark ? t("Light", "浅色") : t("Dark", "深色")}
          </button>
        </div>
        <div className={styles.hero}>
          <div>
            <h1>{t("Make room for what’s next.", "让下一步，更清晰。")}</h1>
            <p>
              {t(
                "Bring your degree plan. Review your courses. Build a semester that works for you.",
                "导入学业规划，核对课程，安排适合自己的学期。",
              )}
            </p>
          </div>
          <div className={styles.privateBadge}>
            <ShieldCheck size={23} />
            <span>
              {t("Private by default", "默认私密")}
              <small>
                {t("PDF stays on your device", "PDF 留在你的设备上")}
              </small>
            </span>
          </div>
        </div>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label={t("Planning workspace", "规划工作区")}
          onKeyDown={(e) => {
            const buttons = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              e.key === "ArrowRight"
                ? (index + 1) % buttons.length
                : e.key === "ArrowLeft"
                  ? (index + buttons.length - 1) % buttons.length
                  : e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? buttons.length - 1
                      : -1;
            if (next >= 0) {
              e.preventDefault();
              buttons[next].focus();
              buttons[next].click();
            }
          }}
        >
          {(
            [
              { id: "private", en: "Import & review", zh: "导入与核对" },
              { id: "board", en: "Semester board", zh: "学期看板" },
              { id: "map", en: "Requirement map", zh: "学业要求图" },
              { id: "next", en: "Next semester", zh: "下学期推荐" },
              { id: "official", en: "Official curricula", zh: "官方培养方案" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              id={"planning-tab-" + item.id}
              role="tab"
              aria-selected={tab === item.id}
              tabIndex={tab === item.id ? 0 : -1}
              aria-controls="planning-content"
              onClick={() => setTab(item.id)}
            >
              {t(item.en, item.zh)}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id="planning-content"
          aria-labelledby={"planning-tab-" + tab}
        >
          {tab === "official" ? (
            <CurriculumDirectory locale={locale} addCourse={addCourse} />
          ) : tab === "next" ? (
            <NextTerm
              plan={plan}
              locale={locale}
              onReview={openReview}
              apply={(items, term) => {
                update((p) =>
                  applyRecommendationBundle(p, items, term, browserUuid),
                );
                setTab("board");
                setMessage(
                  t(
                    "Draft courses added. Review credits, prerequisites and sessions before saving.",
                    "已加入课程草稿。保存前请核对学分、先修和 sessions。",
                  ),
                );
              }}
            />
          ) : tab === "board" ? (
            <SemesterBoard
              plan={plan}
              locale={locale}
              update={update}
              onReview={openReview}
            />
          ) : tab === "map" ? (
            <RequirementMap
              plan={plan}
              locale={locale}
              addCourse={addCourse}
              onReview={openReview}
            />
          ) : (
            <div className={styles.workspace}>
              <aside className={styles.panel}>
                <div className={styles.sectionHeading}>
                  <span className={styles.step}>1</span>
                  <h2>{t("Bring your plan", "导入规划")}</h2>
                </div>
                <p>
                  {t(
                    "Start with Student Plan. Review Planned Standard separately; Expanded adds constraint context. Add imports as separate source snapshots, or explicitly replace the draft.",
                    "推荐先导入 Student Plan，再单独核对 Planned Standard；Expanded 提供详细约束。可追加独立来源快照，或明确选择替换草稿。",
                  )}
                </p>
                <label className={styles.field}>
                  {t("PDF layout", "PDF 版式")}
                  <select
                    value={source}
                    disabled={busy}
                    onChange={(e) =>
                      setSource(e.target.value as Plan["source"] | "auto")
                    }
                  >
                    <option value="auto">
                      {t("Detect each file", "逐个识别版式")}
                    </option>
                    <option value="student-plan">Student Plan</option>
                    <option value="standard-audit">Standard Audit</option>
                    <option value="expanded-audit">
                      Expanded Audit (Beta)
                    </option>
                    <option value="compact-audit">Compact Audit</option>
                  </select>
                </label>
                <label className={styles.field}>
                  {t("Created with", "生成方式")}
                  <select
                    value={origin}
                    onChange={(e) =>
                      setOrigin(e.target.value as Plan["pdfOrigin"])
                    }
                  >
                    <option value="export">
                      {t("BDP PDF export", "BDP PDF 导出")}
                    </option>
                    <option value="browser-print">
                      {t("Browser print to PDF", "浏览器打印 PDF")}
                    </option>
                  </select>
                </label>
                {((source !== "student-plan" && source !== "auto") ||
                  origin === "browser-print") && (
                  <p className={styles.notice}>
                    {t(
                      "Limited support: audit columns and browser print layouts may lose order. Candidates remain unassigned; requirements and remaining credits are not combined.",
                      "有限支持：审核文件分栏和浏览器打印可能打乱顺序。候选课程保持未分配，不合并需求或剩余学分。",
                    )}
                  </p>
                )}
                <label className={styles.field}>
                  {t("Import action", "导入方式")}
                  <select
                    value={importMode}
                    disabled={busy}
                    onChange={(e) =>
                      setImportMode(e.target.value as "merge" | "replace")
                    }
                  >
                    <option value="merge">
                      {t(
                        "Add source to this workspace",
                        "追加来源到当前工作区",
                      )}
                    </option>
                    <option value="replace">
                      {t("Replace current draft", "替换当前草稿")}
                    </option>
                  </select>
                </label>
                <label className={styles.drop}>
                  <FileUp size={30} />
                  <strong>
                    {busy
                      ? `${t("Reading locally…", "正在本地读取…")} ${importProgress}`
                      : t(
                          "Choose PDFs or a plan backup",
                          "选择 PDF 或规划备份",
                        )}
                  </strong>
                  <span>
                    {t(
                      "Up to 12 files · PDF or JSON",
                      "最多 12 个文件 · PDF 或 JSON",
                    )}
                  </span>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf,application/json,.pdf,.json"
                    multiple
                    disabled={busy}
                    onChange={(e) =>
                      void importPdf(Array.from(e.target.files ?? []))
                    }
                  />
                </label>
                {busy && (
                  <button onClick={cancelImport}>{t("Cancel", "取消")}</button>
                )}
                <div className={styles.divider} />
                <h3>
                  {t("Only what you choose to keep", "仅保留你确认的内容")}
                </h3>
                <p>
                  {t(
                    "Names, IDs, contacts, filenames and raw text are excluded from saved data. Course combinations can still identify you. Saving is local; exported JSON remains private information.",
                    "保存数据排除姓名、学号、联系方式、文件名和原文。课程组合仍可能识别个人。本地保存不上传；导出的 JSON 仍是私人信息。",
                  )}
                </p>
                <button
                  onClick={() => {
                    try {
                      const saved = loadPlan(localStorage);
                      if (saved) {
                        if (
                          plan.semesters.length &&
                          !confirm(
                            t(
                              "Replace this draft with the saved plan?",
                              "用已保存规划替换当前草稿？",
                            ),
                          )
                        )
                          return;
                        cancelImport();
                        setPlan(saved);
                        setMessage(
                          t("Saved plan loaded.", "已载入保存的规划。"),
                        );
                      } else
                        setMessage(
                          t(
                            "No saved plan on this browser.",
                            "当前浏览器没有保存的规划。",
                          ),
                        );
                    } catch {
                      setMessage(
                        t(
                          "Saved data could not be read.",
                          "无法读取保存的数据。",
                        ),
                      );
                    }
                  }}
                >
                  {t("Load saved plan", "载入已保存规划")}
                </button>
              </aside>
              <section className={styles.panel}>
                <div className={styles.sectionHeading}>
                  <span className={styles.step}>2</span>
                  <h2>
                    {t("Review & shape your semesters", "核对并安排学期")}
                  </h2>
                  <span className={styles.chip}>
                    {count} {t("rows", "项")}
                  </span>
                </div>
                <p className={styles.notice}>
                  {t(
                    "Check against the original. “Planned” does not mean unregistered. Blank credits are unknown, not zero. Repeated audit courses are candidates, not a credit total.",
                    "请对照原文件。“Planned” 不代表未注册。空白学分表示未知，不是零。重复审核课程仅作为候选，不计算总学分。",
                  )}
                </p>
                {plan.documents.length === 0 && (
                  <div className={styles.meta}>
                    <label className={styles.field}>
                      {t(
                        "Applied Version (SIS requirement term)",
                        "Applied Version（SIS 要求学期）",
                      )}
                      <input
                        placeholder="AU2017"
                        value={plan.appliedVersion ?? ""}
                        onChange={(e) =>
                          update((p) => ({
                            ...p,
                            appliedVersion: e.target.value || null,
                          }))
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      {t("Catalog Term", "Catalog Term（目录学期）")}
                      <input
                        placeholder="Autumn2026"
                        value={plan.catalogTerm ?? ""}
                        onChange={(e) =>
                          update((p) => ({
                            ...p,
                            catalogTerm: e.target.value || null,
                          }))
                        }
                      />
                    </label>
                    <label className={styles.field}>
                      {t("Audit mode", "审核模式")}
                      <select
                        value={plan.auditMode}
                        onChange={(e) =>
                          update((p) => ({
                            ...p,
                            auditMode: e.target.value as Plan["auditMode"],
                          }))
                        }
                      >
                        <option value="unknown">{t("Unknown", "未知")}</option>
                        <option value="official">Official</option>
                        <option value="planned">Planned</option>
                      </select>
                    </label>
                  </div>
                )}
                {!plan.semesters.length && (
                  <div className={styles.empty}>
                    <CalendarDays size={38} />
                    <h3>
                      {t("Your semesters start here", "从这里开始安排学期")}
                    </h3>
                    <p>
                      {t(
                        "Import a PDF or add your first semester.",
                        "导入 PDF，或添加第一个学期。",
                      )}
                    </p>
                  </div>
                )}
                {plan.documents.length > 1 && (
                  <label className={styles.field}>
                    {t("Show source", "显示来源")}
                    <select
                      value={selectedSource}
                      onChange={(e) => setVisibleSource(e.target.value)}
                    >
                      <option value="">{t("All sources", "全部来源")}</option>
                      {plan.documents.map((d, i) => (
                        <option key={d.id} value={d.id}>
                          {t("Source", "来源")} {i + 1} · {d.source}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {plan.semesters.map((semester, si) =>
                  selectedSource &&
                  semester.documentId !== selectedSource ? null : (
                    <article className={styles.semester} key={si}>
                      <div className={styles.semesterHeading}>
                        <small>
                          {semester.documentId
                            ? `${t("Source", "来源")} ${plan.documents.findIndex((d) => d.id === semester.documentId) + 1}`
                            : t("Manual", "手动")}{" "}
                          · {semester.creditOrigin ?? "unknown"}
                        </small>
                        <label className={styles.field}>
                          {t("Credit origin", "学分来源")}
                          <select
                            value={semester.creditOrigin ?? "unknown"}
                            onChange={(e) => {
                              const value = e.target.value as NonNullable<
                                typeof semester.creditOrigin
                              >;
                              update((p) => ({
                                ...p,
                                semesters: p.semesters.map((x, i) =>
                                  i === si
                                    ? {
                                        ...x,
                                        creditOrigin: value,
                                        term: ["transfer", "exam"].includes(
                                          value,
                                        )
                                          ? null
                                          : x.term,
                                      }
                                    : x,
                                ),
                              }));
                            }}
                          >
                            {[
                              "institutional",
                              "transfer",
                              "exam",
                              "unknown",
                            ].map((value, i) => (
                              <option value={value} key={value}>
                                {locale === "zh"
                                  ? ["校内课程", "转学分", "考试学分", "未知"][
                                      i
                                    ]
                                  : value}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.field}>
                          {t(
                            "Semester · blank means unassigned",
                            "学期 · 空白表示未分配",
                          )}
                          <input
                            aria-label={t("Semester", "学期")}
                            disabled={
                              semester.creditOrigin === "transfer" ||
                              semester.creditOrigin === "exam"
                            }
                            placeholder="Autumn2026"
                            value={semester.term ?? ""}
                            onChange={(e) =>
                              update((p) => ({
                                ...p,
                                semesters: p.semesters.map((s, i) =>
                                  i === si
                                    ? { ...s, term: e.target.value || null }
                                    : s,
                                ),
                              }))
                            }
                          />
                        </label>
                        <span>
                          {t("Source total", "来源总学分")}:{" "}
                          {semester.reportedCredits ?? "—"}
                        </span>
                        <button
                          aria-label={t("Remove semester", "删除学期")}
                          onClick={() =>
                            update((p) => ({
                              ...p,
                              semesters: p.semesters.filter((_, i) => i !== si),
                            }))
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {semester.courses.map((course, ci) => (
                        <div className={styles.course} key={ci}>
                          <label>
                            {t("Subject", "学科")}
                            <input
                              value={course.subject ?? ""}
                              placeholder="CSE"
                              onChange={(e) =>
                                updateCourse(si, ci, {
                                  subject: e.target.value.toUpperCase() || null,
                                })
                              }
                            />
                          </label>
                          <label>
                            {t("Number", "课号")}
                            <input
                              value={course.number ?? ""}
                              placeholder="2111"
                              onChange={(e) =>
                                updateCourse(si, ci, {
                                  number: e.target.value || null,
                                })
                              }
                            />
                          </label>
                          <label>
                            {t("Credits", "学分")}
                            <input
                              type="number"
                              min="0"
                              max="99"
                              step="0.5"
                              value={course.credits ?? ""}
                              placeholder="—"
                              onChange={(e) =>
                                updateCourse(si, ci, {
                                  credits:
                                    e.target.value === ""
                                      ? null
                                      : Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            {t("Kind", "类型")}
                            <select
                              value={course.kind}
                              onChange={(e) =>
                                updateCourse(si, ci, {
                                  kind: e.target.value as PlanCourse["kind"],
                                })
                              }
                            >
                              <option value="course">
                                {t("Course", "课程")}
                              </option>
                              <option value="placeholder">
                                {t("Placeholder", "占位项")}
                              </option>
                            </select>
                          </label>
                          <label>
                            {t("Record type", "记录类型")}
                            <select
                              value={course.evidenceRole ?? "unknown"}
                              onChange={(e) =>
                                updateCourse(si, ci, {
                                  evidenceRole: e.target
                                    .value as PlanCourse["evidenceRole"],
                                })
                              }
                            >
                              <option value="unknown">
                                {t("Check source", "待核对")}
                              </option>
                              <option value="observation">
                                {t("Personal course", "个人课程")}
                              </option>
                              <option value="option">
                                {t("Requirement option", "要求选项")}
                              </option>
                            </select>
                          </label>
                          <label>
                            {t("Source status", "来源状态")}
                            <select
                              value={course.status}
                              onChange={(e) =>
                                updateCourse(si, ci, {
                                  status: e.target
                                    .value as PlanCourse["status"],
                                })
                              }
                            >
                              {(
                                [
                                  "unknown",
                                  "planned",
                                  "completed",
                                  "in-progress",
                                ] as const
                              ).map((s, i) => (
                                <option key={s} value={s}>
                                  {locale === "zh"
                                    ? ["未知", "计划", "已完成", "进行中"][i]
                                    : s}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className={styles.rowActions}>
                            <small>
                              {course.page
                                ? `${t("p.", "页")} ${course.page}`
                                : t("Manual", "手动")}
                            </small>
                            {(() => {
                              try {
                                const href = courseSearchHref(course);
                                return href ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={t(
                                      "Find course and ratings",
                                      "查找课程和评分",
                                    )}
                                  >
                                    <ArrowUpRight size={17} />
                                  </a>
                                ) : null;
                              } catch {
                                return null;
                              }
                            })()}
                            <button
                              aria-label={t("Remove course", "删除课程")}
                              onClick={() =>
                                update((p) => ({
                                  ...p,
                                  semesters: p.semesters.map((s, i) =>
                                    i === si
                                      ? {
                                          ...s,
                                          courses: s.courses.filter(
                                            (_, j) => j !== ci,
                                          ),
                                        }
                                      : s,
                                  ),
                                }))
                              }
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        className={styles.add}
                        onClick={() =>
                          update((p) => ({
                            ...p,
                            semesters: p.semesters.map((s, i) =>
                              i === si
                                ? {
                                    ...s,
                                    courses: [
                                      ...s.courses,
                                      {
                                        id: browserUuid(),
                                        documentId: s.documentId,
                                        kind: "course",
                                        subject: null,
                                        number: null,
                                        credits: null,
                                        status: "unknown",
                                        page: null,
                                      },
                                    ],
                                  }
                                : s,
                            ),
                          }))
                        }
                      >
                        <Plus size={15} />
                        {t("Add course or placeholder", "添加课程或占位项")}
                      </button>
                    </article>
                  ),
                )}
                <button
                  className={styles.add}
                  onClick={() =>
                    update((p) => ({
                      ...p,
                      semesters: [
                        ...p.semesters,
                        { term: null, reportedCredits: null, courses: [] },
                      ],
                    }))
                  }
                >
                  <Plus size={17} />
                  {t("Add semester", "添加学期")}
                </button>
                <details
                  id="planning-source-review"
                  className={styles.sourceEditor}
                  open={reviewOpen}
                  onToggle={(e) => setReviewOpen(e.currentTarget.open)}
                >
                  <summary>
                    {t("Sources, programs & requirements", "来源、项目与要求")}
                  </summary>
                  {reviewOpen && (
                    <SourceReview plan={plan} locale={locale} update={update} />
                  )}
                </details>
                <div className={styles.review}>
                  <label>
                    <input
                      type="checkbox"
                      checked={plan.reviewed}
                      onChange={(e) => {
                        cancelImport();
                        setPlan((p) => ({ ...p, reviewed: e.target.checked }));
                      }}
                    />
                    {t(
                      "I checked these fields against my source and removed unwanted information.",
                      "我已对照来源核对这些字段，并删除不需要的信息。",
                    )}
                  </label>
                  <div className={styles.actions}>
                    <button
                      disabled={!plan.reviewed || busy}
                      className={styles.primary}
                      onClick={() => persist(false)}
                    >
                      <Save size={16} />
                      {t("Save on this device", "保存在此设备")}
                    </button>
                    <button
                      disabled={!plan.reviewed || busy}
                      onClick={() => persist(true)}
                    >
                      <Download size={16} />
                      {t("Export JSON", "导出 JSON")}
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            t(
                              "Delete the saved plan and current draft?",
                              "删除已保存规划及当前草稿？",
                            ),
                          )
                        ) {
                          try {
                            localStorage.removeItem(PLAN_STORAGE_KEY);
                            cancelImport();
                            setPlan(emptyPlan());
                            setMessage(
                              t("Local plan deleted.", "已删除本地规划。"),
                            );
                          } catch {
                            setMessage(t("Deletion failed.", "删除失败。"));
                          }
                        }
                      }}
                    >
                      {t("Delete local plan", "删除本地规划")}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>
        <p role="status" aria-live="polite" className={styles.status}>
          {message}
        </p>
        <p className={styles.footnote}>
          {t(
            "Planning aid only. Confirm degree requirements and registration with your advisor. No public sharing is enabled.",
            "仅作规划辅助。请与顾问确认学位要求和注册情况。当前不提供公开分享。",
          )}
        </p>
      </main>
      <AppFooter />
    </div>
  );
}

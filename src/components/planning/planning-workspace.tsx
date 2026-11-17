"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Download,
  FileUp,
  ShieldCheck,
  CalendarDays,
  GitBranch,
  BookOpen,
  Check,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { usePreferences } from "@/hooks/use-preferences";
import { useDraftGuard } from "@/components/forms/draft-guard";
import { text } from "@/lib/i18n";
import {
  emptyPlan,
  savePlan,
  loadPlan,
  serializePlan,
  PLAN_STORAGE_KEY,
  type Plan,
} from "@/lib/planning/model";
import { extractPlan } from "@/lib/planning/pdf";
import { pruneAllocations, removeSnapshot } from "@/lib/planning/snapshots";
import { importPlanningFiles } from "@/lib/planning/batch-import";
import { ImportGuard } from "@/lib/planning/import-guard";
import {
  importProfile,
  type ImportProfile,
} from "@/lib/planning/import-profile";
import {
  addPlanningCourse,
  boardCourses,
  nextSemester,
} from "@/lib/planning/workspace";
import { browserUuid } from "@/lib/uuid";
import { PlanningCatalogProvider } from "./course-catalog";
import { CatalogTermSelect } from "./catalog-term";
import { CourseInspector } from "./course-inspector";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { ImportGuide } from "./import-guide";
import styles from "./planning.module.css";
const SemesterBoard = dynamic(() =>
  import("./semester-board").then((m) => m.SemesterBoard),
);
const RequirementMap = dynamic(() =>
  import("./requirement-map").then((m) => m.RequirementMap),
);
const SampleGallery = dynamic(() =>
  import("./sample-gallery").then((m) => m.SampleGallery),
);
export function PlanningWorkspace() {
  const { locale } = usePreferences();
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [plan, setPlan] = useState<Plan>(emptyPlan);
  const [tab, setTab] = useState<"board" | "map" | "official" | "import">(
    "board",
  );
  const [campus, setCampus] = useState("COL"),
    [catalogTerm, setCatalogTerm] = useState("");
  const [ready, setReady] = useState(false),
    [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [progress, setProgress] = useState(""),
    [storageError, setStorageError] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    profile = useRef<ImportProfile | null>(null);
  const guard = useRef(new ImportGuard());
  const loadBlocked = useRef(false);
  const [inspected, setInspected] = useState<{
    subject: string;
    number: string;
  } | null>(null);
  const fingerprint = JSON.stringify(plan);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const value = loadPlan(localStorage);
        if (value) {
          setPlan(value);
          setSaved(JSON.stringify(value));
        }
      } catch {
        loadBlocked.current = true;
        setStorageError(true);
      }
      setReady(true);
    });
    const current = guard.current;
    return () => {
      active = false;
      current.invalidate();
    };
  }, []);
  useEffect(() => {
    if (!ready || busy || loadBlocked.current || fingerprint === saved) return;
    const timer = setTimeout(() => {
      try {
        savePlan(localStorage, plan);
        setSaved(fingerprint);
        setStorageError(false);
      } catch {
        setStorageError(true);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [plan, fingerprint, ready, busy, saved]);
  useDraftGuard(
    busy || (ready && !!plan.documents.length && fingerprint !== saved),
  );
  function update(fn: (p: Plan) => Plan) {
    guard.current.invalidate();
    setBusy(false);
    setPlan((p) => pruneAllocations(fn(p)));
  }
  async function importFiles(files: File[]) {
    if (!files.length) return;
    const token = guard.current.start(),
      choice = profile.current ? importProfile(profile.current) : null;
    profile.current = null;
    setBusy(true);
    setMessage("");
    try {
      const result = await importPlanningFiles(files, {
        existing: plan,
        replace: false,
        signal: token.signal,
        extract: async (file) =>
          (
            await extractPlan(
              file as File,
              choice?.source ?? "auto",
              token.signal,
              choice?.origin ?? "export",
              choice?.auditMode ?? "unknown",
            )
          ).plan,
        progress: (done, total) => {
          if (guard.current.current(token.generation))
            setProgress(`${done}/${total}`);
        },
      });
      if (!guard.current.current(token.generation)) return;
      setPlan(result.plan);
      if (result.imported) setTab("board");
      setMessage(
        result.imported
          ? t(
              `${result.imported} reports imported. Your plan is ready.`,
              `已导入 ${result.imported} 份报告，课程规划已生成。`,
            ) +
              (result.failed
                ? t(
                    ` ${result.failed} files could not be read.`,
                    ` ${result.failed} 个文件无法读取。`,
                  )
                : "")
          : t(
              "No academic records found. Choose a BDP text PDF or a plan backup.",
              "未找到学业记录，请选择 BDP 文本 PDF 或规划备份。",
            ),
      );
    } catch {
      if (guard.current.current(token.generation))
        setMessage(
          t(
            "Import failed. Use up to 12 files, 60 MB total; each PDF must be under 20 MB.",
            "导入失败。每次最多 12 个文件、合计 60 MB，单份 PDF 不超过 20 MB。",
          ),
        );
    } finally {
      if (guard.current.current(token.generation)) {
        setBusy(false);
        setProgress("");
      }
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  function exportBackup() {
    const url = URL.createObjectURL(
      new Blob([serializePlan(plan)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "course-atlas-plan.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  function addCourse(code: { subject: string; number: string }) {
    try {
      const next = addPlanningCourse(plan, code, nextSemester(), browserUuid);
      update(() => next);
      setTab("board");
    } catch {
      setMessage(
        t(
          "This course is already completed or in progress.",
          "这门课程已经完成或正在修读。",
        ),
      );
    }
  }
  const rows = boardCourses(plan),
    counts = { completed: 0, "in-progress": 0, planned: 0, unknown: 0 };
  rows.forEach((r) => counts[r.course.status]++);
  return (
    <PlanningCatalogProvider campus={campus} term={catalogTerm}>
      <div className={`${styles.page} rr-block`}>
        <AppHeader active="planning" />
        <main className={styles.main}>
          <header className={styles.hero}>
            <div>
              <span className={styles.eyebrow}>DEGREE PLANNER</span>
              <h1>{t("Plan your path", "规划你的学业路径")}</h1>
              <p>
                {t(
                  "Your progress and every semester, together.",
                  "学业进度与每个学期，都在这里。",
                )}
              </p>
            </div>
            <div className={styles.globalActions}>
              <span>
                <ShieldCheck size={15} />
                {storageError
                  ? t("Local save unavailable", "本地保存不可用")
                  : saved === fingerprint
                    ? t("Saved on this device", "已自动保存到此设备")
                    : t("Private workspace", "私密工作区")}
              </span>
              <button onClick={exportBackup} disabled={!plan.documents.length}>
                <Download size={16} />
                {t("Backup", "备份")}
              </button>
              <button
                className={styles.primary}
                disabled={busy}
                onClick={() => {
                  profile.current = null;
                  fileInput.current?.click();
                }}
              >
                <FileUp size={16} />
                {busy ? progress : t("Import BDP PDFs", "导入 BDP PDF")}
              </button>
            </div>
          </header>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.json"
            multiple
            hidden
            aria-label={t("Import BDP reports", "导入 BDP 报告")}
            onChange={(e) => void importFiles(Array.from(e.target.files ?? []))}
          />
          {busy && (
            <div className={styles.notice} role="status">
              {t("Reading reports on your device…", "正在此设备上读取报告…")}{" "}
              {progress}
              <button
                onClick={() => {
                  guard.current.invalidate();
                  setBusy(false);
                }}
              >
                {t("Cancel", "取消")}
              </button>
            </div>
          )}
          {message && (
            <p className={styles.notice} role="status">
              {message}
            </p>
          )}
          {storageError && (
            <p role="alert" className={styles.notice}>
              {t(
                "Your browser could not save this plan. Export a backup to keep your changes.",
                "浏览器暂时无法保存规划，请导出备份保留修改。",
              )}
            </p>
          )}
          <nav
            className={styles.workspaceNav}
            aria-label={t("Planning views", "规划视图")}
          >
            <div>
              {(
                [
                  {
                    id: "board",
                    en: "Plans",
                    zh: "学期规划",
                    Icon: CalendarDays,
                  },
                  {
                    id: "map",
                    en: "Progress",
                    zh: "学业进度",
                    Icon: GitBranch,
                  },
                  {
                    id: "official",
                    en: "Four-year examples",
                    zh: "四年示例",
                    Icon: BookOpen,
                  },
                  {
                    id: "import",
                    en: "Reports",
                    zh: "导入与报告",
                    Icon: FileUp,
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                >
                  <item.Icon size={17} />
                  {t(item.en, item.zh)}
                </button>
              ))}
            </div>
            <div className={styles.catalogCompact}>
              <select
                aria-label={t("Campus", "校区")}
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
              >
                {[
                  ["COL", "Columbus"],
                  ["MNS", "Mansfield"],
                  ["LMA", "Lima"],
                  ["MRN", "Marion"],
                  ["NWK", "Newark"],
                  ["WST", "Wooster"],
                ].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <CatalogTermSelect
                value={catalogTerm}
                onChange={setCatalogTerm}
                locale={locale}
              />
            </div>
          </nav>
          {!!rows.length && tab === "board" && (
            <section
              className={styles.overview}
              aria-label={t("Plan overview", "规划概览")}
            >
              <div className={styles.programNames}>
                {Array.from(
                  new Map(
                    [...plan.programs.filter((p) => p.code)]
                      .sort(
                        (a, b) =>
                          (a.title?.length ?? 0) - (b.title?.length ?? 0),
                      )
                      .filter(
                        (p) =>
                          p.code &&
                          plan.requirements.some((r) => r.programId === p.id),
                      )
                      .map((p) => [p.code, p]),
                  ).values(),
                )
                  .slice(0, 4)
                  .map((p) => (
                    <span key={p.code}>
                      {p.title ?? p.code}
                      <small>{p.appliedVersion}</small>
                    </span>
                  ))}
              </div>
              <div className={styles.progressTrack}>
                {(
                  ["completed", "in-progress", "planned", "unknown"] as const
                ).map((status) => (
                  <span
                    key={status}
                    data-status={status}
                    style={{
                      width: `${(counts[status] / Math.max(1, rows.length)) * 100}%`,
                    }}
                  />
                ))}
              </div>
              <div className={styles.progressLegend}>
                {(
                  [
                    ["completed", "Completed", "已完成"],
                    ["in-progress", "In progress", "正在修读"],
                    ["planned", "Planned", "已安排"],
                  ] as const
                ).map(([key, en, zh]) => (
                  <span key={key} data-status={key}>
                    <i />
                    {counts[key]} {t(en, zh)}
                  </span>
                ))}
              </div>
            </section>
          )}
          {tab === "board" && (
            <SemesterBoard
              plan={plan}
              locale={locale}
              update={update}
              onReview={() => setTab("import")}
            />
          )}
          {tab === "map" && (
            <RequirementMap
              plan={plan}
              locale={locale}
              addCourse={addCourse}
              inspectCourse={setInspected}
              onReview={() => setTab("import")}
            />
          )}
          <WorkspaceDialog
            open={!!inspected}
            onOpenChange={(open) => {
              if (!open) setInspected(null);
            }}
            title={t("Course details", "课程详情")}
            description={
              inspected ? `${inspected.subject} ${inspected.number}` : ""
            }
            closeLabel={t("Close", "关闭")}
            guard={false}
          >
            {inspected && (
              <CourseInspector
                code={inspected}
                plan={plan}
                locale={locale}
                back={() => setInspected(null)}
                add={(course) => {
                  addCourse(course);
                  setInspected(null);
                }}
                inspect={setInspected}
              />
            )}
          </WorkspaceDialog>
          {tab === "official" && (
            <SampleGallery locale={locale} addCourse={addCourse} />
          )}
          {tab === "import" && (
            <div className={styles.importPage}>
              <ImportGuide
                plan={plan}
                locale={locale}
                choose={(value) => {
                  profile.current = value;
                  fileInput.current?.click();
                }}
              />
              <div className={styles.privacy}>
                <ShieldCheck size={22} />
                <div>
                  <h2>
                    {t("Import, then start planning", "导入后，直接开始规划")}
                  </h2>
                  <p>
                    {t(
                      "Reports are read locally. Names, student identifiers, email addresses and raw PDFs are not saved. Academic records stay in your browser; backups contain the structured plan.",
                      "报告在本地读取。姓名、学号、邮箱和原始 PDF 不会保存。学业记录保存在浏览器内，备份仅包含结构化规划。",
                    )}
                  </p>
                </div>
              </div>
              <div className={styles.reportList}>
                {plan.documents.map((document, i) => (
                  <article key={document.id}>
                    <Check size={18} />
                    <div>
                      <strong>
                        {document.source} ·{" "}
                        {document.auditMode === "unknown"
                          ? t("Plan", "计划")
                          : document.auditMode}
                      </strong>
                      <span>
                        {t("Report", "报告")} {i + 1} ·{" "}
                        {plan.semesters
                          .filter((s) => s.documentId === document.id)
                          .reduce((n, s) => n + s.courses.length, 0)}{" "}
                        {t("academic entries", "项学业记录")}
                      </span>
                    </div>
                    <button
                      onClick={() =>
                        update((p) => removeSnapshot(p, document.id))
                      }
                    >
                      {t("Remove", "移除")}
                    </button>
                  </article>
                ))}
              </div>
              {!!plan.documents.length && (
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        t(
                          "Clear the plan saved on this device? Export a backup first if needed.",
                          "清除此设备上的规划？如需保留，请先导出备份。",
                        ),
                      )
                    ) {
                      guard.current.invalidate();
                      setBusy(false);
                      localStorage.removeItem(PLAN_STORAGE_KEY);
                      setPlan(emptyPlan());
                      setSaved("");
                    }
                  }}
                >
                  {t("Clear local plan", "清除本地规划")}
                </button>
              )}
            </div>
          )}
        </main>
        <AppFooter />
      </div>
    </PlanningCatalogProvider>
  );
}

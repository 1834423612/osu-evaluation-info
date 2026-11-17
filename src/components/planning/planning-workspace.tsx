"use client";
import { trackUmamiEvent } from "@/components/analytics/umami-analytics";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  Download,
  FileUp,
  ShieldCheck,
  CalendarDays,
  GitBranch,
  BookOpen,
  Check,
  EyeOff,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { usePreferences } from "@/hooks/use-preferences";
import { useDraftGuard } from "@/components/forms/draft-guard";
import { text } from "@/lib/i18n";
import { emptyPlan, serializePlan, type Plan } from "@/lib/planning/model";
import { extractPlan } from "@/lib/planning/pdf";
import { pruneAllocations, removeSnapshot } from "@/lib/planning/snapshots";
import { importPlanningFiles } from "@/lib/planning/batch-import";
import { readPlanBackup } from "@/lib/planning/backup";
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

import { CourseInspector } from "./course-inspector";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import {
  planningScope,
  subscribePlanningScope,
} from "@/lib/planning/client-sync";
import { usePlanningWorkspace } from "./use-planning-workspace";
import { CloudBackup } from "./cloud-backup";
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
  const account = useSyncExternalStore(
    subscribePlanningScope,
    planningScope,
    () => null,
  );
  return <PlanningWorkspaceBody key={account ?? "guest"} account={account} />;
}
function PlanningWorkspaceBody({ account }: { account: string | null }) {
  const { locale } = usePreferences();
  const t = (en: string, zh: string) => text(locale, en, zh);
  const { plan, setPlan, ready, saved, storageError } =
    usePlanningWorkspace(account);
  const [tab, setTab] = useState<"board" | "map" | "official" | "import">(
    "board",
  );
  const [catalogTerm, setCatalogTerm] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");
  const [backup, setBackup] = useState<Plan | null>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null),
    profile = useRef<ImportProfile | null>(null);
  const guard = useRef(new ImportGuard());
  const [inspected, setInspected] = useState<{
    subject: string;
    number: string;
  } | null>(null);
  const fingerprint = JSON.stringify(plan);
  useEffect(() => {
    const current = guard.current;
    return () => current.invalidate();
  }, []);
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
      trackUmamiEvent("planning_import", {
        area: "planning_reports",
        operation: "pdf",
        status: result.imported
          ? result.failed
            ? "partial"
            : "success"
          : "empty",
        count: result.imported,
        path: "/planning",
      });
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
        trackUmamiEvent("planning_import", {
          area: "planning_reports",
          operation: "pdf",
          status: "error",
          path: "/planning",
        });
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
  async function previewBackup(file?: File) {
    if (!file) return;
    const token = guard.current.start();
    setMessage("");
    try {
      const incoming = await readPlanBackup(file, token.signal);
      if (guard.current.current(token.generation)) setBackup(incoming);
    } catch {
      if (guard.current.current(token.generation))
        setMessage(
          t(
            "Invalid planning backup. Choose an exported JSON file under 4 MB.",
            "规划备份无效，请选择本站导出的 JSON 文件，大小不超过 4 MB。",
          ),
        );
    } finally {
      if (backupInput.current) backupInput.current.value = "";
    }
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
    counts = {
      completed: 0,
      "in-progress": 0,
      planned: 0,
      unknown: 0,
      withdrawn: 0,
      dropped: 0,
      failed: 0,
    };
  rows.forEach((r) => counts[r.course.status]++);
  return (
    <PlanningCatalogProvider campus="COL" term={catalogTerm}>
      <div className={`${styles.page} rr-block`} data-analytics-area="planning">
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
              <button
                data-analytics-action="planning_backup_export"
                onClick={exportBackup}
                disabled={!ready}
              >
                <Download size={16} />
                {t("Export backup", "导出备份")}
              </button>
              <button
                disabled={!ready || busy}
                data-analytics-action="planning_backup_import"
                onClick={() => backupInput.current?.click()}
              >
                <FileUp size={16} />
                {t("Import backup", "导入备份")}
              </button>
              <button
                className={styles.primary}
                data-analytics-action="planning_pdf_import"
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
            accept=".pdf"
            multiple
            hidden
            aria-label={t("Import BDP reports", "导入 BDP 报告")}
            onChange={(e) => void importFiles(Array.from(e.target.files ?? []))}
          />
          <input
            ref={backupInput}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label={t("Import planning backup", "导入规划备份")}
            onChange={(e) => void previewBackup(e.target.files?.[0])}
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
                  data-analytics-action="planning_view"
                  data-analytics-label={item.id}
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => setTab(item.id)}
                >
                  <item.Icon size={17} />
                  {t(item.en, item.zh)}
                </button>
              ))}
            </div>
          </nav>
          {!!rows.length && tab === "board" && (
            <section
              className={styles.overview}
              aria-label={t("Plan overview", "规划概览")}
            >
              <div className={styles.programNames}>
                {Array.from(
                  plan.programs
                    .filter((p) => p.code)
                    .reduce((programs, program) => {
                      const previous = programs.get(program.code!);
                      programs.set(program.code!, {
                        ...program,
                        appliedVersion:
                          program.appliedVersion ??
                          previous?.appliedVersion ??
                          null,
                        catalogTerm:
                          program.catalogTerm ?? previous?.catalogTerm ?? null,
                        declaration:
                          program.declaration === "unknown"
                            ? (previous?.declaration ?? "unknown")
                            : program.declaration,
                      });
                      return programs;
                    }, new Map<string, Plan["programs"][number]>())
                    .values(),
                )
                  .filter((p) => !plan.hiddenPrograms?.includes(p.code!))
                  .map((p) => (
                    <div key={p.code} className={styles.programLine}>
                      <BookOpen size={16} />
                      <span>
                        <strong>{p.title ?? p.code}</strong>
                        {p.appliedVersion && (
                          <small>Applied Version {p.appliedVersion}</small>
                        )}
                      </span>
                      {p.declaration === "undeclared" && (
                        <span className={styles.targetBadge}>
                          {t("Not declared", "目标专业 · 未正式注册")}
                        </span>
                      )}
                      <button
                        aria-label={`${t("Hide program", "隐藏专业")} ${p.title ?? p.code}`}
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            hiddenPrograms: [
                              ...(current.hiddenPrograms ?? []),
                              p.code!,
                            ],
                          }))
                        }
                      >
                        <EyeOff size={14} />
                      </button>
                    </div>
                  ))}
                {!!plan.hiddenPrograms?.length && (
                  <ChoiceSelect
                    aria-label={t("Show hidden programs", "显示已隐藏专业")}
                    value=""
                    onValueChange={(code) =>
                      update((current) => ({
                        ...current,
                        hiddenPrograms: current.hiddenPrograms?.filter(
                          (c) => c !== code,
                        ),
                      }))
                    }
                  >
                    <option value="">
                      {t("Show hidden program…", "恢复显示专业…")}
                    </option>
                    {plan.hiddenPrograms.map((code) => (
                      <option key={code} value={code}>
                        {plan.programs.find((p) => p.code === code)?.title ??
                          code}
                      </option>
                    ))}
                  </ChoiceSelect>
                )}
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
              onCatalogTermChange={setCatalogTerm}
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
            closeOnly
            wide
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
                      "Reports are read locally. Names, student identifiers, email addresses and raw PDFs are removed from the saved plan. Signed-in accounts sync structured plans automatically. Reusable program requirements are archived without student records.",
                      "报告在本地读取，保存时移除姓名、学号、邮箱和原始 PDF。登录后自动同步结构化规划，并自动归档去除个人修读记录的通用专业要求。",
                    )}
                  </p>
                </div>
              </div>
              <CloudBackup account={account} locale={locale} />
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
                <button onClick={() => setConfirmClear(true)}>
                  {account
                    ? t("Clear account plan", "清除账号规划")
                    : t("Clear local plan", "清除本地规划")}
                </button>
              )}
            </div>
          )}
        </main>
        <WorkspaceDialog
          open={backup !== null}
          onOpenChange={(open) => {
            if (!open) setBackup(null);
          }}
          title={t("Restore planning backup", "恢复规划备份")}
          description={t(
            "Restoring replaces this plan, including semesters, campuses, groups and section choices. Signed-in accounts sync the restored plan automatically.",
            "恢复后将替换当前规划，包括学期、校区、课程组与班次选择。登录后会自动同步恢复后的规划。",
          )}
          closeLabel={t("Close", "关闭")}
          guard={false}
          closeOnly
        >
          <p className={styles.backupSummary}>
            {backup?.documents.length ?? 0} {t("reports", "份报告")} ·{" "}
            {backup ? boardCourses(backup).length : 0}{" "}
            {t("planning entries", "项规划课程与占位项")}
          </p>
          <div className={styles.globalActions}>
            <Button variant="outline" onClick={exportBackup}>
              <Download size={16} />
              {t("Back up current plan", "备份当前规划")}
            </Button>
            <Button
              onClick={() => {
                if (!backup) return;
                update(() => backup);
                setBackup(null);
                setTab("board");
                setMessage(t("Planning backup restored.", "规划备份已恢复。"));
              }}
            >
              {t("Restore this backup", "恢复此备份")}
            </Button>
          </div>
        </WorkspaceDialog>
        <WorkspaceDialog
          open={confirmClear}
          onOpenChange={setConfirmClear}
          title={
            account
              ? t("Clear account plan?", "清除账号规划？")
              : t("Clear local plan?", "清除本地规划？")
          }
          description={t(
            account
              ? "This deletion syncs to your other devices. Export a backup first if needed."
              : "Export a backup first if you want to keep this plan.",
            account
              ? "删除将同步到其他设备，如需保留请先导出备份。"
              : "如需保留，请先导出备份。",
          )}
          closeLabel={t("Cancel", "取消")}
          guard={false}
        >
          <Button
            variant="destructive"
            onClick={() => {
              guard.current.invalidate();
              setBusy(false);
              setPlan(emptyPlan());
              setConfirmClear(false);
            }}
          >
            {t("Clear plan", "清除规划")}
          </Button>
        </WorkspaceDialog>
        <AppFooter />
      </div>
    </PlanningCatalogProvider>
  );
}

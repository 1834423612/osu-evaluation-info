"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  Plus,
  CalendarDays,
  GripVertical,
  Search,
  SlidersHorizontal,
  GitBranch,
  Sparkles,
  X,
  Check,
  ArrowRight,
} from "lucide-react";
import type { Plan } from "@/lib/planning/model";
import {
  catalogKey,
  planningCredits,
  creditLabel,
  type PlanningCourseDetail,
} from "@/lib/planning/course-catalog";
import {
  boardCourses,
  addPlanningCourse,
  semesterLabel,
  nextSemester,
  type BoardCourse,
} from "@/lib/planning/workspace";
import { placeCourse, termOrder } from "@/lib/planning/schedule";
import { applyRecommendationBundle } from "@/lib/planning/recommendation";
import { browserUuid } from "@/lib/uuid";
import { text, type Locale } from "@/lib/i18n";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { usePlanningCourse, usePlanningCatalog } from "./course-catalog";
import { CourseInspector } from "./course-inspector";
import { PlanningSearch } from "./planning-search";
import styles from "./semester-board.module.css";
const RequirementMap = dynamic(() =>
  import("./requirement-map").then((m) => m.RequirementMap),
);
const NextTerm = dynamic(() => import("./next-term").then((m) => m.NextTerm));
const subscribeNarrow = (notify: () => void) => {
  const media = window.matchMedia("(max-width: 1050px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const isNarrow = () => window.matchMedia("(max-width: 1050px)").matches;

function CourseCard({
  row,
  locale,
  terms,
  move,
  inspect,
  loaded,
  remove,
}: {
  row: BoardCourse;
  locale: Locale;
  terms: string[];
  move: (id: string, term: string) => void;
  inspect: (code: { subject: string; number: string }) => void;
  loaded: (key: string, detail: PlanningCourseDetail) => void;
  remove: (id: string) => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const c = row.course;
  const lookup = usePlanningCourse(c.subject, c.number);
  const context = usePlanningCatalog();
  const key = catalogKey({
    subject: c.subject ?? "",
    number: c.number ?? "",
    campus: context.campus,
    term: context.term,
  });
  useEffect(() => {
    if (lookup.detail) loaded(key, lookup.detail);
  }, [lookup.detail, key, loaded]);
  const credits = planningCredits(c, lookup.detail);
  const locked =
    row.protectedRecord ||
    c.status === "completed" ||
    c.status === "in-progress" ||
    row.term === "credit" ||
    !c.id;
  return (
    <article
      className={styles.card}
      draggable={!locked}
      data-status={c.status}
      data-placeholder={c.kind === "placeholder"}
      onDragStart={(e) => {
        if (c.id) {
          e.dataTransfer.setData("text/plain", c.id);
          e.dataTransfer.effectAllowed = "move";
        }
      }}
    >
      <div className={styles.cardTop}>
        <button
          className={styles.courseCode}
          disabled={!c.subject || !c.number}
          onClick={() => inspect({ subject: c.subject!, number: c.number! })}
        >
          <b>{c.subject ?? t("Requirement", "要求")}</b> {c.number}
        </button>
        <span
          className={styles.creditPill}
          title={
            credits.source === "catalog"
              ? t("Catalog credits", "目录学分")
              : t("Imported record", "导入记录")
          }
        >
          {creditLabel(credits.range) ||
            (lookup.status === "loading" ? "…" : "—")}
          {credits.range ? " " + t("cr", "学分") : ""}
        </span>
      </div>
      <p className={styles.courseTitle}>
        {lookup.detail?.course.title ??
          (c.kind === "placeholder"
            ? t("Choose a course for this requirement", "为此要求选择一门课")
            : lookup.status === "loading"
              ? t("Loading course details…", "正在查询课程详情…")
              : t("Open course details", "查看课程详情"))}
      </p>
      <div className={styles.cardFooter}>
        <span className={styles.status} data-status={c.status}>
          {locked ? <Check size={12} /> : <GripVertical size={12} />}
          {c.kind === "placeholder"
            ? t("Placeholder", "占位项")
            : t(
                c.status,
                {
                  planned: "计划",
                  completed: "已完成",
                  "in-progress": "进行中",
                  unknown: "待核对",
                }[c.status],
              )}
        </span>
        {row.protectedRecord && c.status === "planned" && (
          <span>{t("Recorded in another source", "其他来源已有修读记录")}</span>
        )}
        {!locked && (
          <select
            aria-label={`${t("Move", "移动")} ${c.subject ?? ""} ${c.number ?? t("placeholder", "占位项")}`}
            value={row.term}
            onChange={(e) => move(c.id!, e.target.value)}
          >
            <option value="unassigned">
              {semesterLabel("unassigned", locale)}
            </option>
            {terms.map((term) => (
              <option key={term} value={term}>
                {semesterLabel(term, locale)}
              </option>
            ))}
          </select>
        )}
        {row.source?.source === "manual" && c.id && (
          <button
            aria-label={`${t("Remove", "移除")} ${c.subject} ${c.number}`}
            onClick={() => remove(c.id!)}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {lookup.status === "error" && (
        <button className={styles.retry} onClick={lookup.retry}>
          {t("Retry catalog", "重试目录查询")}
        </button>
      )}
    </article>
  );
}

export function SemesterBoard({
  plan,
  locale,
  update,
  onReview,
}: {
  plan: Plan;
  locale: Locale;
  update: (fn: (p: Plan) => Plan) => void;
  onReview: () => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const context = usePlanningCatalog();
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const [drawer, setDrawer] = useState(false);
  const [panel, setPanel] = useState<"requirements" | "search" | "suggestions">(
    "requirements",
  );
  const [selected, setSelected] = useState<{
    subject: string;
    number: string;
  } | null>(null);
  const [filter, setFilter] = useState("");
  const [details, setDetails] = useState<Record<string, PlanningCourseDetail>>(
    {},
  );
  const [targetTerm, setTargetTerm] = useState(nextSemester);
  const [season, setSeason] = useState("Autumn");
  const [year, setYear] = useState(new Date().getFullYear());
  const [ceiling, setCeiling] = useState(18);
  const [message, setMessage] = useState("");
  const all = boardCourses(plan);
  const rows = all.filter((r) =>
    `${r.course.subject ?? ""} ${r.course.number ?? ""}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  const terms = [
    ...new Set([
      ...plan.schedule.terms,
      ...all
        .filter((r) => !["credit", "unassigned"].includes(r.term))
        .map((r) => r.term),
      targetTerm,
    ]),
  ].sort(termOrder);
  const loaded = useCallback(
    (key: string, detail: PlanningCourseDetail) =>
      setDetails((current) =>
        current[key] === detail ? current : { ...current, [key]: detail },
      ),
    [],
  );
  const inspect = (code: { subject: string; number: string }) => {
    setSelected(code);
    setDrawer(true);
  };
  function add(code: { subject: string; number: string }) {
    try {
      const next = addPlanningCourse(plan, code, targetTerm, browserUuid);
      update(() => next);
      setMessage(
        `${code.subject} ${code.number} · ${semesterLabel(targetTerm, locale)} · ${t("Added", "已加入")}`,
      );
    } catch {
      setMessage(
        t(
          "This course already has completed/in-progress credit, or the plan is at capacity. Check its source record.",
          "这门课程已有完成／进行中记录，或规划已达容量上限。请核对来源记录。",
        ),
      );
    }
  }
  function move(id: string, term: string) {
    try {
      const next = placeCourse(plan, id, term === "unassigned" ? null : term);
      update(() => next);
      setMessage(t("Semester updated.", "已更新学期。"));
    } catch {
      setMessage(
        t(
          "Check this course's source before moving it.",
          "移动前请核对这门课程的来源。",
        ),
      );
    }
  }
  function remove(id: string) {
    update((p) => ({
      ...p,
      semesters: p.semesters.map((s) => ({
        ...s,
        courses: s.courses.filter((c) => c.id !== id),
      })),
    }));
  }
  const assistant = (
    <div className={styles.assistantBody}>
      <label className={styles.target}>
        {t("Add courses to", "添加课程到")}
        <select
          value={targetTerm}
          onChange={(e) => setTargetTerm(e.target.value)}
        >
          {terms.map((term) => (
            <option key={term} value={term}>
              {semesterLabel(term, locale)}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <CourseInspector
          code={selected}
          plan={plan}
          locale={locale}
          back={() => setSelected(null)}
          add={add}
          inspect={inspect}
        />
      ) : (
        <>
          <div
            className={styles.assistantTabs}
            aria-label={t("Planning tools", "选课工具")}
          >
            {(
              [
                {
                  id: "requirements",
                  title: t("Requirements", "学业要求"),
                  Icon: GitBranch,
                },
                { id: "search", title: t("Search", "搜索课程"), Icon: Search },
                {
                  id: "suggestions",
                  title: t("Recommend", "推荐课程"),
                  Icon: Sparkles,
                },
              ] as const
            ).map(({ id, title, Icon }) => (
              <button
                key={id}
                aria-pressed={panel === id}
                onClick={() => setPanel(id)}
              >
                <Icon size={15} />
                {title}
              </button>
            ))}
          </div>
          {panel === "requirements" && (
            <RequirementMap
              plan={plan}
              locale={locale}
              addCourse={add}
              onReview={onReview}
              inspectCourse={inspect}
              compact
            />
          )}
          {panel === "suggestions" && (
            <NextTerm
              plan={plan}
              locale={locale}
              onReview={onReview}
              initialTarget={targetTerm}
              onTargetChange={setTargetTerm}
              compact
              apply={(items, term) => {
                update((p) =>
                  applyRecommendationBundle(p, items, term, browserUuid),
                );
                setTargetTerm(term);
                setMessage(t("Suggested courses added.", "推荐课程已加入。"));
              }}
            />
          )}
          {panel === "search" && (
            <PlanningSearch
              key={context.campus + "|" + context.term}
              locale={locale}
              inspect={inspect}
              add={add}
            />
          )}
        </>
      )}
      <p className={styles.panelMessage} role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
  return (
    <section
      className={styles.root}
      aria-label={t("Semester planner", "学期规划看板")}
    >
      <div className={styles.heading}>
        <div>
          <h2>{t("Your semester plan", "我的学期规划")}</h2>
          <p>
            {t(
              "Arrange courses here. Keep requirements and course details beside your plan.",
              "直接安排课程，随时查看旁边的学业要求与先修条件。",
            )}
          </p>
        </div>
        <button
          className={styles.primary}
          onClick={() => {
            setSelected(null);
            setPanel("search");
            setDrawer(true);
          }}
        >
          <Plus size={17} />
          {t("Add courses", "添加课程")}
        </button>
      </div>
      <div className={styles.layout}>
        <div className={styles.planner}>
          <div className={styles.toolbar}>
            <label className={styles.filter}>
              <Search size={16} />
              <input
                aria-label={t("Filter planned courses", "筛选已规划课程")}
                placeholder={t("Find in my plan", "在规划中查找")}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
            <details className={styles.settings}>
              <summary>
                <SlidersHorizontal size={16} />
                {t("Semester settings", "学期设置")}
              </summary>
              <div>
                <label>
                  {t("Credit ceiling", "学分上限")}
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={ceiling}
                    onChange={(e) => setCeiling(Number(e.target.value))}
                  />
                </label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const term = season + year;
                    if (
                      !/^(Autumn|Spring|Summer)20\d{2}$/.test(term) ||
                      plan.schedule.terms.length >= 24
                    )
                      return;
                    update((p) => ({
                      ...p,
                      schedule: {
                        ...p.schedule,
                        terms: [...new Set([...p.schedule.terms, term])].sort(
                          termOrder,
                        ),
                      },
                    }));
                    setTargetTerm(term);
                  }}
                >
                  <label>
                    {t("Season", "季节")}
                    <select
                      value={season}
                      onChange={(e) => setSeason(e.target.value)}
                    >
                      {["Autumn", "Spring", "Summer"].map((s) => (
                        <option key={s} value={s}>
                          {t(
                            s,
                            { Autumn: "秋季", Spring: "春季", Summer: "夏季" }[
                              s
                            ]!,
                          )}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Year", "年份")}
                    <input
                      type="number"
                      min={2000}
                      max={2099}
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                    />
                  </label>
                  <button>
                    <Plus size={15} />
                    {t("Add semester", "添加学期")}
                  </button>
                </form>
              </div>
            </details>
            <button
              className={styles.mobileTools}
              onClick={() => {
                setSelected(null);
                setPanel("requirements");
                setDrawer(true);
              }}
            >
              <GitBranch size={16} />
              {t("Requirements", "学业要求")}
            </button>
          </div>
          {!all.length && (
            <div className={styles.empty}>
              <CalendarDays size={28} />
              <h3>{t("Start with your BDP plan", "从 BDP 规划开始")}</h3>
              <p>
                {t(
                  "Import your courses or search to build your first semester.",
                  "导入已有课程，或通过搜索安排第一个学期。",
                )}
              </p>
              <button onClick={onReview}>
                {t("Import PDFs", "导入 PDF")}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          <div className={styles.board}>
            {[
              ...(rows.some((r) => r.term === "unassigned")
                ? ["unassigned"]
                : []),
              ...terms,
            ].map((term) => {
              const group = rows.filter((r) => r.term === term);
              const ranges = new Map<string, Set<string>>();
              group.forEach((r, index) => {
                const code =
                  r.course.subject && r.course.number
                    ? `${r.course.subject} ${r.course.number}`
                    : `placeholder-${index}`;
                const range = planningCredits(
                  r.course,
                  details[
                    catalogKey({
                      subject: r.course.subject ?? "",
                      number: r.course.number ?? "",
                      term: context.term,
                      campus: context.campus,
                    })
                  ],
                ).range;
                const values = ranges.get(code) ?? new Set<string>();
                values.add(JSON.stringify(range));
                ranges.set(code, values);
              });
              let min = 0,
                max = 0,
                pending = 0;
              for (const values of ranges.values()) {
                const range =
                  values.size === 1
                    ? (JSON.parse([...values][0]) as {
                        min: number;
                        max: number;
                      } | null)
                    : null;
                if (range) {
                  min += range.min;
                  max += range.max;
                } else pending++;
              }
              return (
                <section
                  key={term}
                  className={styles.column}
                  data-selected={targetTerm === term}
                  data-unassigned={term === "unassigned"}
                  aria-label={semesterLabel(term, locale)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    move(e.dataTransfer.getData("text/plain"), term);
                  }}
                >
                  <header className={styles.columnHead}>
                    <div>
                      <h3>{semesterLabel(term, locale)}</h3>
                      <p>
                        {group.length} {t("courses", "门课程")}
                      </p>
                    </div>
                    <span
                      className={styles.termCredits}
                      data-over={min > ceiling}
                    >
                      {creditLabel({ min, max })}
                      <small>
                        {pending
                          ? t("known credits", "已知学分")
                          : t("credits", "学分")}
                      </small>
                    </span>
                  </header>
                  <div className={styles.loadBar} aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.min(100, (min / Math.max(1, ceiling)) * 100)}%`,
                      }}
                      data-over={min > ceiling}
                    />
                  </div>
                  {pending > 0 && (
                    <small className={styles.pending}>
                      {pending} {t("credit values pending", "项学分待补充")}
                    </small>
                  )}
                  {min > ceiling && (
                    <small className={styles.pending}>
                      {t("Above your credit ceiling", "超过你的学分上限")}
                    </small>
                  )}
                  <div className={styles.columnCourses}>
                    {group.map((row, i) => (
                      <CourseCard
                        key={row.course.id ?? i}
                        row={row}
                        locale={locale}
                        terms={terms}
                        move={move}
                        inspect={inspect}
                        loaded={loaded}
                        remove={remove}
                      />
                    ))}
                    {!group.length && (
                      <div className={styles.dropHint}>
                        {t("Drop courses here", "拖入课程到此学期")}
                      </div>
                    )}
                  </div>
                  {term !== "unassigned" && (
                    <button
                      className={styles.addHere}
                      onClick={() => {
                        if (term !== "unassigned") setTargetTerm(term);
                        setSelected(null);
                        setPanel("search");
                        setDrawer(true);
                      }}
                    >
                      <Plus size={15} />
                      {t("Add a course", "添加课程")}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
          {rows.some((r) => r.term === "credit") && (
            <details className={styles.creditRecords}>
              <summary>
                {t("Transfer and exam records", "转学与考试记录")} ·{" "}
                {rows.filter((r) => r.term === "credit").length}
              </summary>
              <div className={styles.creditGrid}>
                {rows
                  .filter((r) => r.term === "credit")
                  .map((row, i) => (
                    <CourseCard
                      key={row.course.id ?? i}
                      row={row}
                      locale={locale}
                      terms={terms}
                      move={move}
                      inspect={inspect}
                      loaded={loaded}
                      remove={remove}
                    />
                  ))}
              </div>
            </details>
          )}
          <p className={styles.helper}>
            {t(
              "Credit totals are planning estimates from the selected catalog. Original imported credits remain in source review.",
              "学分汇总采用所选目录的规划估算。原始导入学分保留在来源核对中。",
            )}
          </p>
          <p role="status" aria-live="polite" className={styles.message}>
            {message}
          </p>
        </div>
        {narrow ? (
          <WorkspaceDialog
            open={drawer}
            onOpenChange={setDrawer}
            title={t("Course planning", "选课与要求")}
            description={semesterLabel(targetTerm, locale)}
            closeLabel={t("Close", "关闭")}
            guard={false}
          >
            {assistant}
          </WorkspaceDialog>
        ) : (
          <aside
            className={styles.assistant}
            aria-label={t("Course planning tools", "选课辅助工具")}
          >
            {assistant}
          </aside>
        )}
      </div>
    </section>
  );
}

"use client";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  closestCenter,
} from "@dnd-kit/core";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { CourseStatus } from "./course-status";
import { CatalogTermSelect } from "./catalog-term";
import dynamic from "next/dynamic";
import {
  Plus,
  CalendarDays,
  GripVertical,
  Search,
  GitBranch,
  Sparkles,
  X,
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
  semesterCampus,
  planningCampuses,
  removeEmptySemester,
} from "@/lib/planning/workspace";
import { placeCourse, termOrder } from "@/lib/planning/schedule";
import { applyRecommendationBundle } from "@/lib/planning/recommendation";
import { browserUuid } from "@/lib/uuid";
import { text, type Locale } from "@/lib/i18n";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import {
  PlanningCatalogProvider,
  usePlanningCourse,
  usePlanningCatalog,
} from "./course-catalog";
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
  choose,
}: {
  row: BoardCourse;
  locale: Locale;
  terms: string[];
  move: (id: string, term: string) => void;
  inspect: (code: { subject: string; number: string }) => void;
  loaded: (key: string, detail: PlanningCourseDetail) => void;
  remove: (id: string) => void;
  choose: (row: BoardCourse) => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const c = row.course;
  const lookup = usePlanningCourse(
    c.kind === "placeholder" ? null : c.subject,
    c.kind === "placeholder" ? null : c.number,
  );
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
    ["withdrawn", "dropped", "failed"].includes(c.status) ||
    row.protectedRecord ||
    c.status === "completed" ||
    c.status === "in-progress" ||
    row.term === "credit" ||
    !c.id;
  const reducedMotion = useReducedMotion();
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } =
    useDraggable({
      id: c.id ?? "record-" + c.subject + c.number,
      disabled: locked,
    });
  return (
    <motion.article
      ref={setNodeRef}
      layout={reducedMotion ? false : "position"}
      layoutId={c.id}
      transition={{ type: "spring", stiffness: 420, damping: 30, mass: 0.75 }}
      className={styles.card}
      data-status={c.status}
      data-dragging={isDragging}
      data-placeholder={c.kind === "placeholder"}
    >
      <div className={styles.cardTop}>
        <button
          className={styles.courseCode}
          disabled={c.kind !== "placeholder" && (!c.subject || !c.number)}
          onClick={() =>
            c.kind === "placeholder"
              ? choose(row)
              : inspect({ subject: c.subject!, number: c.number! })
          }
        >
          <b>
            {c.kind === "placeholder"
              ? c.subject
                ? `${c.subject} ${c.number}`
                : (c.title ?? t("Requirement placeholder", "学业要求占位符"))
              : `${c.subject} ${c.number}`}
          </b>
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
      {c.kind !== "placeholder" && (
        <p className={styles.courseTitle}>
          {lookup.detail?.course.title ??
            c.title ??
            (lookup.status === "loading"
              ? t("Loading course details…", "正在查询课程详情…")
              : t("Open course details", "查看课程详情"))}
        </p>
      )}
      {c.kind === "placeholder" && (
        <button
          className={styles.choosePlaceholder}
          onClick={() => choose(row)}
        >
          {t(
            "Select a course to fulfill this requirement",
            "点击选择实际课程，完成此项要求",
          )}{" "}
          <ArrowRight size={13} />
        </button>
      )}
      {(c.section || c.session) && (
        <small className={styles.courseTitle}>
          {c.section && `${t("Section", "班次")} ${c.section}`}
          {c.session && ` · Session ${c.session}`}
        </small>
      )}
      <div className={styles.cardFooter}>
        <CourseStatus
          status={c.kind === "placeholder" ? "placeholder" : c.status}
          locale={locale}
        />
        {c.repeated && <CourseStatus status="repeated" locale={locale} />}
        {!locked && (
          <button
            className={styles.dragHandle}
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            aria-label={`${t("Drag", "拖动")} ${c.subject ?? ""} ${c.number ?? c.title ?? ""}`}
          >
            <GripVertical size={15} />
          </button>
        )}
        {row.protectedRecord && c.status === "planned" && (
          <span>{t("Recorded in another source", "其他来源已有修读记录")}</span>
        )}
        {!locked && (
          <ChoiceSelect
            aria-label={`${t("Move", "移动")} ${c.subject ?? ""} ${c.number ?? t("placeholder", "占位项")}`}
            value={row.term}
            onValueChange={(value) => move(c.id!, value)}
          >
            <option value="unassigned">
              {semesterLabel("unassigned", locale)}
            </option>
            {terms.map((term) => (
              <option key={term} value={term}>
                {semesterLabel(term, locale)}
              </option>
            ))}
          </ChoiceSelect>
        )}
        {!locked && c.id && (
          <button
            aria-label={`${t("Remove", "移除")} ${c.title ?? `${c.subject} ${c.number}`}`}
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
    </motion.article>
  );
}

export function SemesterBoard({
  plan,
  locale,
  update,
  onReview,
  onCatalogTermChange,
}: {
  plan: Plan;
  locale: Locale;
  update: (fn: (p: Plan) => Plan) => void;
  onReview: () => void;
  onCatalogTermChange: (value: string) => void;
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
  const [searchQuery, setSearchQuery] = useState("");
  const [replacing, setReplacing] = useState<BoardCourse | null>(null);
  const [details, setDetails] = useState<Record<string, PlanningCourseDetail>>(
    {},
  );
  const [targetTerm, setTargetTerm] = useState(nextSemester);
  const ceiling = 18;
  const reducedMotion = useReducedMotion();
  const [dragged, setDragged] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor),
  );
  const [message, setMessage] = useState("");
  const all = boardCourses(plan);
  const rows = all.filter((r) =>
    `${r.course.subject ?? ""} ${r.course.number ?? ""} ${r.course.title ?? ""}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  const startYear = Math.min(
    new Date().getFullYear(),
    ...all
      .filter((r) => !["credit", "unassigned"].includes(r.term))
      .map(
        (r) =>
          Number(r.term.slice(-4)) -
          Number(r.term.startsWith("Spring") || r.term.startsWith("Summer")),
      ),
  );
  const defaultTerms = Array.from({ length: 4 }, (_, i) => [
    `Autumn${startYear + i}`,
    `Spring${startYear + i + 1}`,
  ]).flat();
  const terms = [
    ...new Set([
      ...defaultTerms,
      ...plan.schedule.terms,
      ...all
        .filter((r) => !["credit", "unassigned"].includes(r.term))
        .map((r) => r.term),
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
      if (replacing?.course.id)
        next.semesters = next.semesters.map((s) => ({
          ...s,
          courses: s.courses.filter((c) => c.id !== replacing.course.id),
        }));
      update(() => next);
      setReplacing(null);
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
  function choose(row: BoardCourse) {
    setReplacing(row);
    if (!["unassigned", "credit"].includes(row.term)) setTargetTerm(row.term);
    setSearchQuery(
      row.course.subject
        ? `${row.course.subject} ${row.course.number}`
        : (row.course.title ?? ""),
    );
    setSelected(null);
    setPanel("search");
    setDrawer(true);
  }
  const academicYears = [
    ...new Set(
      terms.map(
        (term) =>
          Number(term.slice(-4)) -
          Number(term.startsWith("Spring") || term.startsWith("Summer")),
      ),
    ),
  ].sort();
  const yearGroups = [
    ...(rows.some((r) => r.term === "unassigned")
      ? [{ year: 0, terms: ["unassigned"] }]
      : []),
    ...academicYears.map((year) => ({
      year,
      terms: terms.filter(
        (term) =>
          Number(term.slice(-4)) -
            Number(term.startsWith("Spring") || term.startsWith("Summer")) ===
          year,
      ),
    })),
  ];
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
      <div className={styles.contextBar}>
        <label className={styles.target}>
          {t("Add courses to", "添加课程到")}
          <ChoiceSelect
            value={targetTerm}
            onValueChange={(value) => setTargetTerm(value)}
          >
            {terms.map((term) => (
              <option key={term} value={term}>
                {semesterLabel(term, locale)}
              </option>
            ))}
          </ChoiceSelect>
        </label>
        <div className={styles.catalogOptions}>
          <CatalogTermSelect
            value={context.term}
            onChange={onCatalogTermChange}
            locale={locale}
          />
        </div>
      </div>
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
                  title: t("Remaining", "剩余要求"),
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
              searchRequirement={(title) => {
                setSearchQuery(title);
                setReplacing(null);
                setPanel("search");
              }}
              compact
              remainingOnly
            />
          )}
          {panel === "suggestions" && (
            <NextTerm
              inspect={inspect}
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
              key={context.campus + "|" + context.term + "|" + searchQuery}
              locale={locale}
              initialQuery={searchQuery}
              unavailable={all
                .filter(
                  (r) =>
                    r.course.status === "completed" ||
                    r.course.status === "in-progress",
                )
                .map((r) => `${r.course.subject} ${r.course.number}`)}
              requirementLabel={replacing?.course.title}
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
  const activeCourse = all.find((row) => row.course.id === dragged)?.course;
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={(args) => {
        const hits = pointerWithin(args);
        return args.pointerCoordinates ? hits : closestCenter(args);
      }}
      onDragStart={({ active }) => setDragged(String(active.id))}
      onDragCancel={() => setDragged(null)}
      onDragEnd={({ active, over }) => {
        setDragged(null);
        if (over) move(String(active.id), String(over.id));
      }}
    >
      <LayoutGroup>
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
                setReplacing(null);
                setSearchQuery("");
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
                {yearGroups.map(({ year, terms: yearTerms }) => (
                  <section className={styles.academicYear} key={year}>
                    <header className={styles.yearHeading}>
                      <h3>
                        {year
                          ? `${year} – ${year + 1}`
                          : t("To arrange", "待安排")}
                      </h3>
                      <span>
                        {rows.filter((r) => yearTerms.includes(r.term)).length}{" "}
                        {t("courses", "门课程")}
                      </span>
                    </header>
                    <div className={styles.yearTerms}>
                      {yearTerms.map((term) => {
                        const group = rows.filter((r) => r.term === term);
                        const ranges = new Map<string, Set<string>>();
                        group.forEach((r, index) => {
                          if (
                            ["withdrawn", "dropped", "failed"].includes(
                              r.course.status,
                            )
                          )
                            return;
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
                                campus: semesterCampus(plan, term),
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
                        const original = plan.semesters.find(
                          (s) =>
                            s.term?.replace(/ /g, "") === term &&
                            plan.documents.some(
                              (d) =>
                                d.id === s.documentId &&
                                d.source === "student-plan",
                            ),
                        );
                        return (
                          <TermColumn
                            key={term}
                            term={term}
                            className={styles.column}
                            data-selected={targetTerm === term}
                            data-unassigned={term === "unassigned"}
                            aria-label={semesterLabel(term, locale)}
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
                            {term !== "unassigned" && (
                              <div className={styles.termOptions}>
                                <ChoiceSelect
                                  aria-label={`${semesterLabel(term, locale)} ${t("campus", "校区")}`}
                                  value={semesterCampus(plan, term)}
                                  onValueChange={(campus) =>
                                    update((p) => ({
                                      ...p,
                                      schedule: {
                                        ...p.schedule,
                                        campuses: {
                                          ...p.schedule.campuses,
                                          [term]: campus as "COL",
                                        },
                                      },
                                    }))
                                  }
                                >
                                  {planningCampuses.map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </ChoiceSelect>
                                {term.startsWith("Summer") &&
                                  !all.some((r) => r.term === term) && (
                                    <button
                                      aria-label={t(
                                        "Remove empty summer",
                                        "收起空夏季",
                                      )}
                                      onClick={() => {
                                        update((p) =>
                                          removeEmptySemester(p, term),
                                        );
                                        if (targetTerm === term)
                                          setTargetTerm(
                                            `Spring${term.slice(-4)}`,
                                          );
                                      }}
                                    >
                                      <X size={14} />
                                    </button>
                                  )}
                              </div>
                            )}
                            <div className={styles.loadBar} aria-hidden="true">
                              <span
                                style={{
                                  width: `${Math.min(100, (min / Math.max(1, ceiling)) * 100)}%`,
                                }}
                                data-over={min > ceiling}
                              />
                            </div>
                            {pending > 0 &&
                              original?.reportedCredits != null && (
                                <small className={styles.pending}>
                                  {t("BDP export total", "BDP 导出时合计")} ·{" "}
                                  {original.reportedCredits}{" "}
                                  {t("credits", "学分")}
                                </small>
                              )}
                            {pending > 0 && (
                              <small className={styles.pending}>
                                {pending}{" "}
                                {t("credit values pending", "项学分待补充")}
                              </small>
                            )}
                            {min > ceiling && (
                              <small className={styles.pending}>
                                {t(
                                  "Above your credit ceiling",
                                  "超过你的学分上限",
                                )}
                              </small>
                            )}
                            <PlanningCatalogProvider
                              campus={semesterCampus(plan, term)}
                              term={context.term}
                            >
                              <div className={styles.columnCourses}>
                                {group.map((row, i) => (
                                  <CourseCard
                                    key={row.course.id ?? i}
                                    row={row}
                                    locale={locale}
                                    terms={terms}
                                    move={move}
                                    inspect={(code) => {
                                      if (term !== "unassigned")
                                        setTargetTerm(term);
                                      inspect(code);
                                    }}
                                    loaded={loaded}
                                    remove={remove}
                                    choose={choose}
                                  />
                                ))}
                                {!group.length && (
                                  <div className={styles.dropHint}>
                                    {t("Drop courses here", "拖入课程到此学期")}
                                  </div>
                                )}
                              </div>
                            </PlanningCatalogProvider>
                            {term !== "unassigned" && (
                              <button
                                className={styles.addHere}
                                onClick={() => {
                                  if (term !== "unassigned")
                                    setTargetTerm(term);
                                  setSelected(null);
                                  setPanel("search");
                                  setReplacing(null);
                                  setSearchQuery("");
                                  setDrawer(true);
                                }}
                              >
                                <Plus size={15} />
                                {t("Add a course", "添加课程")}
                              </button>
                            )}
                          </TermColumn>
                        );
                      })}
                      {!!year && !yearTerms.includes(`Summer${year + 1}`) && (
                        <button
                          className={styles.summer}
                          disabled={terms.length >= 24}
                          onClick={() => {
                            const term = `Summer${year + 1}`;
                            update((p) => ({
                              ...p,
                              schedule: {
                                ...p.schedule,
                                terms: [
                                  ...new Set([...p.schedule.terms, term]),
                                ],
                              },
                            }));
                            setTargetTerm(term);
                            setPanel("search");
                            setSelected(null);
                            setReplacing(null);
                            setSearchQuery("");
                            setDrawer(true);
                          }}
                        >
                          + {semesterLabel(`Summer${year + 1}`, locale)}
                        </button>
                      )}
                    </div>
                  </section>
                ))}
              </div>
              <button
                className={styles.addYear}
                disabled={terms.length >= 22}
                onClick={() => {
                  const year = academicYears.at(-1)! + 1;
                  update((p) => ({
                    ...p,
                    schedule: {
                      ...p.schedule,
                      terms: [
                        ...new Set([
                          ...p.schedule.terms,
                          ...terms,
                          `Autumn${year}`,
                          `Spring${year + 1}`,
                        ]),
                      ],
                    },
                  }));
                }}
              >
                {t("+ Add academic year", "+ 添加学年")}
              </button>
              {(["transfer", "exam"] as const).map(
                (origin) =>
                  rows.some(
                    (r) =>
                      r.term === "credit" && r.semester.creditOrigin === origin,
                  ) && (
                    <details key={origin} className={styles.creditRecords}>
                      <summary>
                        {origin === "transfer"
                          ? t("Transfer credits", "转学学分")
                          : t("Exam credits", "考试学分")}{" "}
                        ·{" "}
                        {
                          rows.filter(
                            (r) =>
                              r.term === "credit" &&
                              r.semester.creditOrigin === origin,
                          ).length
                        }
                      </summary>
                      <div className={styles.creditGrid}>
                        {rows
                          .filter(
                            (r) =>
                              r.term === "credit" &&
                              r.semester.creditOrigin === origin,
                          )
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
                              choose={choose}
                            />
                          ))}
                      </div>
                    </details>
                  ),
              )}
              <p className={styles.helper}>
                {t(
                  "Credit totals are planning estimates from the selected catalog. Imported records retain their original credit values.",
                  "学分汇总采用所选目录的规划估算。原始导入记录保留其学分值。",
                )}
              </p>
              <p role="status" aria-live="polite" className={styles.message}>
                {message}
              </p>
            </div>
            {narrow ? (
              <WorkspaceDialog
                closeOnly
                open={drawer}
                onOpenChange={setDrawer}
                title={t("Course planning", "选课与要求")}
                description={semesterLabel(targetTerm, locale)}
                closeLabel={t("Close", "关闭")}
                guard={false}
              >
                <PlanningCatalogProvider
                  campus={semesterCampus(plan, targetTerm)}
                  term={context.term}
                >
                  {assistant}
                </PlanningCatalogProvider>
              </WorkspaceDialog>
            ) : (
              <aside
                className={styles.assistant}
                aria-label={t("Course planning tools", "选课辅助工具")}
              >
                <PlanningCatalogProvider
                  campus={semesterCampus(plan, targetTerm)}
                  term={context.term}
                >
                  {assistant}
                </PlanningCatalogProvider>
              </aside>
            )}
          </div>
        </section>
        <DragOverlay
          dropAnimation={
            reducedMotion
              ? null
              : { duration: 260, easing: "cubic-bezier(.2,.8,.2,1.15)" }
          }
        >
          {activeCourse && (
            <div className={styles.dragPreview}>
              <strong>
                {activeCourse.subject} {activeCourse.number}
              </strong>
              <span>{activeCourse.title}</span>
            </div>
          )}
        </DragOverlay>
      </LayoutGroup>
    </DndContext>
  );
}

function TermColumn({
  term,
  children,
  ...props
}: React.ComponentProps<"section"> & { term: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: term });
  return (
    <section {...props} ref={setNodeRef} data-drop-target={isOver}>
      {children}
    </section>
  );
}

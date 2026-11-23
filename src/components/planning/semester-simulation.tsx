"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  CalendarClock,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Plan } from "@/lib/planning/model";
import type { CatalogCourse } from "@/lib/catalog/types";
import {
  boardCourses,
  semesterCampus,
  semesterLabel,
} from "@/lib/planning/workspace";
import {
  defaultSimulationPreferences,
  sectionGroups,
  semesterCatalogCode,
  type simulateSchedule,
} from "@/lib/planning/simulation";
import { text, type Locale } from "@/lib/i18n";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { usePlanningCatalog } from "./course-catalog";
import styles from "./semester-simulation.module.css";
import { SimulationTimetable } from "./simulation-timetable";
import { meetingDelivery } from "@/lib/planning/timetable";
import {
  calendarFromSimulation,
  semesterFingerprint,
} from "@/lib/calendar/schedules";
import { CalendarPreview } from "@/components/calendar/calendar-preview";
import { CalendarWeek } from "@/components/calendar/calendar-week";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import type { UserCalendar } from "@/lib/calendar/model";
import type { AcademicDay } from "@/lib/calendar/academic";
import { browserUuid } from "@/lib/uuid";
import { simulationCourseColors } from "@/lib/planning/simulation-colors";
import { calendarTimeBounds } from "@/lib/calendar/week";
type Result = ReturnType<typeof simulateSchedule>;
const timeLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const times = Array.from({ length: 97 }, (_, i) => i * 15);
type NavigationEvent = Pick<
  ReactKeyboardEvent,
  "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "defaultPrevented" | "key"
> & { target: EventTarget | null };
function navigationStep(event: NavigationEvent) {
  if (
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.defaultPrevented
  )
    return 0;
  const target = event.target instanceof Element ? event.target : null;
  if (
    target?.closest(
      'input, textarea, select, [role="combobox"], [role="textbox"], [role="spinbutton"], [role="listbox"], [role="option"], [contenteditable]:not([contenteditable="false"])',
    )
  )
    return 0;
  return event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
}
export function SemesterSimulation({
  plan,
  term,
  locale,
  update,
  persist,
}: {
  plan: Plan;
  term: string;
  locale: Locale;
  update: (fn: (p: Plan) => Plan) => void;
  persist: () => Promise<boolean>;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const context = usePlanningCatalog();
  const campus = semesterCampus(plan, term),
    catalogTerm = semesterCatalogCode(term);
  const codes = [
    ...new Set(
      boardCourses(plan)
        .filter(
          (r) =>
            r.term === term &&
            r.course.kind === "course" &&
            !["withdrawn", "dropped", "failed"].includes(r.course.status),
        )
        .map((r) => `${r.course.subject} ${r.course.number}`),
    ),
  ];
  const scope = [term, campus, ...codes].join("|");
  const colors = simulationCourseColors(codes);
  const [loaded, setLoaded] = useState<{
    scope: string;
    courses: CatalogCourse[];
    failed: string[];
  } | null>(null);
  const [view, setView] = useState("settings");
  const [replaceId, setReplaceId] = useState("");
  const [preview, setPreview] = useState<UserCalendar | null>(null);
  const navigation = useRef<HTMLElement>(null);
  const previewNavigation = useRef<HTMLElement>(null);
  const savedGroups = useMemo(
    () =>
      (plan.schedule.calendars ?? []).filter(
        (calendar) => calendar.kind === "simulation" && calendar.term === term,
      ),
    [plan.schedule.calendars, term],
  );
  const previewIndex = savedGroups.findIndex(
    (calendar) => calendar.id === preview?.id,
  );
  const savedBounds = useMemo(
    () =>
      calendarTimeBounds(savedGroups.flatMap((calendar) => calendar.events)),
    [savedGroups],
  );
  useEffect(() => {
    if (!preview) return;
    const navigate = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const dialog = previewNavigation.current?.closest('[role="dialog"]');
      if (
        !target ||
        !dialog ||
        target.closest('[role="dialog"], [role="alertdialog"]') !== dialog ||
        dialog.closest('[aria-hidden="true"], [inert]') ||
        target.closest('[role="menu"], [role="menubar"]')
      )
        return;
      const step = navigationStep(event);
      if (!step) return;
      event.preventDefault();
      event.stopPropagation();
      const current = savedGroups.findIndex(
        (calendar) => calendar.id === preview.id,
      );
      const next =
        savedGroups[
          Math.max(0, Math.min(savedGroups.length - 1, current + step))
        ];
      if (next) setPreview(next);
      previewNavigation.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", navigate, true);
    return () => window.removeEventListener("keydown", navigate, true);
  }, [preview, savedGroups]);
  const [academicDays, setAcademicDays] = useState<AcademicDay[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/calendar/academic", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (!controller.signal.aborted) setAcademicDays(data.days);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [result, setResult] = useState<{
    fingerprint: string;
    value: Result;
  } | null>(null);
  const [optionIndex, setOptionIndex] = useState(0);
  const worker = useRef<Worker | null>(null);
  const request = useRef<AbortController | null>(null);
  const [day, setDay] = useState("0"),
    [start, setStart] = useState("720"),
    [end, setEnd] = useState("780");
  const preferences =
    plan.schedule.simulationPreferences?.[term] ?? defaultSimulationPreferences;
  // A row's imported section is evidence, not an explicit simulation constraint.
  const fixed = { ...plan.schedule.sectionChoices?.[term] };
  const fingerprint = JSON.stringify([scope, preferences, fixed]);
  const simulation = result?.fingerprint === fingerprint ? result.value : null;
  const activeIndex = simulation
    ? Math.min(optionIndex, Math.max(0, simulation.alternatives.length - 1))
    : 0;
  const output = simulation
    ? { ...simulation, ...simulation.alternatives[activeIndex] }
    : null;
  useEffect(
    () => () => {
      request.current?.abort();
      worker.current?.terminate();
    },
    [],
  );
  function preference(next: typeof preferences) {
    update((p) => ({
      ...p,
      schedule: {
        ...p.schedule,
        simulationPreferences: {
          ...p.schedule.simulationPreferences,
          [term]: next,
        },
      },
    }));
  }
  function choose(key: string, component: string, value: string) {
    const course = loaded?.courses.find(
      (c) => `${c.subject} ${c.catalogNumber}` === key,
    );
    const group = course
      ? (sectionGroups(course).find((group) => group.component === component)
          ?.sections ?? [])
      : [];
    update((p) => ({
      ...p,
      schedule: {
        ...p.schedule,
        sectionChoices: {
          ...p.schedule.sectionChoices,
          [term]: {
            ...p.schedule.sectionChoices?.[term],
            [key]: [
              ...(p.schedule.sectionChoices?.[term]?.[key] ?? []).filter(
                (id) => !group.some((s) => s.classNumber === id),
              ),
              ...(value ? [value] : []),
            ],
          },
        },
      },
    }));
  }
  async function run() {
    request.current?.abort();
    worker.current?.terminate();
    setBusy(true);
    setMessage("");
    const controller = new AbortController();
    request.current = controller;
    let data = loaded;
    if (data?.scope !== scope) {
      const responses = await Promise.allSettled(
        codes.map(async (code) => {
          const split = code.lastIndexOf(" ");
          const response = await context.reader.read(
            {
              subject: code.slice(0, split),
              number: code.slice(split + 1),
              campus,
              term: catalogTerm,
            },
            controller.signal,
          );
          if (
            response.course.termCode !== catalogTerm ||
            response.course.campusCode.toUpperCase() !== campus
          )
            throw Error();
          return response.course;
        }),
      );
      if (controller.signal.aborted) return;
      data = {
        scope,
        courses: responses.flatMap((r) =>
          r.status === "fulfilled" ? [r.value] : [],
        ),
        failed: codes.filter((_, i) => responses[i].status === "rejected"),
      };
      setLoaded(data);
    }
    if (controller.signal.aborted) return;
    const selected = fixed;
    const runFingerprint = JSON.stringify([scope, preferences, selected]);
    try {
      const active = new Worker(
        new URL("../../lib/planning/simulation.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = active;
      active.onmessage = (event) => {
        if (worker.current !== active) return;
        active.terminate();
        worker.current = null;
        setBusy(false);
        if (event.data.error)
          setMessage(t("Could not simulate. Try again.", "模拟失败，请重试。"));
        else {
          setOptionIndex(0);
          setResult({ fingerprint: runFingerprint, value: event.data.result });
          setView("result");
        }
      };
      active.onerror = () => {
        if (worker.current !== active) return;
        active.terminate();
        worker.current = null;
        setBusy(false);
        setMessage(t("Could not simulate. Try again.", "模拟失败，请重试。"));
      };
      active.postMessage({
        courses: data.courses,
        fixed: selected,
        preferences,
      });
    } catch {
      worker.current?.terminate();
      worker.current = null;
      setBusy(false);
      setMessage(
        t(
          "Could not start local simulation. Try again.",
          "本地模拟未能启动，请重试。",
        ),
      );
    }
  }
  const conflicted = new Set(
    output?.conflicts.flatMap((c) => [c.left, c.right]) ?? [],
  );
  const days =
    locale === "zh"
      ? ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const notices = output
    ? [
        ...output.conflicts.map(
          (conflict) =>
            `${days[conflict.day]} · ${conflict.left} ↔ ${conflict.right === "blocked" ? t("Blocked time", "避开时段") : conflict.right}`,
        ),
        ...(output.unknown.length
          ? [`${t("Time TBA", "时间待公布")} · ${output.unknown.join(" · ")}`]
          : []),
        ...(output.unavailable.length
          ? [
              `${t("Selected sections missing", "所选班次缺失")} · ${output.unavailable.join(" · ")}`,
            ]
          : []),
        ...(output.restricted.length
          ? [
              `${t("Closed or waitlisted", "已满或候补班次")} · ${output.restricted.join(" · ")}`,
            ]
          : []),
        ...(output.linked.length
          ? [
              `${t("Confirm lecture/lab registration links", "请核对讲座与实验的注册关联")} · ${output.linked.join(" · ")}`,
            ]
          : []),
        ...(output.capped
          ? [
              t(
                "Search is bounded; other combinations may exist.",
                "本次组合搜索有数量限制，可能存在其他安排。",
              ),
            ]
          : []),
      ]
    : [];
  return (
    <div
      className={styles.root}
      data-analytics-area="planning_simulation"
      onKeyDown={(event) => {
        if (preview) return;
        const step = navigationStep(event);
        if (!step || !output || output.alternatives.length < 2) return;
        event.preventDefault();
        setOptionIndex(
          Math.max(
            0,
            Math.min(output.alternatives.length - 1, activeIndex + step),
          ),
        );
        navigation.current?.focus({ preventScroll: true });
      }}
    >
      <div className={styles.heading}>
        <CalendarClock size={20} />
        <strong>
          {semesterLabel(term, locale)} · {campus}
        </strong>
        <span>
          {codes.length} {t("courses", "门课程")}
        </span>
      </div>
      <div className={styles.mobileTabs}>
        <button
          aria-label={t("Sections & preferences", "班次与偏好")}
          aria-pressed={view === "settings"}
          onClick={() => setView("settings")}
        >
          {t("Sections", "班次偏好")}
        </button>
        <button
          aria-pressed={view === "result"}
          onClick={() => setView("result")}
        >
          {t("Timetable", "时间表")}
        </button>
      </div>
      <div className={styles.layout}>
        <section
          className={styles.controls}
          data-mobile-hidden={view !== "settings"}
          aria-label={t("Simulation settings", "模拟排课设置")}
        >
          <div className={styles.preferences}>
            <button
              type="button"
              role="switch"
              aria-checked={preferences.compact}
              className={styles.compactToggle}
              onClick={() =>
                preference({ ...preferences, compact: !preferences.compact })
              }
            >
              <span>
                {t("Keep classes close together", "尽量连排，减少空档")}
              </span>
              <span className={styles.switchTrack} aria-hidden="true">
                <i />
              </span>
            </button>
            <label>
              {t("Travel buffer", "课间缓冲")}
              <ChoiceSelect
                value={preferences.buffer}
                onValueChange={(v) =>
                  preference({ ...preferences, buffer: Number(v) })
                }
              >
                {[0, 5, 10, 15, 20, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n} min
                  </option>
                ))}
              </ChoiceSelect>
            </label>
          </div>
          <section className={styles.avoid}>
            <h4>
              <SlidersHorizontal size={14} />
              {t("Avoid days or times", "避开指定日期与时段")} ·{" "}
              {preferences.blocked.length}
            </h4>
            <div className={styles.blockForm}>
              <ChoiceSelect
                aria-label={t("Day to avoid", "避开星期")}
                value={day}
                onValueChange={setDay}
              >
                {days.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </ChoiceSelect>
              <ChoiceSelect
                aria-label={t("Start time", "开始时间")}
                value={start}
                onValueChange={setStart}
              >
                {times.slice(0, -1).map((n) => (
                  <option key={n} value={n}>
                    {timeLabel(n)}
                  </option>
                ))}
              </ChoiceSelect>
              <ChoiceSelect
                aria-label={t("End time", "结束时间")}
                value={end}
                onValueChange={setEnd}
              >
                {times.slice(1).map((n) => (
                  <option key={n} value={n}>
                    {timeLabel(n)}
                  </option>
                ))}
              </ChoiceSelect>
              <button
                disabled={
                  Number(end) <= Number(start) ||
                  preferences.blocked.length >= 30
                }
                onClick={() =>
                  preference({
                    ...preferences,
                    blocked: [
                      ...preferences.blocked,
                      {
                        days: [Number(day)],
                        start: Number(start),
                        end: Number(end),
                      },
                    ],
                  })
                }
              >
                <Plus size={14} />
                {t("Block time", "避开时段")}
              </button>
              <button
                disabled={preferences.blocked.length >= 30}
                onClick={() =>
                  preference({
                    ...preferences,
                    blocked: [
                      ...preferences.blocked,
                      { days: [Number(day)], start: 0, end: 1440 },
                    ],
                  })
                }
              >
                {t("Block day", "避开全天")}
              </button>
            </div>
            <div className={styles.blocks}>
              {preferences.blocked.map((b, i) => (
                <button
                  key={i}
                  onClick={() =>
                    preference({
                      ...preferences,
                      blocked: preferences.blocked.filter((_, j) => j !== i),
                    })
                  }
                  aria-label={`${t("Remove", "移除")} ${days[b.days[0]]} ${timeLabel(b.start)}`}
                >
                  {b.days.map((d) => days[d]).join("/")} {timeLabel(b.start)}–
                  {timeLabel(b.end)}
                  <X size={12} />
                </button>
              ))}
            </div>
          </section>
          <button
            className={styles.run}
            data-analytics-action="planning_simulation_run"
            onClick={() => void run()}
            disabled={busy || !codes.length}
          >
            <RefreshCw size={15} />
            {busy
              ? t("Simulating…", "正在模拟…")
              : t("Fetch sections & simulate", "获取班次并模拟排课")}
          </button>
          <p role="status">
            {message ||
              (!codes.length
                ? t(
                    "Choose actual courses before simulating.",
                    "请先选择实际课程，再模拟时间安排。",
                  )
                : !output && !busy
                  ? t(
                      "Your saved choices will be used in the next simulation.",
                      "模拟将使用当前课程、班次和时间偏好。",
                    )
                  : "")}
          </p>
          {loaded?.scope === scope && !!loaded.failed.length && (
            <p className={styles.warning}>
              {t(
                "This semester's sections are unavailable for",
                "此学期班次暂不可用",
              )}{" "}
              · {loaded.failed.join(" · ")}
            </p>
          )}
          {loaded?.scope === scope &&
            loaded.courses.map((c) => {
              const key = `${c.subject} ${c.catalogNumber}`;
              return (
                <article
                  key={key}
                  className={styles.course}
                  style={{ "--course-color": colors[key] } as CSSProperties}
                  data-conflict={conflicted.has(key)}
                  data-uncertain={
                    output?.unknown.includes(key) || !c.sections.length
                  }
                >
                  <strong>
                    {key}
                    <span>{c.title}</span>
                  </strong>
                  {!!fixed[key]?.length && (
                    <button
                      type="button"
                      className={styles.release}
                      onClick={() =>
                        update((p) => ({
                          ...p,
                          schedule: {
                            ...p.schedule,
                            sectionChoices: {
                              ...p.schedule.sectionChoices,
                              [term]: {
                                ...p.schedule.sectionChoices?.[term],
                                [key]: [],
                              },
                            },
                          },
                        }))
                      }
                    >
                      {t("Use automatic sections", "全部自动选择")}
                    </button>
                  )}
                  {sectionGroups(c).map((group) => (
                    <label key={group.component}>
                      {group.component}
                      <ChoiceSelect
                        aria-label={`${key} ${group.component}`}
                        value={
                          (fixed[key] ?? []).find((id) =>
                            group.sections.some((s) => s.classNumber === id),
                          ) ?? ""
                        }
                        onValueChange={(value) =>
                          choose(key, group.component, value)
                        }
                      >
                        <option value="">
                          {t(
                            "Automatic · compare all times",
                            "自动选择 · 比较全部时间",
                          )}
                        </option>
                        {group.sections.map((s) => (
                          <option key={s.classNumber} value={s.classNumber}>
                            {s.section} ·{" "}
                            {s.meetings
                              .map(
                                (m) =>
                                  `${m.days.map((d) => days[d]).join("/")} ${m.startTime && m.endTime ? `${m.startTime}–${m.endTime}` : /distance learning|^DL$/i.test(s.instructionMode) ? t("Self-paced online", "线上自主学习") : t("Time TBA", "时间待定")} · ${{ online: t("Online", "线上"), "in-person": t("In person", "线下"), unknown: t("Mode TBA", "方式待定") }[meetingDelivery(m, s.instructionMode)]} · ${s.session}`,
                              )
                              .join(" · ")}
                          </option>
                        ))}
                      </ChoiceSelect>
                      <small className={styles.choiceHint}>
                        {(fixed[key] ?? []).some((id) =>
                          group.sections.some((s) => s.classNumber === id),
                        )
                          ? t("Pinned section", "已固定班次")
                          : output?.choices
                              .find((choice) => choice.key === key)
                              ?.sections.filter((s) =>
                                group.sections.some(
                                  (section) =>
                                    section.classNumber === s.classNumber,
                                ),
                              )
                              .map(
                                (s) =>
                                  `${t("Current", "当前方案")} · ${s.section}`,
                              )
                              .join(" · ") ||
                            t("Any available section", "比较所有可用班次")}
                      </small>
                    </label>
                  ))}
                </article>
              );
            })}
          {!!savedGroups.length && (
            <section className={styles.savedGroups}>
              <h3>{t("Saved schedule groups", "已保存课表组")}</h3>
              <div>
                {savedGroups.map((calendar) => (
                  <button
                    key={calendar.id}
                    onClick={() => setPreview(calendar)}
                  >
                    <strong>{calendar.title}</strong>
                    <CalendarPreview events={calendar.events} />
                    <small>
                      {calendar.fingerprint !== semesterFingerprint(plan, term)
                        ? t(
                            "Out of date · regenerate to replace",
                            "已过期 · 请重新生成替换",
                          )
                        : t("Preview schedule", "预览课表")}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          )}
        </section>
        <section
          className={styles.preview}
          data-mobile-hidden={view !== "result"}
          aria-label={t("Weekly timetable", "每周时间表")}
        >
          {!output && (
            <div className={styles.empty}>
              <CalendarClock size={32} />
              <h3>{t("Your weekly timetable", "每周时间表")}</h3>
              <p>
                {t(
                  "Run the simulation to compare sections and meeting times.",
                  "运行模拟后，在这里查看班次时间与冲突。",
                )}
              </p>
            </div>
          )}
          {output && (
            <>
              <div className={styles.previewContent}>
                <nav
                  ref={navigation}
                  tabIndex={0}
                  className={styles.alternatives}
                  aria-label={t("Timetable alternatives", "可选时间表")}
                >
                  <div>
                    <strong aria-live="polite">
                      {t("Schedule", "方案")} {activeIndex + 1} /{" "}
                      {Math.max(1, output.alternatives.length)}
                    </strong>
                    <small>
                      {t("← → Compare schedules", "← → 切换对比方案")}
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-label={t("Previous timetable", "上一种时间表")}
                    disabled={activeIndex === 0}
                    onClick={() => {
                      navigation.current?.focus({ preventScroll: true });
                      setOptionIndex(activeIndex - 1);
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("Next timetable", "下一种时间表")}
                    disabled={activeIndex + 1 >= output.alternatives.length}
                    onClick={() => {
                      navigation.current?.focus({ preventScroll: true });
                      setOptionIndex(activeIndex + 1);
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </nav>
                <div
                  className={styles.result}
                  data-incomplete={Boolean(
                    output.unknown.length ||
                    output.unavailable.length ||
                    output.incomplete.length ||
                    output.restricted.length ||
                    loaded?.failed.length,
                  )}
                  data-conflict={output.conflicts.length > 0}
                  role="status"
                >
                  {output.conflicts.length ||
                  output.unknown.length ||
                  output.incomplete.length ||
                  output.restricted.length ||
                  output.unavailable.length ||
                  loaded?.failed.length ? (
                    <AlertTriangle size={18} />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  <strong>
                    {output.conflicts.length
                      ? t("Schedule conflicts found", "发现时间冲突")
                      : output.unknown.length ||
                          loaded?.failed.length ||
                          output.unavailable.length ||
                          output.incomplete.length ||
                          output.restricted.length
                        ? t(
                            "No known conflicts · review details",
                            "已知时间无冲突 · 详情需核对",
                          )
                        : t("No meeting-time conflicts", "上课时间无冲突")}
                  </strong>
                </div>
                <SimulationTimetable
                  academic={academicDays}
                  choices={output.choices}
                  courses={loaded?.courses ?? []}
                  conflicted={conflicted}
                  locale={locale}
                  warnings={notices}
                />
              </div>
              <div className={styles.saveActions}>
                <ChoiceSelect
                  aria-label={t("Save destination", "课表保存位置")}
                  value={replaceId}
                  onValueChange={setReplaceId}
                >
                  <option value="">
                    {t("Save as a new group", "保存为新的课表组")}
                  </option>
                  {savedGroups.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {t("Replace", "替换")} · {calendar.title}
                    </option>
                  ))}
                </ChoiceSelect>
                <button
                  className={styles.run}
                  disabled={
                    !output.choices.length ||
                    output.conflicts.length > 0 ||
                    (!replaceId &&
                      (plan.schedule.calendars?.length ?? 0) >= 40) ||
                    !!loaded?.failed.length ||
                    !!output.unavailable.length
                  }
                  onClick={async () => {
                    const id = replaceId || browserUuid();
                    update((p) => {
                      const previous = p.schedule.calendars?.find(
                        (calendar) => calendar.id === id,
                      );
                      const generated = calendarFromSimulation(
                        p,
                        term,
                        output.choices,
                        academicDays,
                        id,
                      );
                      const calendar = {
                        ...generated,
                        title:
                          previous?.title ??
                          `${semesterLabel(term, locale)} · ${output.choices.length}${t(" courses", " 门课程")} · ${t("Simulation", "模拟课表")}`,
                        description:
                          previous?.description || generated.description,
                        icon: previous?.icon ?? generated.icon,
                        color: previous?.color ?? generated.color,
                        reminders: previous?.reminders ?? generated.reminders,
                      };
                      return {
                        ...p,
                        schedule: {
                          ...p.schedule,
                          calendars: [
                            ...(p.schedule.calendars ?? []).filter(
                              (calendar) => calendar.id !== id,
                            ),
                            calendar,
                          ],
                        },
                      };
                    });
                    setReplaceId(id);
                    setMessage(
                      (await persist())
                        ? t("Schedule group saved", "课表组已保存")
                        : t(
                            "Could not save. Export a backup to keep your changes.",
                            "保存失败，请导出备份保留修改。",
                          ),
                    );
                  }}
                >
                  {t("Save this schedule group", "保存这组课表")}
                </button>
                <a href="/calendar">{t("My calendars", "我的日程")}</a>
              </div>
            </>
          )}
        </section>
      </div>
      <WorkspaceDialog
        wide
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        title={preview?.title ?? ""}
        description={t(
          "Compare saved schedules · ← → to switch",
          "对比已保存课表 · ← → 切换",
        )}
        closeLabel={t("Close", "关闭")}
        guard={false}
      >
        {preview && (
          <div className={styles.savedPreview}>
            <nav
              className={styles.alternatives}
              ref={previewNavigation}
              tabIndex={0}
              aria-label={t("Saved schedule alternatives", "已保存课表切换")}
            >
              <div>
                <strong aria-live="polite">
                  {t("Saved schedule", "已保存课表")} {previewIndex + 1} /{" "}
                  {savedGroups.length}
                </strong>
                <small>
                  {t(
                    "Same time scale for every group",
                    "所有课表采用相同时间标尺",
                  )}
                </small>
              </div>
              <button
                type="button"
                aria-label={t("Previous saved schedule", "上一组已保存课表")}
                disabled={previewIndex <= 0}
                onClick={() => {
                  previewNavigation.current?.focus({ preventScroll: true });
                  setPreview(savedGroups[previewIndex - 1]);
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label={t("Next saved schedule", "下一组已保存课表")}
                disabled={previewIndex + 1 >= savedGroups.length}
                onClick={() => {
                  previewNavigation.current?.focus({ preventScroll: true });
                  setPreview(savedGroups[previewIndex + 1]);
                }}
              >
                <ChevronRight size={16} />
              </button>
            </nav>
            <div className={styles.savedWeek}>
              <CalendarWeek
                fit
                timeBounds={savedBounds}
                events={preview.events}
                dates={(() => {
                  const first =
                    preview.events[0]?.start.slice(0, 10) ??
                    new Date().toISOString().slice(0, 10);
                  const monday = new Date(first + "T12:00:00Z");
                  monday.setUTCDate(
                    monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7),
                  );
                  return Array.from({ length: 7 }, (_, i) =>
                    new Date(+monday + i * 86400000).toISOString().slice(0, 10),
                  );
                })()}
                locale={locale}
              />
            </div>
            <a href="/calendar">
              {t("Edit in my calendars", "前往我的日程编辑")}
            </a>
          </div>
        )}
      </WorkspaceDialog>
    </div>
  );
}

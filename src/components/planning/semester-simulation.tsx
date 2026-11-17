"use client";
import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  Clock3,
  MapPin,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  RefreshCw,
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
  meetingSlots,
  sectionGroups,
  semesterCatalogCode,
  type simulateSchedule,
} from "@/lib/planning/simulation";
import { text, type Locale } from "@/lib/i18n";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { usePlanningCatalog } from "./course-catalog";
import styles from "./semester-simulation.module.css";
type Result = ReturnType<typeof simulateSchedule>;
const timeLabel = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const times = Array.from({ length: 97 }, (_, i) => i * 15);
export function SemesterSimulation({
  plan,
  term,
  locale,
  update,
}: {
  plan: Plan;
  term: string;
  locale: Locale;
  update: (fn: (p: Plan) => Plan) => void;
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
  const [loaded, setLoaded] = useState<{
    scope: string;
    courses: CatalogCourse[];
    failed: string[];
  } | null>(null);
  const [view, setView] = useState("settings");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [result, setResult] = useState<{
    fingerprint: string;
    value: Result;
  } | null>(null);
  const worker = useRef<Worker | null>(null);
  const request = useRef<AbortController | null>(null);
  const [day, setDay] = useState("0"),
    [start, setStart] = useState("720"),
    [end, setEnd] = useState("780");
  const preferences =
    plan.schedule.simulationPreferences?.[term] ?? defaultSimulationPreferences;
  function fixedChoices(courses: CatalogCourse[]) {
    const choices = { ...plan.schedule.sectionChoices?.[term] };
    for (const row of boardCourses(plan).filter(
      (r) => r.term === term && r.course.section,
    )) {
      const key = `${row.course.subject} ${row.course.number}`;
      if (Object.hasOwn(choices, key)) continue;
      const section = courses
        .find((c) => `${c.subject} ${c.catalogNumber}` === key)
        ?.sections.find(
          (s) =>
            s.section === row.course.section ||
            s.classNumber === row.course.section,
        );
      if (section) choices[key] = [section.classNumber];
    }
    return choices;
  }
  const fixed = fixedChoices(loaded?.scope === scope ? loaded.courses : []);
  const fingerprint = JSON.stringify([scope, preferences, fixed]);
  const output = result?.fingerprint === fingerprint ? result.value : null;
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
    const group =
      loaded?.courses
        .find((c) => `${c.subject} ${c.catalogNumber}` === key)
        ?.sections.filter((s) => s.component === component) ?? [];
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
    const selected = fixedChoices(data.courses);
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
  const events =
    output?.choices.flatMap((choice) =>
      choice.sections.flatMap((section) =>
        section.meetings.flatMap((meeting) =>
          meetingSlots([meeting]).map((slot) => ({
            ...slot,
            key: choice.key,
            section: section.section,
            location: meeting.location,
            title: loaded?.courses.find(
              (c) => `${c.subject} ${c.catalogNumber}` === choice.key,
            )?.title,
          })),
        ),
      ),
    ) ?? [];
  return (
    <div className={styles.root}>
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
          aria-pressed={view === "settings"}
          onClick={() => setView("settings")}
        >
          {t("Sections & preferences", "班次与偏好")}
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
                  data-conflict={conflicted.has(key)}
                  data-uncertain={
                    output?.unknown.includes(key) || !c.sections.length
                  }
                >
                  <strong>
                    {key}
                    <span>{c.title}</span>
                  </strong>
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
                          {t("Recommend an available time", "自动推荐可用时间")}
                        </option>
                        {group.sections.map((s) => (
                          <option key={s.classNumber} value={s.classNumber}>
                            {s.section} ·{" "}
                            {s.meetings
                              .map(
                                (m) =>
                                  `${m.days.map((d) => days[d]).join("/")} ${m.startTime ?? "TBA"}–${m.endTime ?? ""}`,
                              )
                              .join(" · ")}
                          </option>
                        ))}
                      </ChoiceSelect>
                    </label>
                  ))}
                </article>
              );
            })}
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
                          "Known meeting times do not overlap; some data is incomplete",
                          "已知时间无冲突，部分班次资料仍不完整",
                        )
                      : t("No meeting-time conflicts", "上课时间无冲突")}
                </strong>
              </div>
              {output.conflicts.map((c, i) => (
                <p className={styles.warning} key={i}>
                  {days[c.day]} · {c.left} ↔{" "}
                  {c.right === "blocked"
                    ? t("Blocked time", "避开时段")
                    : c.right}
                </p>
              ))}
              {!!output.unknown.length && (
                <p>
                  {t("Time to be announced", "时间待公布")} ·{" "}
                  {output.unknown.join(" · ")}
                </p>
              )}
              {!!output.unavailable.length && (
                <p>
                  {t(
                    "Selected sections missing from this catalog",
                    "所选班次在当前目录中缺失",
                  )}{" "}
                  · {output.unavailable.join(" · ")}
                </p>
              )}
              {!!output.restricted.length && (
                <p className={styles.warning}>
                  {t("Closed or waitlisted sections", "班次已满或仅可候补")} ·{" "}
                  {output.restricted.join(" · ")}
                </p>
              )}
              {!!output.linked.length && (
                <p>
                  {t(
                    "Confirm lecture/lab registration links for",
                    "请核对讲座、实验等组件的注册关联",
                  )}{" "}
                  · {output.linked.join(" · ")}
                </p>
              )}
              {output.capped && (
                <small>
                  {t(
                    "A bounded search found this combination. Other combinations may exist.",
                    "本次使用限量组合搜索，可能存在其他可行安排。",
                  )}
                </small>
              )}
              <div className={styles.week}>
                {days.map((label, day) => (
                  <section
                    key={day}
                    hidden={day > 4 && !events.some((e) => e.day === day)}
                  >
                    <h4>
                      {label}
                      <small>
                        {events.filter((e) => e.day === day).length}{" "}
                        {t("classes", "节课")}
                      </small>
                    </h4>
                    {events
                      .filter((e) => e.day === day)
                      .sort((a, b) => a.start - b.start)
                      .map((e, i) => (
                        <div
                          className={styles.meeting}
                          data-conflict={conflicted.has(e.key)}
                          key={i}
                        >
                          <div className={styles.time}>
                            <Clock3 size={13} />
                            {timeLabel(e.start)}–{timeLabel(e.end)}
                          </div>
                          <strong>{e.key}</strong>
                          <p>{e.title}</p>
                          <span>
                            <MapPin size={12} />
                            {e.location || t("Location TBA", "地点待公布")}
                          </span>
                          <small>
                            {t("Section", "班次")} {e.section}
                          </small>
                          {e.from && e.to && (
                            <small>
                              {e.from.slice(5)} – {e.to.slice(5)}
                            </small>
                          )}
                        </div>
                      ))}
                  </section>
                ))}
              </div>
              <button
                className={styles.run}
                disabled={
                  !output.choices.length ||
                  output.conflicts.length > 0 ||
                  !!loaded?.failed.length ||
                  !!output.unavailable.length
                }
                onClick={() =>
                  update((p) => ({
                    ...p,
                    schedule: {
                      ...p.schedule,
                      sectionChoices: {
                        ...p.schedule.sectionChoices,
                        [term]: Object.fromEntries(
                          output.choices.map((c) => [
                            c.key,
                            c.sections.map((s) => s.classNumber),
                          ]),
                        ),
                      },
                    },
                  }))
                }
              >
                {t("Use these sections", "采用这组班次")}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

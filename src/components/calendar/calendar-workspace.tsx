"use client";
import { EventDetails, type CalendarEventPreview } from "./event-details";
import { useActionNotice } from "@/hooks/use-action-notice";
import { FeatureSyncStatus } from "@/components/sync/feature-sync-status";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useMemo,
} from "react";
import {
  CalendarDays,
  Plus,
  Download,
  Upload,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Pencil,
  Layers,
  Link2,
  BookOpen,
  GraduationCap,
  Star,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import {
  planningScope,
  subscribePlanningScope,
} from "@/lib/planning/client-sync";
import { usePlanningWorkspace } from "@/components/planning/use-planning-workspace";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { CalendarPreview } from "./calendar-preview";
import { CalendarShare } from "./calendar-share";
import { CalendarWeek } from "./calendar-week";
import { CalendarMonth } from "./calendar-month";
import { CalendarSettings } from "./calendar-settings";
import { CalendarEventEditor } from "./event-editor";
import {
  calendarSchema,
  combinedEvents,
  applyCalendarRefresh,
  availableSourceIds,
  type UserCalendar,
  type CalendarEvent,
} from "@/lib/calendar/model";
import { parseCalendar, exportCalendar } from "@/lib/calendar/ical";
import { semesterFingerprint } from "@/lib/calendar/schedules";
import type { AcademicDay } from "@/lib/calendar/academic";
import {
  academicEvents,
  academicForCalendar,
  officialCalendars,
  isOfficialCalendar,
} from "@/lib/calendar/academic";
import { browserUuid } from "@/lib/uuid";
import { newYorkDate, eventInDateRange } from "@/lib/calendar/dates";
import styles from "./calendar.module.css";
type CalendarDraft = UserCalendar & {
  editorSession: string;
  existing: boolean;
};
const dateString = (date: Date) => date.toISOString().slice(0, 10);
function monday(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return dateString(d);
}
const shift = (date: string, days: number) =>
  dateString(new Date(Date.parse(date + "T12:00:00Z") + days * 86400000));
export function CalendarWorkspace() {
  const { locale } = usePreferences(),
    t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const account = useSyncExternalStore(
    subscribePlanningScope,
    planningScope,
    () => null,
  );
  const { plan, setPlan, ready, storageError, persist } =
    usePlanningWorkspace(account);
  const [academic, setAcademic] = useState<AcademicDay[]>([]);
  const [academicStatus, setAcademicStatus] = useState("loading");
  const [academicUpdated, setAcademicUpdated] = useState<string | null>(null);
  const [academicRetry, setAcademicRetry] = useState(0);
  const privateCalendars = useMemo(
    () => plan.schedule.calendars ?? [],
    [plan.schedule.calendars],
  );
  const calendars = useMemo(
    () => [...privateCalendars, ...officialCalendars(academic, locale)],
    [privateCalendars, academic, locale],
  );
  const [selectedId, setSelectedId] = useState("");
  const selected = calendars.find((c) => c.id === selectedId) ?? calendars[0];
  const officialSelected = !!selected && isOfficialCalendar(selected.id);
  const [week, setWeek] = useState(() => monday(newYorkDate()));
  const [view, setView] = useState("week");
  const [message, setMessage] = useActionNotice();
  const [eventPreview, setEventPreview] = useState<CalendarEventPreview | null>(
    null,
  );
  function previewEvent(event: CalendarEvent, anchor?: HTMLElement) {
    const rect = anchor?.getBoundingClientRect();
    setEventPreview({
      event,
      readOnly: calendars.some(
        (calendar) =>
          calendar.kind === "feed" &&
          calendar.events.some((item) =>
            calendar.id === selected?.id
              ? item.id === event.id
              : JSON.stringify([calendar.id, item.id]) === event.id,
          ),
      ),
      left: rect?.left ?? innerWidth / 2,
      top: rect?.bottom ?? 120,
    });
  }
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [editor, setEditor] = useState<CalendarDraft | null>(null);
  const [editorBaseline, setEditorBaseline] = useState("");
  const [creating, setCreating] = useState(false);
  const [officialEvent, setOfficialEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [feed, setFeed] = useState(false),
    [feedUrl, setFeedUrl] = useState("");
  const [eventEditor, setEventEditor] = useState<CalendarEvent | null>(null);
  const [eventDirty, setEventDirty] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/calendar/academic", { signal: c.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!c.signal.aborted) {
          setAcademic(d.days);
          setAcademicUpdated(d.fetchedAt);
          setAcademicStatus(d.days?.length ? "ready" : "empty");
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setAcademicStatus("error");
      });
    return () => c.abort();
  }, [academicRetry]);
  function save(calendar: UserCalendar) {
    try {
      const value = calendarSchema.parse({
        ...calendar,
        sourceIds: availableSourceIds(calendar, calendars),
        updatedAt: new Date().toISOString(),
      });
      setPlan((p) => {
        if (
          (p.schedule.calendars ?? []).filter((c) => c.id !== value.id)
            .length >= 40
        )
          throw Error("capacity");
        return {
          ...p,
          schedule: {
            ...p.schedule,
            calendars: [
              ...(p.schedule.calendars ?? []).filter((c) => c.id !== value.id),
              value,
            ],
          },
        };
      });
      setSelectedId(value.id);
      return true;
    } catch {
      setMessage(
        t(
          "Check event dates or calendar capacity (40 calendars).",
          "请检查日程日期或日历数量上限（40 个）。",
        ),
      );
      return false;
    }
  }
  function openCalendar(calendar: UserCalendar, existing = false) {
    const draft = {
      ...structuredClone(calendar),
      editorSession: browserUuid(),
      existing,
    };
    setEditorBaseline(JSON.stringify(draft));
    setEditor(draft);
  }
  function editEvent(event: CalendarEvent) {
    if (event.id.startsWith("official-")) {
      setOfficialEvent(event);
      return;
    }
    const owner = calendars.find((calendar) =>
      calendar.events.some((item) =>
        calendar.id === selected?.id
          ? item.id === event.id
          : JSON.stringify([calendar.id, item.id]) === event.id,
      ),
    );
    const original = owner?.events.find(
      (item) =>
        item.id === event.id ||
        JSON.stringify([owner.id, item.id]) === event.id,
    );
    if (owner && original && owner.kind !== "feed") {
      setEventDirty(false);
      setSelectedId(owner.id);
      setEventEditor(structuredClone(original));
    }
  }
  function create(kind: UserCalendar["kind"] = "personal") {
    const draft = calendarSchema.parse({
      id: browserUuid(),
      kind,
      title:
        kind === "combined"
          ? t("Combined calendar", "组合日历")
          : t("My calendar", "我的日程"),
      events: [],
      updatedAt: new Date().toISOString(),
    });
    setCreating(false);
    openCalendar(draft);
  }
  async function remote(url: string, existing?: UserCalendar) {
    if (busy.current) return;
    busy.current = true;
    const requestAccount = account;
    setMessage(t("Refreshing calendar…", "正在更新日历…"));
    try {
      const response = await fetch("/api/calendar/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!response.ok)
        throw Error(response.status === 401 ? "account" : "feed");
      const data = await response.json();
      if (planningScope() !== requestAccount) return;
      const calendar = calendarSchema.parse({
        ...existing,
        id: existing?.id ?? browserUuid(),
        kind: "feed",
        title: existing?.title ?? t("Subscribed calendar", "订阅日历"),
        feedUrl: url.replace(/^webcal:/i, "https:"),
        events: data.events,
        refreshedAt: data.refreshedAt,
        updatedAt: data.refreshedAt,
      });
      setPlan((p) => {
        const live = p.schedule.calendars?.find(
          (item) => item.id === calendar.id,
        );
        if (existing && (!live || live.feedUrl !== existing.feedUrl)) return p;
        return {
          ...p,
          schedule: {
            ...p.schedule,
            calendars: [
              ...(p.schedule.calendars ?? []).filter(
                (item) => item.id !== calendar.id,
              ),
              live ? applyCalendarRefresh(live, calendar) : calendar,
            ],
          },
        };
      });
      setSelectedId(calendar.id);
      setFeed(false);
      setFeedUrl("");
      if (await persist()) setMessage(t("Calendar updated", "日历已更新"));
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "account"
          ? t(
              "Sign in to refresh remote calendars. You can import an ICS file locally.",
              "登录后可更新远程日历，也可先导入本地 ICS 文件。",
            )
          : t(
              "Could not refresh. Previous events were kept.",
              "更新失败，已保留原有日程。",
            ),
      );
    } finally {
      busy.current = false;
    }
  }
  const feedAttempt = useRef(new Map<string, number>());
  useEffect(() => {
    if (!account || busy.current) return;
    const staleFeed = calendars.find(
      (calendar) =>
        calendar.feedUrl &&
        (!calendar.refreshedAt ||
          now - Date.parse(calendar.refreshedAt) > 3600000) &&
        now - (feedAttempt.current.get(calendar.id) ?? 0) > 3600000,
    );
    if (staleFeed) {
      feedAttempt.current.set(staleFeed.id, now);
      void remote(staleFeed.feedUrl!, staleFeed);
    }
    // Each stored feed is refreshed once per mounted workspace after its freshness interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars, account, now]);
  const events = selected ? combinedEvents(calendars, selected) : [];
  const initialCalendar = useRef("");
  useEffect(() => {
    const key = account + "|" + (selected?.id ?? "");
    if (!ready || !selected || initialCalendar.current === key) return;
    initialCalendar.current = key;
    if (isOfficialCalendar(selected.id)) {
      queueMicrotask(() => {
        setView("month");
        setWeek(newYorkDate());
      });
      return;
    }
    const today = newYorkDate(),
      all = combinedEvents(calendars, selected);
    queueMicrotask(() => setView("week"));
    if (
      !all.some(
        (event) =>
          event.start.slice(0, 10) <= today && event.end.slice(0, 10) >= today,
      )
    ) {
      const first =
        all.find((event) => event.end.slice(0, 10) >= today) ?? all.at(-1);
      queueMicrotask(() =>
        setWeek(monday(first ? first.start.slice(0, 10) : today)),
      );
    }
  }, [ready, selected, calendars, account]);
  const weekStart = monday(week);
  const dates = Array.from({ length: 7 }, (_, i) => shift(weekStart, i));
  const officialEvents = selected?.includeAcademic
    ? academicEvents(academic)
    : [];
  const eventDate = (event: CalendarEvent) =>
    event.allDay
      ? event.start
      : new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/New_York",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(event.start));
  const rangeStart =
    officialSelected && view !== "week" ? week.slice(0, 7) + "-01" : weekStart;
  const rangeEnd =
    officialSelected && view !== "week"
      ? new Date(
          Date.UTC(Number(week.slice(0, 4)), Number(week.slice(5, 7)), 0),
        )
          .toISOString()
          .slice(0, 10)
      : dates[6];
  const allEvents = [
    ...new Map(
      [...events, ...officialEvents].map((event) => [event.id, event]),
    ).values(),
  ];
  const visible = allEvents.filter((event) =>
    eventInDateRange(event, rangeStart, rangeEnd),
  );
  function navigate(offset: number) {
    setWeek(
      officialSelected && view !== "week"
        ? new Date(
            Date.UTC(
              Number(week.slice(0, 4)),
              Number(week.slice(5, 7)) - 1 + offset,
              1,
            ),
          )
            .toISOString()
            .slice(0, 10)
        : shift(week, offset * 7),
    );
  }
  const stale =
    selected?.kind === "simulation" &&
    selected.term &&
    selected.fingerprint !== semesterFingerprint(plan, selected.term);
  function download() {
    if (!selected) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          exportCalendar(
            selected.title,
            [
              ...events,
              ...academicForCalendar(selected, events, academic).filter(
                (event) => !events.some((item) => item.id === event.id),
              ),
            ],
            selected.id,
          ),
        ],
        {
          type: "text/calendar;charset=utf-8",
        },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "calendar.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <AppHeader />
      <main
        className={`${styles.root} rr-block`}
        data-telemetry-private
        data-analytics-area="calendar"
      >
        <header className={styles.top}>
          <div>
            <h1>
              <CalendarDays size={26} /> {t("My calendars", "我的日程")}
            </h1>
            <p>
              {t(
                "Classes, deadlines and academic dates",
                "课程、作业截止与学校重要日期",
              )}
            </p>
          </div>
          <div className={styles.actions}>
            <FeatureSyncStatus feature="calendars" locale={locale} />
            <button onClick={() => setCreating(true)} disabled={!ready}>
              <Plus size={15} />
              {t("New calendar", "新建日历")}
            </button>
            <button onClick={() => upload.current?.click()}>
              <Upload size={15} />
              {t("Import ICS", "导入 ICS")}
            </button>
            <button onClick={() => setFeed(true)}>
              <Link2 size={15} />
              {t("Subscribe", "订阅日历")}
            </button>
            <button onClick={() => create("combined")}>
              <Layers size={15} />
              {t("Combine", "组合日历")}
            </button>
          </div>
        </header>
        <input
          hidden
          ref={upload}
          type="file"
          accept=".ics,text/calendar"
          onChange={async (e) => {
            const importAccount = planningScope();
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              if (file.size > 2 * 1024 * 1024) throw Error();
              const calendar = calendarSchema.parse({
                id: browserUuid(),
                kind: "personal",
                title: t("Imported calendar", "导入的日历"),
                events: await parseCalendar(await file.text()),
                updatedAt: new Date().toISOString(),
              });
              if (planningScope() !== importAccount) return;
              const existing = calendars.find(
                (item) =>
                  JSON.stringify(item.events) ===
                  JSON.stringify(calendar.events),
              );
              if (existing) {
                setSelectedId(existing.id);
                setMessage(
                  t("This calendar is already imported", "此日历已导入"),
                );
                return;
              }
              if (!save(calendar) || !(await persist())) return;
              if (calendar.events[0])
                setWeek(monday(calendar.events[0].start.slice(0, 10)));
              setMessage(t("Calendar imported", "日历已导入"));
            } catch {
              setMessage(
                t(
                  "Could not read this calendar (maximum 2 MB).",
                  "日历无法读取，文件上限为 2 MB。",
                ),
              );
            }
          }}
        />
        {(message || storageError) && (
          <p className={styles.status} role="status">
            {storageError
              ? t(
                  "Storage unavailable. Export a backup.",
                  "存储暂不可用，请导出备份。",
                )
              : message}
          </p>
        )}
        <div className={styles.sourceStatus}>
          <ShieldCheck size={15} />
          <span>
            {t("Official calendar", "官方校历")} · OSU University Registrar
          </span>
          <small>
            {academicStatus === "loading"
              ? t("Loading dates…", "正在加载日期…")
              : academicStatus === "ready"
                ? `${academic.length} ${t("dates", "项日期")}${academicUpdated ? " · " + t("Updated ", "更新于 ") + new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" }).format(new Date(academicUpdated)) : ""}`
                : t("Dates unavailable", "日期暂不可用")}
          </small>
          {academicStatus === "error" || academicStatus === "empty" ? (
            <button
              onClick={() => {
                setAcademicStatus("loading");
                setAcademicRetry((value) => value + 1);
              }}
            >
              {t("Retry", "重新加载")}
            </button>
          ) : null}
          <a
            href="https://registrar.osu.edu/academic-calendar/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("View source", "查看来源")}
            <ExternalLink size={12} />
          </a>
        </div>
        <div className={styles.layout}>
          <aside
            className={styles.sidebar}
            aria-label={t("Calendars", "日历清单")}
          >
            {calendars.map((c) => (
              <button
                key={c.id}
                className={styles.calendar}
                data-active={c.id === selected?.id}
                data-color={c.color}
                onClick={() => {
                  setSelectedId(c.id);
                  const today = newYorkDate();
                  const all = combinedEvents(calendars, c);
                  const next =
                    all.find((event) => event.end.slice(0, 10) >= today) ??
                    all.at(-1);
                  setView(isOfficialCalendar(c.id) ? "month" : "week");
                  setWeek(
                    isOfficialCalendar(c.id)
                      ? today
                      : next
                        ? monday(next.start.slice(0, 10))
                        : monday(today),
                  );
                }}
              >
                <strong>
                  {(() => {
                    const Icon = {
                      calendar: CalendarDays,
                      book: BookOpen,
                      graduation: GraduationCap,
                      star: Star,
                    }[c.icon];
                    return <Icon size={14} />;
                  })()}{" "}
                  <span>{c.title}</span>
                </strong>
                <CalendarPreview events={combinedEvents(calendars, c)} />
                <small>
                  {combinedEvents(calendars, c).length} {t("events", "个日程")}{" "}
                  ·{" "}
                  {
                    {
                      simulation: t("Schedule", "课表"),
                      personal: t("Personal", "个人"),
                      feed: t("Subscription", "订阅"),
                      combined: t("Combined", "组合"),
                      official: t("Automatically updated", "自动更新"),
                    }[c.kind]
                  }
                </small>
              </button>
            ))}
          </aside>
          <section className={styles.content}>
            {selected ? (
              <>
                <div className={styles.toolbar}>
                  <div>
                    <h2>{selected.title}</h2>
                    <p>{selected.description}</p>
                  </div>
                  <div className={styles.actions}>
                    {!officialSelected && (
                      <CalendarShare
                        calendars={privateCalendars}
                        selected={selected.id}
                        locale={locale}
                        persist={persist}
                      />
                    )}
                    {!officialSelected && (
                      <button
                        onClick={() => {
                          openCalendar(selected, true);
                        }}
                      >
                        <Pencil size={13} />
                        {t("Edit", "编辑")}
                      </button>
                    )}
                    <button onClick={download}>
                      <Download size={13} />
                      {t("Export", "导出")}
                    </button>
                    {selected.feedUrl && (
                      <button
                        onClick={() => void remote(selected.feedUrl!, selected)}
                      >
                        <RefreshCw size={13} />
                        {t("Refresh", "更新")}
                      </button>
                    )}
                    {!officialSelected && (
                      <button
                        disabled={selected.kind === "feed"}
                        onClick={() => {
                          setEventDirty(false);
                          setEventEditor({
                            id: browserUuid(),
                            title: "",
                            start: week,
                            end: shift(week, 1),
                            allDay: true,
                            category: "event",
                            description: "",
                            location: "",
                          });
                        }}
                      >
                        <Plus size={13} />
                        {t("Event", "日程")}
                      </button>
                    )}
                  </div>
                </div>
                {stale && (
                  <p className={styles.notice}>
                    {t(
                      "Courses changed. This saved group is out of date. Generate a replacement from semester simulation.",
                      "课程已变动，这组课表已过期。请在学期模拟中重新生成并替换。",
                    )}
                  </p>
                )}
                <div className={styles.toolbar}>
                  <div className={styles.actions}>
                    <button
                      aria-label={
                        officialSelected && view !== "week"
                          ? t("Previous month", "上个月")
                          : t("Previous week", "上一周")
                      }
                      onClick={() => navigate(-1)}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() =>
                        setWeek(
                          officialSelected
                            ? newYorkDate()
                            : monday(newYorkDate()),
                        )
                      }
                    >
                      {t("Today", "今天")}
                    </button>
                    <button
                      aria-label={
                        officialSelected && view !== "week"
                          ? t("Next month", "下个月")
                          : t("Next week", "下一周")
                      }
                      onClick={() => navigate(1)}
                    >
                      <ChevronRight size={14} />
                    </button>
                    <span>
                      {officialSelected && view !== "week"
                        ? new Intl.DateTimeFormat(
                            locale === "zh" ? "zh-CN" : "en-US",
                            { year: "numeric", month: "long", timeZone: "UTC" },
                          ).format(new Date(week + "T12:00:00Z"))
                        : `${weekStart} — ${dates[6].slice(5)}`}
                    </span>
                  </div>
                  <ChoiceSelect
                    className={styles.viewSelect}
                    aria-label={t("Calendar view", "日历视图")}
                    value={view}
                    onValueChange={setView}
                  >
                    {officialSelected ? (
                      <option value="month">{t("Month", "月视图")}</option>
                    ) : null}
                    <option value="week">{t("Week", "周视图")}</option>
                    <option value="agenda">{t("Agenda", "日程清单")}</option>
                  </ChoiceSelect>
                </div>
                {view === "month" && officialSelected ? (
                  <CalendarMonth
                    date={week}
                    events={events}
                    locale={locale}
                    onEvent={previewEvent}
                  />
                ) : view === "week" ? (
                  <CalendarWeek
                    events={visible}
                    dates={dates}
                    locale={locale}
                    onEvent={previewEvent}
                  />
                ) : (
                  <div className={styles.agenda}>
                    {!visible.length ? (
                      <p className={styles.empty}>
                        {t(
                          "No events in this period. Change dates or add an event.",
                          "此时间段没有日程，可切换日期或添加日程。",
                        )}
                      </p>
                    ) : null}
                    {visible
                      .sort((a, b) => a.start.localeCompare(b.start))
                      .map((event, index) => (
                        <button
                          key={event.id + index}
                          className={styles.event}
                          data-category={event.category}
                          onClick={(click) =>
                            previewEvent(event, click.currentTarget)
                          }
                        >
                          <strong>{event.title}</strong>
                          <small>
                            <Clock3 size={11} />
                            {eventDate(event)} ·{" "}
                            {event.allDay
                              ? t("All day", "全天")
                              : new Intl.DateTimeFormat(
                                  locale === "zh" ? "zh-CN" : "en-US",
                                  {
                                    timeZone: "America/New_York",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                ).format(new Date(event.start))}
                          </small>
                          {event.location && (
                            <small>
                              <MapPin size={11} />
                              {event.location}
                            </small>
                          )}
                        </button>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <div className={styles.empty}>
                {t(
                  "Save a simulation group or import a calendar to get started.",
                  "保存模拟课表或导入日历后，即可在这里统一查看。",
                )}
              </div>
            )}
          </section>
        </div>
        <WorkspaceDialog
          open={creating}
          onOpenChange={setCreating}
          title={t("Create a calendar", "创建日历")}
          description={t("Choose how to start", "选择一种方式开始安排")}
          closeLabel={t("Close", "关闭")}
          guard={false}
          detectFormChanges={false}
        >
          <div className={styles.createOptions}>
            <button onClick={() => create()}>
              <CalendarDays size={22} />
              <span>
                <strong>{t("Personal calendar", "个人日历")}</strong>
                <small>
                  {t(
                    "Add classes, activities and reminders yourself.",
                    "自由添加课程、活动和提醒。",
                  )}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setFeed(true);
              }}
            >
              <Link2 size={22} />
              <span>
                <strong>{t("Subscribe to a feed", "订阅远程日历")}</strong>
                <small>
                  {t(
                    "Keep Canvas assignments or another ICS feed up to date.",
                    "持续获取 Canvas 作业或其他 ICS 日历。",
                  )}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => create("combined")}>
              <Layers size={22} />
              <span>
                <strong>{t("Combine calendars", "组合已有日历")}</strong>
                <small>
                  {t(
                    "Bring your schedule and official dates together.",
                    "将课表与官方校历汇总在一个视图。",
                  )}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          </div>
        </WorkspaceDialog>
        <WorkspaceDialog
          open={!!editor}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          title={
            editor?.existing
              ? t("Calendar settings", "日历设置")
              : t("Create your calendar", "创建你的日历")
          }
          description={t(
            "Name it, choose an appearance and add sources",
            "设置名称、外观与日程来源",
          )}
          closeLabel={t("Close", "关闭")}
          dirty={!!editor && JSON.stringify(editor) !== editorBaseline}
          detectFormChanges={false}
        >
          {editor ? (
            <CalendarSettings
              key={editor.editorSession}
              value={editor}
              onChange={(value) =>
                setEditor({
                  ...value,
                  editorSession: editor.editorSession,
                  existing: editor.existing,
                })
              }
              calendars={calendars}
              locale={locale}
              onSave={async () => {
                const session = editor.editorSession;
                if (!save(editor) || !(await persist())) throw Error("storage");
                setEditor((current) =>
                  current?.editorSession === session ? null : current,
                );
              }}
              onRemove={
                editor.existing
                  ? async () => {
                      const session = editor.editorSession;
                      setPlan((current) => ({
                        ...current,
                        schedule: {
                          ...current.schedule,
                          calendars: current.schedule.calendars?.filter(
                            (calendar) => calendar.id !== editor.id,
                          ),
                        },
                      }));
                      if (!(await persist())) throw Error("storage");
                      setEditor((current) =>
                        current?.editorSession === session ? null : current,
                      );
                    }
                  : undefined
              }
            />
          ) : null}
        </WorkspaceDialog>
        <WorkspaceDialog
          open={!!officialEvent}
          onOpenChange={(open) => {
            if (!open) setOfficialEvent(null);
          }}
          title={officialEvent?.title.split(" | ")[0] ?? ""}
          description={t("Official OSU calendar entry", "OSU 官方校历安排")}
          closeLabel={t("Close", "关闭")}
          guard={false}
          detectFormChanges={false}
        >
          {officialEvent ? (
            <div className={styles.officialDetail}>
              <span>
                <CalendarDays size={18} />
                {officialEvent.start} — {shift(officialEvent.end, -1)}
              </span>
              <p>{officialEvent.title.split(" | ").slice(1).join(" · ")}</p>
              <a
                href="https://registrar.osu.edu/academic-calendar/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ShieldCheck size={15} />
                OSU University Registrar
                <ExternalLink size={13} />
              </a>
            </div>
          ) : null}
        </WorkspaceDialog>
        <WorkspaceDialog
          open={feed}
          onOpenChange={setFeed}
          title={t("Subscribe to a calendar", "订阅远程日历")}
          description={t(
            "Canvas, Google or Outlook ICS URL",
            "Canvas、Google 或 Outlook 的 ICS 地址",
          )}
          closeLabel={t("Close", "关闭")}
        >
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void remote(feedUrl);
            }}
          >
            <label>
              {t("Private calendar URL", "私密日历地址")}
              <input
                required
                type="url"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                autoComplete="off"
              />
            </label>
            <p>
              {t(
                "The address and events sync privately to your account. Sharing a calendar excludes this source address.",
                "地址和事件将随账号私密同步。分享日历时会移除订阅来源地址。",
              )}
            </p>
            <button>{t("Subscribe", "订阅")}</button>
          </form>
        </WorkspaceDialog>
        <WorkspaceDialog
          open={!!eventEditor}
          onOpenChange={(open) => {
            if (!open) setEventEditor(null);
          }}
          title={t("Edit event", "编辑日程")}
          description={selected?.title ?? ""}
          closeLabel={t("Close", "关闭")}
          dirty={eventDirty}
          detectFormChanges={false}
          closeOnly
        >
          {eventEditor && selected && (
            <CalendarEventEditor
              key={eventEditor.id}
              event={eventEditor}
              locale={locale}
              readOnly={selected.kind === "feed"}
              onDirtyChange={setEventDirty}
              onSave={async (event) => {
                if (
                  !save({
                    ...selected,
                    events: [
                      ...selected.events.filter((item) => item.id !== event.id),
                      event,
                    ],
                  }) ||
                  !(await persist())
                )
                  return false;
                setEventDirty(false);
                setEventEditor(null);
                return true;
              }}
              onRemove={
                selected.events.some((event) => event.id === eventEditor.id)
                  ? async () => {
                      if (
                        !save({
                          ...selected,
                          events: selected.events.filter(
                            (event) => event.id !== eventEditor.id,
                          ),
                        }) ||
                        !(await persist())
                      )
                        return false;
                      setEventDirty(false);
                      setEventEditor(null);
                      return true;
                    }
                  : undefined
              }
              onCopy={async () => {
                const copy = calendarSchema.parse({
                  ...selected,
                  id: browserUuid(),
                  kind: "personal",
                  title: (
                    selected.title + t(" · editable copy", " · 可编辑副本")
                  ).slice(0, 120),
                  feedUrl: undefined,
                  refreshedAt: undefined,
                  sourceIds: [],
                  fingerprint: undefined,
                });
                if (!save(copy) || !(await persist())) return false;
                setEventDirty(false);
                setEventEditor(null);
                return true;
              }}
            />
          )}
        </WorkspaceDialog>
      </main>
      <EventDetails
        preview={eventPreview}
        locale={locale}
        onClose={() => setEventPreview(null)}
        onEdit={editEvent}
      />
      <AppFooter />
    </>
  );
}

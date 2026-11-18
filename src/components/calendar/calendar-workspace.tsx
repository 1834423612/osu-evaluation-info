"use client";
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
import { CalendarEventEditor } from "./event-editor";
import {
  calendarSchema,
  combinedEvents,
  type UserCalendar,
  type CalendarEvent,
} from "@/lib/calendar/model";
import { parseCalendar, exportCalendar } from "@/lib/calendar/ical";
import { semesterFingerprint } from "@/lib/calendar/schedules";
import type { AcademicDay } from "@/lib/calendar/academic";
import { academicEvents, academicForCalendar } from "@/lib/calendar/academic";
import { browserUuid } from "@/lib/uuid";
import styles from "./calendar.module.css";
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
  const calendars = useMemo(
    () => plan.schedule.calendars ?? [],
    [plan.schedule.calendars],
  );
  const [selectedId, setSelectedId] = useState("");
  const selected = calendars.find((c) => c.id === selectedId) ?? calendars[0];
  const [week, setWeek] = useState(() => monday(dateString(new Date())));
  const [view, setView] = useState("week");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [editor, setEditor] = useState<UserCalendar | null>(null);
  const [feed, setFeed] = useState(false),
    [feedUrl, setFeedUrl] = useState("");
  const [eventEditor, setEventEditor] = useState<CalendarEvent | null>(null);
  const [eventDirty, setEventDirty] = useState(false);
  const [academic, setAcademic] = useState<AcademicDay[]>([]);
  const upload = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/calendar/academic", { signal: c.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!c.signal.aborted) setAcademic(d.days);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  function save(calendar: UserCalendar) {
    try {
      const value = calendarSchema.parse({
        ...calendar,
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
  function editEvent(event: CalendarEvent) {
    if (event.id.startsWith("official-")) {
      setMessage(event.title + " · OSU University Registrar");
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
    if (owner && original) {
      setEventDirty(false);
      setSelectedId(owner.id);
      setEventEditor(structuredClone(original));
    }
  }
  function create(kind: UserCalendar["kind"] = "personal") {
    setEditor(
      calendarSchema.parse({
        id: browserUuid(),
        kind,
        title: t("My calendar", "我的日程"),
        events: [],
        updatedAt: new Date().toISOString(),
      }),
    );
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
              {
                ...calendar,
                ...(live
                  ? {
                      title: live.title,
                      description: live.description,
                      icon: live.icon,
                      color: live.color,
                    }
                  : {}),
              },
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
    const today = dateString(new Date()),
      all = combinedEvents(calendars, selected);
    if (
      !all.some(
        (event) =>
          event.start.slice(0, 10) <= today && event.end.slice(0, 10) >= today,
      )
    ) {
      const first =
        all.find((event) => event.end.slice(0, 10) >= today) ?? all.at(-1);
      if (first)
        queueMicrotask(() => setWeek(monday(first.start.slice(0, 10))));
    }
  }, [ready, selected, calendars, account]);
  const dates = Array.from({ length: 7 }, (_, i) => shift(week, i));
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
  const visible = [...events, ...officialEvents].filter(
    (e) => e.start.slice(0, 10) <= dates[6] && e.end.slice(0, 10) >= week,
  );
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
            <button onClick={() => create()} disabled={!ready}>
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
                  const first = combinedEvents(calendars, c)[0];
                  if (first) setWeek(monday(first.start.slice(0, 10)));
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
                  {c.title}
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
                    <CalendarShare
                      calendars={calendars}
                      selected={selected.id}
                      locale={locale}
                      persist={persist}
                    />
                    <button
                      onClick={() => setEditor(structuredClone(selected))}
                    >
                      <Pencil size={13} />
                      {t("Edit", "编辑")}
                    </button>
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
                      aria-label={t("Previous week", "上一周")}
                      onClick={() => setWeek(shift(week, -7))}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={() => setWeek(monday(dateString(new Date())))}
                    >
                      {t("Today", "今天")}
                    </button>
                    <button
                      aria-label={t("Next week", "下一周")}
                      onClick={() => setWeek(shift(week, 7))}
                    >
                      <ChevronRight size={14} />
                    </button>
                    <span>
                      {week} — {dates[6].slice(5)}
                    </span>
                  </div>
                  <ChoiceSelect
                    className={styles.viewSelect}
                    aria-label={t("Calendar view", "日历视图")}
                    value={view}
                    onValueChange={setView}
                  >
                    <option value="week">{t("Week", "周视图")}</option>
                    <option value="agenda">{t("Agenda", "日程清单")}</option>
                  </ChoiceSelect>
                </div>
                {view === "week" ? (
                  <CalendarWeek
                    events={visible}
                    dates={dates}
                    locale={locale}
                    onEvent={editEvent}
                  />
                ) : (
                  <div className={styles.agenda}>
                    {visible
                      .sort((a, b) => a.start.localeCompare(b.start))
                      .map((event, index) => (
                        <button
                          key={event.id + index}
                          className={styles.event}
                          data-category={event.category}
                          onClick={() => editEvent(event)}
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
          open={!!editor}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          title={t("Calendar settings", "日历设置")}
          description={t("Name, appearance and sources", "名称、样式与来源")}
          closeLabel={t("Close", "关闭")}
          dirty={
            !!editor &&
            JSON.stringify(editor) !==
              JSON.stringify(calendars.find((c) => c.id === editor.id))
          }
        >
          {editor && (
            <form
              className={styles.form}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!save(editor) || !(await persist())) return;
                setEditor(null);
              }}
            >
              <label>
                {t("Title", "标题")}
                <input
                  required
                  maxLength={120}
                  value={editor.title}
                  onChange={(e) =>
                    setEditor({ ...editor, title: e.target.value })
                  }
                />
              </label>
              <label>
                {t("Description", "介绍")}
                <textarea
                  maxLength={1000}
                  value={editor.description}
                  onChange={(e) =>
                    setEditor({ ...editor, description: e.target.value })
                  }
                />
              </label>
              <label>
                {t("Icon", "图标")}
                <ChoiceSelect
                  value={editor.icon}
                  onValueChange={(icon) =>
                    setEditor({ ...editor, icon: icon as UserCalendar["icon"] })
                  }
                >
                  {["calendar", "book", "graduation", "star"].map(
                    (icon, index) => (
                      <option key={icon} value={icon}>
                        {locale === "zh"
                          ? ["日历", "课程", "学业", "星标"][index]
                          : ["Calendar", "Book", "Graduation", "Star"][index]}
                      </option>
                    ),
                  )}
                </ChoiceSelect>
              </label>
              <label>
                {t("Color", "颜色")}
                <ChoiceSelect
                  value={editor.color}
                  onValueChange={(color) =>
                    setEditor({
                      ...editor,
                      color: color as UserCalendar["color"],
                    })
                  }
                >
                  {["rose", "blue", "mint", "violet", "amber"].map(
                    (color, index) => (
                      <option key={color} value={color}>
                        {locale === "zh"
                          ? ["玫瑰", "天空", "薄荷", "淡紫", "琥珀"][index]
                          : color}
                      </option>
                    ),
                  )}
                </ChoiceSelect>
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={editor.includeAcademic}
                onClick={() =>
                  setEditor({
                    ...editor,
                    includeAcademic: !editor.includeAcademic,
                  })
                }
              >
                {editor.includeAcademic ? "✓ " : ""}
                {t("Include OSU academic dates", "包含 OSU 官方校历")}
              </button>
              {editor.kind === "combined" &&
                calendars
                  .filter((c) => c.id !== editor.id)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="checkbox"
                      aria-checked={editor.sourceIds.includes(c.id)}
                      onClick={() =>
                        setEditor({
                          ...editor,
                          sourceIds: editor.sourceIds.includes(c.id)
                            ? editor.sourceIds.filter((id) => id !== c.id)
                            : [...editor.sourceIds, c.id],
                        })
                      }
                    >
                      {editor.sourceIds.includes(c.id) ? "✓" : "+"} {c.title}
                    </button>
                  ))}
              <div className={styles.actions}>
                <button type="submit">{t("Save", "保存")}</button>
                {calendars.some((c) => c.id === editor.id) && (
                  <button
                    type="button"
                    onClick={async () => {
                      setPlan((p) => ({
                        ...p,
                        schedule: {
                          ...p.schedule,
                          calendars: p.schedule.calendars?.filter(
                            (c) => c.id !== editor.id,
                          ),
                        },
                      }));
                      if (await persist()) setEditor(null);
                    }}
                  >
                    {t("Delete calendar", "删除日历")}
                  </button>
                )}
              </div>
            </form>
          )}
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
      <AppFooter />
    </>
  );
}

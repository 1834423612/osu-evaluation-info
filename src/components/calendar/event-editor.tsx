"use client";
import { useState } from "react";
import { Clock3, MapPin, Save, Trash2, Copy } from "lucide-react";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { useDraftGuard } from "@/components/forms/draft-guard";
import { calendarEventSchema, type CalendarEvent } from "@/lib/calendar/model";
import { newYorkTime } from "@/lib/calendar/schedules";
import type { Locale } from "@/lib/i18n";
import { DateField } from "./date-field";
import styles from "./calendar-forms.module.css";
const day = (value: string) =>
  value.length === 10
    ? value
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value));
const time = (value: string, fallback: string) =>
  value.length === 10
    ? fallback
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value));
const shift = (value: string) =>
  new Date(Date.parse(value + "T12:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);
export function CalendarEventEditor({
  event,
  locale,
  onSave,
  onRemove,
  onCopy,
  onDirtyChange,
  readOnly = false,
}: {
  event: CalendarEvent;
  locale: Locale;
  onSave: (event: CalendarEvent) => Promise<boolean>;
  onRemove?: () => Promise<boolean>;
  onCopy?: () => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
  readOnly?: boolean;
}) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const initial = {
    title: event.title,
    description: event.description,
    location: event.location,
    start: day(event.start),
    end: day(event.end),
    from: time(event.start, "09:00"),
    to: time(event.end, "10:00"),
    allDay: event.allDay,
    category: event.category,
  };
  const [draft, setDraft] = useState(initial),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  useDraftGuard(dirty && !readOnly);
  function update(next: Partial<typeof draft>) {
    const value = { ...draft, ...next };
    setDraft(value);
    onDirtyChange(JSON.stringify(value) !== JSON.stringify(initial));
  }
  const options = (value: string) =>
    [
      ...new Set([
        value,
        ...Array.from(
          { length: 96 },
          (_, index) =>
            `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`,
        ),
      ]),
    ].sort();
  const instant = (date: string, value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return newYorkTime(date, hour * 60 + minute);
  };
  return (
    <form
      className={styles.form}
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage("");
        const parsed = calendarEventSchema.safeParse({
          ...event,
          title: draft.title.trim(),
          description: draft.description,
          location: draft.location,
          allDay: draft.allDay,
          category: draft.category,
          start: draft.allDay ? draft.start : instant(draft.start, draft.from),
          end: draft.allDay ? draft.end : instant(draft.end, draft.to),
        });
        if (
          !parsed.success ||
          !draft.title.trim() ||
          (draft.allDay && draft.end <= draft.start)
        ) {
          setMessage(
            t("Check the title and date range.", "请检查标题与日期范围。"),
          );
          return;
        }
        setBusy(true);
        try {
          if (!(await onSave(parsed.data)))
            setMessage(
              t(
                "Could not save. Check available storage.",
                "保存失败，请检查存储空间。",
              ),
            );
        } finally {
          setBusy(false);
        }
      }}
    >
      {readOnly && (
        <p className={styles.notice}>
          {t(
            "Subscribed events follow their source. Create an editable copy to make changes.",
            "订阅事件随来源更新。创建可编辑副本后可自行修改。",
          )}
        </p>
      )}
      <label>
        {t("Title", "标题")}
        <input
          required
          value={draft.title}
          maxLength={500}
          disabled={readOnly}
          onChange={(e) => update({ title: e.target.value })}
        />
      </label>
      <div className={styles.dates}>
        <label>
          {t("Start date", "开始日期")}
          <DateField
            locale={locale}
            value={draft.start}
            label={t("Start date", "开始日期")}
            disabled={readOnly}
            onChange={(start) =>
              update({
                start,
                ...(draft.end < start
                  ? { end: draft.allDay ? shift(start) : start }
                  : {}),
              })
            }
          />
        </label>
        <label>
          {t("End date", "结束日期")}
          <DateField
            locale={locale}
            value={draft.end}
            label={t("End date", "结束日期")}
            disabled={readOnly}
            onChange={(end) => update({ end })}
          />
        </label>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={draft.allDay}
        disabled={readOnly}
        className={styles.toggle}
        onClick={() =>
          update({
            allDay: !draft.allDay,
            end: draft.allDay ? draft.start : shift(draft.end),
          })
        }
      >
        {draft.allDay ? "✓ " : ""}
        {t("All day", "全天")}
      </button>
      {draft.allDay ? (
        <p className={styles.hint}>
          {t("The end date is not included.", "全天日程不包含结束日期当天。")}
        </p>
      ) : (
        <div className={styles.dates}>
          {(["from", "to"] as const).map((field) => (
            <label key={field}>
              <span>
                <Clock3 size={12} />
                {field === "from"
                  ? t("Start time", "开始时间")
                  : t("End time", "结束时间")}
              </span>
              <ChoiceSelect
                disabled={readOnly}
                value={draft[field]}
                onValueChange={(value) => update({ [field]: value })}
              >
                {options(draft[field]).map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </ChoiceSelect>
            </label>
          ))}
        </div>
      )}
      <label>
        {t("Type", "类型")}
        <ChoiceSelect
          disabled={readOnly}
          value={draft.category}
          onValueChange={(category) =>
            update({ category: category as CalendarEvent["category"] })
          }
        >
          {["class", "assignment", "exam", "holiday", "event"].map(
            (category, index) => (
              <option key={category} value={category}>
                {locale === "zh"
                  ? ["课程", "作业", "考试", "假日", "个人日程"][index]
                  : category}
              </option>
            ),
          )}
        </ChoiceSelect>
      </label>
      <label>
        <span>
          <MapPin size={12} />
          {t("Location or online meeting", "地点或线上会议")}
        </span>
        <input
          value={draft.location}
          maxLength={500}
          disabled={readOnly}
          onChange={(e) => update({ location: e.target.value })}
        />
      </label>
      <label>
        {t("Description", "介绍")}
        <textarea
          value={draft.description}
          maxLength={4000}
          disabled={readOnly}
          onChange={(e) => update({ description: e.target.value })}
        />
      </label>
      {event.session && (
        <p className={styles.hint}>
          {event.session} · {t("Eastern time", "美国东部时间")}
        </p>
      )}
      {message && (
        <p role="alert" className={styles.notice}>
          {message}
        </p>
      )}
      <div className={styles.actions}>
        {!readOnly && (
          <button disabled={busy}>
            <Save size={14} />
            {t("Save event", "保存日程")}
          </button>
        )}
        {!readOnly && onRemove && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (!(await onRemove()))
                  setMessage(t("Could not remove event", "移除失败"));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={14} />
            {t("Remove", "移除")}
          </button>
        )}
        {readOnly && onCopy && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (!(await onCopy()))
                  setMessage(t("Could not copy calendar", "复制失败"));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Copy size={14} />
            {t("Create an editable calendar copy", "创建可编辑的日历副本")}
          </button>
        )}
      </div>
    </form>
  );
}

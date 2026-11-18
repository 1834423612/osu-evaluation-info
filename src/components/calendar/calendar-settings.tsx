"use client";
import { useState } from "react";
import {
  CalendarDays,
  BookOpen,
  GraduationCap,
  Star,
  Check,
  Layers,
  Info,
} from "lucide-react";
import type { UserCalendar } from "@/lib/calendar/model";
import type { Locale } from "@/lib/i18n";
import styles from "./calendar-settings.module.css";

const icons = {
  calendar: CalendarDays,
  book: BookOpen,
  graduation: GraduationCap,
  star: Star,
};
export function CalendarSettings({
  value,
  onChange,
  calendars,
  locale,
  onSave,
  onRemove,
}: {
  value: UserCalendar;
  onChange: (calendar: UserCalendar) => void;
  calendars: UserCalendar[];
  locale: Locale;
  onSave: () => Promise<void>;
  onRemove?: () => Promise<void>;
}) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const [busy, setBusy] = useState(false),
    [removing, setRemoving] = useState(false),
    [error, setError] = useState(false);
  const Icon = icons[value.icon];
  return (
    <form
      className={styles.form}
      onSubmit={async (event) => {
        event.preventDefault();
        setError(false);
        setBusy(true);
        try {
          await onSave();
        } catch {
          setError(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className={styles.fields}>
        <div className={styles.preview} data-color={value.color}>
          <span>
            <Icon size={24} />
          </span>
          <div>
            <strong>
              {value.title || t("Untitled calendar", "未命名日历")}
            </strong>
            <small>
              {value.kind === "combined"
                ? t("Combined sources", "组合多个日历来源")
                : value.kind === "feed"
                  ? t("Live subscription", "持续更新的订阅")
                  : t("Your events and schedule", "你的课程、活动与提醒")}
            </small>
          </div>
        </div>
        <label>
          {t("Calendar name", "日历名称")}
          <input
            name="calendar-title"
            required
            autoComplete="off"
            maxLength={120}
            placeholder={t("e.g. Spring classes…", "例如：春季课程安排…")}
            value={value.title}
            onChange={(event) =>
              onChange({ ...value, title: event.target.value })
            }
          />
        </label>
        <label>
          {t("Description (optional)", "介绍（选填）")}
          <textarea
            name="calendar-description"
            maxLength={1000}
            placeholder={t(
              "What belongs in this calendar?",
              "这份日历用来安排什么？",
            )}
            value={value.description}
            onChange={(event) =>
              onChange({ ...value, description: event.target.value })
            }
          />
        </label>
        <div className={styles.appearance}>
          <fieldset>
            <legend>{t("Icon", "图标")}</legend>
            <div
              className={styles.choices}
              role="radiogroup"
              aria-label={t("Calendar icon", "日历图标")}
            >
              {Object.entries(icons).map(([key, Item], index) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={value.icon === key}
                  aria-label={
                    (locale === "zh"
                      ? ["日历", "课程", "学业", "星标"]
                      : ["Calendar", "Book", "Graduation", "Star"])[index]
                  }
                  onClick={() =>
                    onChange({ ...value, icon: key as UserCalendar["icon"] })
                  }
                >
                  <Item size={17} />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>{t("Color", "颜色")}</legend>
            <div
              className={styles.choices}
              role="radiogroup"
              aria-label={t("Calendar color", "日历颜色")}
            >
              {(["rose", "blue", "mint", "violet", "amber"] as const).map(
                (color, index) => (
                  <button
                    key={color}
                    type="button"
                    className={styles.swatch}
                    data-color={color}
                    role="radio"
                    aria-checked={value.color === color}
                    aria-label={
                      (locale === "zh"
                        ? ["玫瑰", "天空", "薄荷", "淡紫", "琥珀"]
                        : ["Rose", "Sky", "Mint", "Violet", "Amber"])[index]
                    }
                    onClick={() => onChange({ ...value, color })}
                  >
                    {value.color === color ? <Check size={14} /> : null}
                  </button>
                ),
              )}
            </div>
          </fieldset>
        </div>
        <label className={styles.option}>
          <input
            type="checkbox"
            checked={value.includeAcademic}
            onChange={(event) =>
              onChange({ ...value, includeAcademic: event.target.checked })
            }
          />
          <span>
            {t("Show OSU academic dates", "叠加 OSU 官方校历")}
            <small>
              {t(
                "Holidays, no-class dates and exam periods appear alongside your events.",
                "在你的日程中同时展示假期、停课日期和考试周期。",
              )}
            </small>
          </span>
        </label>
        {value.kind === "combined" ? (
          <fieldset className={styles.sources}>
            <legend>
              <Layers size={15} />
              {t("Choose source calendars", "选择组合来源")}
            </legend>
            {calendars
              .filter((calendar) => calendar.id !== value.id)
              .map((calendar) => (
                <label key={calendar.id} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={value.sourceIds.includes(calendar.id)}
                    disabled={
                      !value.sourceIds.includes(calendar.id) &&
                      value.sourceIds.length >= 30
                    }
                    onChange={(event) =>
                      onChange({
                        ...value,
                        sourceIds: event.target.checked
                          ? [...value.sourceIds, calendar.id]
                          : value.sourceIds.filter((id) => id !== calendar.id),
                      })
                    }
                  />
                  <span>
                    {calendar.title}
                    <small>
                      {calendar.kind === "official"
                        ? t(
                            "Official source · updates automatically",
                            "官方来源 · 自动更新",
                          )
                        : `${calendar.events.length} ${t("events", "项日程")}`}
                    </small>
                  </span>
                </label>
              ))}
          </fieldset>
        ) : (
          <p className={styles.hint}>
            <Info size={14} />
            {t(
              "After saving, add events or save a semester simulation to your calendars.",
              "保存后可添加日程，也可从学期模拟保存完整课表。",
            )}
          </p>
        )}
        <div className={styles.footer}>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? t("Saving…", "正在保存…") : t("Save calendar", "保存日历")}
          </button>
          {onRemove ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRemoving(!removing)}
            >
              {t("Remove calendar", "移除日历")}
            </button>
          ) : null}
        </div>
        {removing && onRemove ? (
          <div className={styles.confirm}>
            <p>
              {t(
                "Remove this calendar and its own events? Source calendars remain available.",
                "移除此日历及其中的自建日程？组合来源日历仍会保留。",
              )}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(false);
                try {
                  await onRemove();
                } catch {
                  setError(true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t("Confirm removal", "确认移除")}
            </button>
          </div>
        ) : null}
      </fieldset>
      {error ? (
        <p role="alert">
          {t(
            "Could not save changes. Your draft is still here; try again.",
            "未能保存更改，草稿已保留，请重试。",
          )}
        </p>
      ) : null}
    </form>
  );
}

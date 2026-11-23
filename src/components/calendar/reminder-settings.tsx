"use client";
import { Bell, Plus, X } from "lucide-react";
import { ChoiceSelect } from "@/components/ui/choice-select";
import type { Locale } from "@/lib/i18n";
import styles from "./reminder-settings.module.css";

const presets = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
export function ReminderSettings({
  value,
  onChange,
  locale,
  inherit = false,
  disabled = false,
}: {
  value: number[] | undefined;
  onChange: (value: number[] | undefined) => void;
  locale: Locale;
  inherit?: boolean;
  disabled?: boolean;
}) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const label = (minutes: number) =>
    minutes === 0
      ? t("At start", "开始时")
      : minutes % 1440 === 0
        ? t(`${minutes / 1440} day(s) before`, `提前 ${minutes / 1440} 天`)
        : minutes % 60 === 0
          ? t(`${minutes / 60} hour(s) before`, `提前 ${minutes / 60} 小时`)
          : t(`${minutes} minutes before`, `提前 ${minutes} 分钟`);
  return (
    <fieldset className={styles.reminders} disabled={disabled}>
      <legend>
        <Bell size={14} />
        {t("Reminders", "提醒时间")}
      </legend>
      {inherit ? (
        <label className={styles.inherit}>
          <input
            type="checkbox"
            checked={value === undefined}
            onChange={(event) =>
              onChange(event.target.checked ? undefined : [])
            }
          />
          {t("Use calendar reminders", "使用此日历的默认提醒")}
        </label>
      ) : null}
      {value !== undefined ? (
        <>
          {value.map((minutes, index) => (
            <div className={styles.row} key={index}>
              <ChoiceSelect
                aria-label={t(
                  `Reminder ${index + 1}`,
                  `第 ${index + 1} 次提醒`,
                )}
                value={String(minutes)}
                onValueChange={(next) =>
                  onChange(
                    value.map((item, at) =>
                      at === index ? Number(next) : item,
                    ),
                  )
                }
              >
                {[...new Set([...presets, minutes])]
                  .sort((a, b) => a - b)
                  .map((item) => (
                    <option
                      key={item}
                      value={item}
                      disabled={item !== minutes && value.includes(item)}
                    >
                      {label(item)}
                    </option>
                  ))}
              </ChoiceSelect>
              <button
                type="button"
                aria-label={t(
                  `Remove reminder ${index + 1}`,
                  `移除第 ${index + 1} 次提醒`,
                )}
                onClick={() => onChange(value.filter((_, at) => at !== index))}
              >
                <X size={15} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className={styles.add}
            disabled={value.length >= 5}
            onClick={() =>
              onChange([
                ...value,
                presets.find((item) => !value.includes(item) && item > 0) ?? 0,
              ])
            }
          >
            <Plus size={14} />
            {t("Add reminder", "添加提醒")}
          </button>
          {!value.length ? (
            <p>{t("No reminders set.", "尚未设置提醒。")}</p>
          ) : null}
        </>
      ) : null}
      <p>
        {t(
          "Up to 5 reminders. Included in ICS exports and device subscriptions; delivery depends on your calendar app settings. All-day reminders use midnight at the start of the date.",
          "最多设置 5 次提醒，会包含在 ICS 导出与设备订阅中；是否通知由设备日历设置决定。全天日程以开始日期的零点为提醒基准。",
        )}
      </p>
    </fieldset>
  );
}

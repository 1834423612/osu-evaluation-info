"use client";
import { useState } from "react";
import { Popover } from "radix-ui";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { ChoiceSelect } from "@/components/ui/choice-select";
import type { Locale } from "@/lib/i18n";
import styles from "./calendar-forms.module.css";
export function DateField({
  value,
  onChange,
  label,
  locale,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  locale: Locale;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [month, setMonth] = useState(value.slice(0, 7));
  const [year, number] = month.split("-").map(Number),
    first = new Date(Date.UTC(year, number - 1, 1)),
    offset = (first.getUTCDay() + 6) % 7;
  const move = (step: number) =>
    setMonth(
      new Date(Date.UTC(year, number - 1 + step, 1)).toISOString().slice(0, 7),
    );
  const weekdays =
    locale === "zh"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["M", "T", "W", "T", "F", "S", "S"];
  const years = [
    ...new Set([
      year,
      ...Array.from({ length: 81 }, (_, index) => 2020 + index),
    ]),
  ].sort((a, b) => a - b);
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setMonth(value.slice(0, 7));
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={styles.dateTrigger}
          aria-label={label}
        >
          <CalendarDays size={14} />
          {value}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={8}
          className={`${styles.datePicker} rr-block`}
          data-telemetry-private
          aria-label={label}
        >
          <div className={styles.dateHeading}>
            <button
              type="button"
              aria-label={locale === "zh" ? "上个月" : "Previous month"}
              onClick={() => move(-1)}
            >
              <ChevronLeft size={14} />
            </button>
            <ChoiceSelect
              aria-label={locale === "zh" ? "月份" : "Month"}
              value={number}
              onValueChange={(next) =>
                setMonth(`${year}-${next.padStart(2, "0")}`)
              }
            >
              {Array.from({ length: 12 }, (_, index) => (
                <option key={index} value={index + 1}>
                  {new Intl.DateTimeFormat(
                    locale === "zh" ? "zh-CN" : "en-US",
                    { timeZone: "UTC", month: "short" },
                  ).format(new Date(Date.UTC(2026, index, 1)))}
                </option>
              ))}
            </ChoiceSelect>
            <ChoiceSelect
              aria-label={locale === "zh" ? "年份" : "Year"}
              value={year}
              onValueChange={(next) =>
                setMonth(`${next}-${String(number).padStart(2, "0")}`)
              }
            >
              {years.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </ChoiceSelect>
            <button
              type="button"
              aria-label={locale === "zh" ? "下个月" : "Next month"}
              onClick={() => move(1)}
            >
              <ChevronRight size={14} />
            </button>
          </div>
          <div className={styles.dateDays}>
            {weekdays.map((day, index) => (
              <small key={index}>{day}</small>
            ))}
            {Array.from({ length: 42 }, (_, index) => {
              const date = new Date(
                  Date.UTC(year, number - 1, index - offset + 1),
                ),
                key = date.toISOString().slice(0, 10);
              return (
                <button
                  type="button"
                  key={key}
                  aria-label={key}
                  aria-pressed={value === key}
                  data-outside={date.getUTCMonth() !== number - 1}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  {date.getUTCDate()}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

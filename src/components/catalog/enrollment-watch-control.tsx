"use client";

import { useId } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ENROLLMENT_WATCH_INTERVALS,
  type EnrollmentWatchInterval,
} from "@/hooks/use-preferences";
import { text, type Locale } from "@/lib/i18n";

export function EnrollmentWatchControl({
  enabled,
  intervalSeconds,
  locale,
  onEnabledChange,
  onIntervalChange,
}: {
  enabled: boolean;
  intervalSeconds: EnrollmentWatchInterval;
  locale: Locale;
  onEnabledChange: (enabled: boolean) => void;
  onIntervalChange: (interval: EnrollmentWatchInterval) => void;
}) {
  const hintId = useId();
  const intervalLabel = text(locale, "Refresh interval", "刷新间隔");

  return (
    <div className="enrollment-watch-control">
      <label className="enrollment-watch-toggle">
        <input
          type="checkbox"
          role="switch"
          data-analytics-action="enrollment_watch_toggle"
          data-analytics-label="enrollment_watch"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.currentTarget.checked)}
          aria-describedby={hintId}
        />
        <span className="enrollment-watch-copy">
          <strong>{text(locale, "Seat watch", "抢课模式")}</strong>
          <small id={hintId}>
            {enabled
              ? text(
                  locale,
                  "Refreshes while course details are open",
                  "详情打开期间持续刷新",
                )
              : text(
                  locale,
                  "Checks once whenever course details open",
                  "每次打开课程详情时查询一次",
                )}
          </small>
        </span>
      </label>
      {enabled ? (
        <label className="enrollment-watch-frequency">
          <span>{intervalLabel}</span>
          <Select
            value={String(intervalSeconds)}
            onValueChange={(value) =>
              onIntervalChange(Number(value) as EnrollmentWatchInterval)
            }
          >
            <SelectTrigger
              size="sm"
              aria-label={intervalLabel}
              className="enrollment-watch-interval"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {ENROLLMENT_WATCH_INTERVALS.map((seconds) => (
                <SelectItem key={seconds} value={String(seconds)}>
                  {text(locale, `${seconds} sec`, `${seconds} 秒`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ) : null}
    </div>
  );
}

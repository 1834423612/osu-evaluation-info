import { Clock3, MapPin, MonitorPlay } from "lucide-react";
import type { CatalogMeeting } from "@/lib/catalog/types";
import { isOnlineMeeting } from "@/lib/catalog/presentation";
import { text, type Locale } from "@/lib/i18n";
const DAYS = {
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
};
const FULL_DAYS = {
  en: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],
  zh: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
};
export function MeetingStrip({
  meeting,
  locale,
  compact = false,
  instructionMode,
}: {
  meeting?: CatalogMeeting;
  locale: Locale;
  compact?: boolean;
  instructionMode?: string;
}) {
  const days = meeting?.days ?? [];
  const online = isOnlineMeeting(meeting, instructionMode);
  return (
    <div className={compact ? "meeting-strip compact" : "meeting-strip"}>
      {days.length || !online ? (
        <div
          className="week-strip"
          role="img"
          aria-label={
            days.length
              ? days.map((day) => FULL_DAYS[locale][day]).join(", ")
              : text(locale, "No scheduled meeting days", "无固定上课日期")
          }
        >
          {DAYS[locale].map((label, i) => (
            <span
              key={i}
              className={days.includes(i) ? "day active" : "day"}
              aria-hidden="true"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}
      <span className="meeting-time">
        {online ? (
          <MonitorPlay size={13} aria-hidden="true" />
        ) : (
          <Clock3 size={13} aria-hidden="true" />
        )}
        {meeting?.startTime
          ? `${meeting.startTime} – ${meeting.endTime ?? "?"}`
          : online
            ? text(locale, "Online class", "线上课")
            : text(locale, "Time TBA", "时间待定")}
      </span>
      {!compact && meeting?.location ? (
        <span className="meeting-location">
          <MapPin size={13} />
          {meeting.location}
        </span>
      ) : null}
    </div>
  );
}

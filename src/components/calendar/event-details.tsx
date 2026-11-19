"use client";
import { Popover } from "radix-ui";
import {
  CalendarDays,
  Clock3,
  MapPin,
  AlignLeft,
  Pencil,
  X,
  ExternalLink,
  Globe2,
} from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar/model";
import type { Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import styles from "./event-details.module.css";
export type CalendarEventPreview = {
  event: CalendarEvent;
  left: number;
  top: number;
};
export function EventDetails({
  preview,
  locale,
  onClose,
  onEdit,
}: {
  preview: CalendarEventPreview | null;
  locale: Locale;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const event = preview?.event,
    zh = locale === "zh";
  const date = (value: string) =>
    new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
      timeZone: event?.allDay ? "UTC" : "America/New_York",
      year: "numeric",
      month: "short",
      day: "numeric",
      weekday: "short",
      ...(event?.allDay ? {} : { hour: "numeric", minute: "2-digit" }),
    }).format(new Date(value));
  const end = event?.allDay
    ? new Date(
        Date.parse(event.end) + (event.end > event.start ? -86400000 : 0),
      )
        .toISOString()
        .slice(0, 10)
    : event?.end;
  const online =
    !!event && /online|distance learning|zoom/i.test(event.location);
  return (
    <Popover.Root open={!!preview} onOpenChange={(open) => !open && onClose()}>
      <Popover.Anchor asChild>
        <span
          aria-hidden="true"
          style={{
            position: "fixed",
            left: preview?.left ?? 0,
            top: preview?.top ?? 0,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className={styles.panel}
          sideOffset={10}
          collisionPadding={12}
          align="start"
          role="dialog"
          aria-label={event?.title}
        >
          {event && (
            <>
              <header>
                <span className={styles.category}>
                  <CalendarDays size={13} />
                  {
                    {
                      class: zh ? "课程" : "Class",
                      assignment: zh ? "作业" : "Assignment",
                      exam: zh ? "考试" : "Exam",
                      holiday: zh ? "假日" : "Holiday",
                      event: zh ? "日程" : "Event",
                    }[event.category]
                  }
                </span>
                <div>
                  {!event.id.startsWith("official-") && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={zh ? "编辑日程" : "Edit event"}
                      onClick={() => {
                        onEdit(event);
                        onClose();
                      }}
                    >
                      <Pencil size={15} />
                    </Button>
                  )}
                  <Popover.Close asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={zh ? "关闭日程详情" : "Close event details"}
                    >
                      <X size={16} />
                    </Button>
                  </Popover.Close>
                </div>
              </header>
              <h2>{event.title.split(" | ")[0]}</h2>
              <div className={styles.fact}>
                <Clock3 size={16} />
                <div>
                  <strong>
                    {date(event.start)}
                    {end && end !== event.start ? " — " + date(end) : ""}
                  </strong>
                  <small>
                    {event.allDay
                      ? zh
                        ? "全天"
                        : "All day"
                      : zh
                        ? "美国东部时间"
                        : "Eastern time"}
                    {event.session ? " · " + event.session : ""}
                  </small>
                </div>
              </div>
              {event.location && (
                <div className={styles.fact}>
                  {online ? <Globe2 size={16} /> : <MapPin size={16} />}
                  <span>{event.location}</span>
                </div>
              )}
              {(event.description || event.title.includes(" | ")) && (
                <div className={styles.fact}>
                  <AlignLeft size={16} />
                  <p>
                    {event.description ||
                      event.title.split(" | ").slice(1).join(" · ")}
                  </p>
                </div>
              )}
              {event.url && /^https?:\/\//i.test(event.url) && (
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  <ExternalLink size={14} />
                  {zh ? "查看原始日程" : "Open original event"}
                </a>
              )}
            </>
          )}
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

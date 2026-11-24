"use client";
import { Popover } from "radix-ui";
import { useEffect, useId, useRef } from "react";
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
import { calendarEventWhen } from "@/lib/calendar/presentation";
import { Button } from "@/components/ui/button";
import styles from "./event-details.module.css";
export type CalendarEventPreview = {
  event: CalendarEvent;
  left: number;
  top: number;
  readOnly?: boolean;
  opener?: HTMLElement;
};
export function EventDetails({
  preview,
  locale,
  onClose,
  onEdit,
  onCopy,
}: {
  preview: CalendarEventPreview | null;
  locale: Locale;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onCopy?: (event: CalendarEvent) => void;
}) {
  const openingEditor = useRef(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const opener = useRef<HTMLElement | undefined>(undefined);
  useEffect(() => {
    if (preview?.opener) opener.current = preview.opener;
  }, [preview]);
  const event = preview?.event,
    zh = locale === "zh";
  const when = event ? calendarEventWhen(event, locale) : null;
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
          className={`${styles.panel} rr-block`}
          data-telemetry-private
          onOpenAutoFocus={(opening) => {
            opening.preventDefault();
            closeButton.current?.focus();
          }}
          onCloseAutoFocus={(close) => {
            close.preventDefault();
            if (!openingEditor.current && opener.current?.isConnected)
              opener.current.focus();
            openingEditor.current = false;
          }}
          sideOffset={10}
          collisionPadding={12}
          align="start"
          role="dialog"
          aria-labelledby={titleId}
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
                  {!preview?.readOnly && !event.id.startsWith("official-") && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={zh ? "编辑日程" : "Edit event"}
                      onClick={() => {
                        openingEditor.current = true;
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
                      ref={closeButton}
                      aria-label={zh ? "关闭日程详情" : "Close event details"}
                    >
                      <X size={16} />
                    </Button>
                  </Popover.Close>
                </div>
              </header>
              <h2 id={titleId}>{event.title}</h2>
              {preview?.readOnly &&
                !event.id.startsWith("official-") &&
                onCopy && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      openingEditor.current = true;
                      onCopy(event);
                      onClose();
                    }}
                  >
                    <Pencil size={14} />
                    {zh ? "创建可编辑副本" : "Create editable copy"}
                  </Button>
                )}
              <div className={styles.fact}>
                <Clock3 size={16} />
                <div>
                  <strong>{when?.date}</strong>
                  {when?.time && (
                    <span className={styles.time}>{when.time}</span>
                  )}
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
              {event.description && (
                <div className={styles.fact}>
                  <AlignLeft size={16} />
                  <p>{event.description}</p>
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

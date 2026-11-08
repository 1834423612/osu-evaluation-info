"use client";
import { Play, Radar, Square } from "lucide-react";
import type { CatalogCourse } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";
import { LARGE_WATCH_SELECTION } from "@/lib/catalog/watch-selection";
import styles from "./seat-watch-panel.module.css";

export function SeatWatchPanel({
  course,
  locale,
  selected,
  onSelect,
  running,
  onStart,
  onStop,
  countdown,
  intervalSeconds,
  enabled,
}: {
  course: CatalogCourse;
  locale: Locale;
  selected: readonly string[];
  onSelect: (ids: string[]) => void;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  countdown: number | null;
  intervalSeconds: number;
  enabled: boolean;
}) {
  const selectedCount = course.sections.filter((section) =>
    selected.includes(section.classNumber),
  ).length;
  if (!enabled) return null;
  return (
    <div
      className={styles.panel}
      aria-label={text(
        locale,
        "Section availability controls",
        "班次空位查询控制",
      )}
    >
      <div className={styles.summary}>
        <strong>
          <Radar size={13} aria-hidden="true" />
          {text(locale, "Watch selected sections", "监控所选班次")}
        </strong>
        <span role="status">
          {running && countdown !== null
            ? text(
                locale,
                `Next refresh in ${countdown}s`,
                `${countdown} 秒后刷新`,
              )
            : running
              ? text(locale, "Refreshing…", "刷新中…")
              : text(locale, "Paused", "未运行")}
        </span>
      </div>
      {enabled ? (
        <>
          <p>
            {text(
              locale,
              "Choose only what you need · Choices remembered · Other courses pause here",
              "按需勾选 · 自动记忆 · 其他课程暂停查询",
            )}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              onClick={() =>
                onSelect(course.sections.map((section) => section.classNumber))
              }
            >
              {text(locale, "Select all", "全选")}
            </button>
            <button type="button" onClick={() => onSelect([])}>
              {text(locale, "Clear", "清空")}
            </button>
            <span>
              {text(
                locale,
                `${selectedCount} selected · ${intervalSeconds}s minimum between rounds`,
                `已选 ${selectedCount} 个 · 每轮至少间隔 ${intervalSeconds} 秒`,
              )}
            </span>
            {running ? (
              <button type="button" className={styles.primary} onClick={onStop}>
                <Square size={12} aria-hidden="true" />
                {text(locale, "Stop watch", "停止监控")}
              </button>
            ) : (
              <button
                type="button"
                disabled={!selectedCount}
                className={styles.primary}
                onClick={() => {
                  if (
                    selectedCount > LARGE_WATCH_SELECTION &&
                    !window.confirm(
                      text(
                        locale,
                        `You selected ${selectedCount} sections. This creates repeated official requests; please select only what you need. Start watching all selected sections?`,
                        `你已选中 ${selectedCount} 个班次，会持续向官方发送查询。建议仅按需选择。确定监控全部已选班次吗？`,
                      ),
                    )
                  )
                    return;
                  onStart();
                }}
              >
                <Play size={12} aria-hidden="true" />
                {text(locale, "Start watch", "开始监控")}
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

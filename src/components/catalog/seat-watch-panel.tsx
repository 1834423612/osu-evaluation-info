"use client";
import { LoaderCircle, Play, RefreshCw, Square } from "lucide-react";
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
  onRefresh,
  loading,
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
  onRefresh: () => void;
  loading: boolean;
  countdown: number | null;
  intervalSeconds: number;
  enabled: boolean;
}) {
  const selectedCount = course.sections.filter((section) =>
    selected.includes(section.classNumber),
  ).length;
  const verified = course.sections.filter(
    (section) => section.availability,
  ).length;
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
          {text(
            locale,
            `Checked ${verified} / ${course.sections.length} sections`,
            `已核验 ${verified} / ${course.sections.length} 个班次`,
          )}
        </strong>
        <span role="status">
          {loading ? (
            <>
              <LoaderCircle size={13} className="spin" aria-hidden="true" />
              {text(locale, "Checking gradually…", "正在分批查询…")}
            </>
          ) : running && countdown !== null ? (
            text(
              locale,
              `Next refresh in ${countdown}s`,
              `${countdown} 秒后刷新`,
            )
          ) : enabled ? (
            text(locale, "Watch paused", "监控未运行")
          ) : (
            text(locale, "One-time checks retained", "保留本次查询结果")
          )}
        </span>
      </div>
      {enabled ? (
        <>
          <p>
            {text(
              locale,
              "Choose only the sections you need. Your choices are remembered for this course and term; other courses pause while these details are open.",
              "请按需勾选真正需要的班次，避免贪选。选择按本课程、学期记忆；详情打开时，其他课程暂停空位查询。",
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
      <div className={styles.footer}>
        <small>
          {text(
            locale,
            "Only the official per-section availability response supplies these counts. Requests are queued, spaced, and limited to two concurrent reads.",
            "人数仅来自官方逐班次可用性接口；请求排队错峰，同一时间最多查询两个班次。",
          )}
        </small>
        <button
          type="button"
          disabled={loading || (enabled && !selectedCount)}
          onClick={onRefresh}
        >
          <RefreshCw
            size={12}
            className={loading ? "spin" : undefined}
            aria-hidden="true"
          />
          {enabled
            ? text(locale, "Check selected once", "查询已选一次")
            : text(locale, "Refresh availability", "刷新空位")}
        </button>
      </div>
    </div>
  );
}

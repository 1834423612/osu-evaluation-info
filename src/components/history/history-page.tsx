"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Clock3, Search, BookOpen, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { EmptyResult } from "@/components/brand/empty-result";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import {
  readHistory,
  subscribeHistory,
  historyEnabled,
  setHistoryEnabled,
  writeHistory,
} from "@/lib/history/store";
import type { HistoryEntry } from "@/lib/history/model";
import styles from "@/components/ui/workspace.module.css";
const empty: HistoryEntry[] = [];
export function HistoryPage() {
  const { locale } = usePreferences(),
    entries = useSyncExternalStore(subscribeHistory, readHistory, () => empty);
  const enabled = useSyncExternalStore(
    subscribeHistory,
    historyEnabled,
    () => true,
  );
  const [kind, setKind] = useState<"all" | "search" | "course">("all"),
    [query, setQuery] = useState("");
  const visible = entries.filter(
    (x) =>
      (kind === "all" || x.kind === kind) &&
      (x.title + x.context).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <AppHeader />
      <main className={styles.shell + " rr-block"} data-telemetry-private>
        <div className={styles.heading}>
          <div>
            <h1>{text(locale, "Recent activity", "最近记录")}</h1>
            <p>
              {text(locale, "On this device · 90 days", "保存在此设备 · 90 天")}
            </p>
          </div>
          <div className={styles.tools}>
            <Button
              variant="outline"
              aria-pressed={enabled}
              onClick={() => setHistoryEnabled(!enabled)}
            >
              {text(
                locale,
                enabled ? "History on" : "History off",
                enabled ? "记录已开启" : "记录已关闭",
              )}
            </Button>
            <Button
              variant="outline"
              disabled={!entries.length}
              onClick={() => {
                if (
                  confirm(
                    text(
                      locale,
                      "Clear all recent activity?",
                      "清空所有最近记录？",
                    ),
                  )
                )
                  writeHistory([]);
              }}
            >
              <Trash2 size={14} />
              {text(locale, "Clear", "清空")}
            </Button>
          </div>
        </div>
        <section className={styles.panel}>
          <div className={styles.tools}>
            {(["all", "search", "course"] as const).map((value) => (
              <Button
                key={value}
                variant={kind === value ? "secondary" : "ghost"}
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {value === "all"
                  ? text(locale, "All", "全部")
                  : value === "search"
                    ? text(locale, "Searches", "搜索")
                    : text(locale, "Courses", "课程")}
              </Button>
            ))}
          </div>
          <label className={styles.fields}>
            <span className={styles.muted}>
              {text(locale, "Find in history", "查找记录")}
            </span>
            <input
              className={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {visible.length ? (
            <ul className={styles.list}>
              {visible.map((item) => (
                <li className={styles.row} key={item.id}>
                  {item.kind === "search" ? (
                    <Search size={17} />
                  ) : (
                    <BookOpen size={17} />
                  )}
                  <Link href={item.href as Route}>
                    <strong>{item.title}</strong>
                    <small>
                      {item.context} ·{" "}
                      {new Date(item.at).toLocaleString(
                        locale === "zh" ? "zh-CN" : "en-US",
                        { dateStyle: "medium", timeStyle: "short" },
                      )}
                    </small>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={text(
                      locale,
                      "Remove history entry",
                      "删除记录",
                    )}
                    onClick={() =>
                      writeHistory(entries.filter((x) => x.id !== item.id))
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyResult>
              <Clock3 size={16} />
              {text(locale, "No recent activity.", "暂无记录。")}
            </EmptyResult>
          )}
        </section>
      </main>
      <AppFooter />
    </>
  );
}

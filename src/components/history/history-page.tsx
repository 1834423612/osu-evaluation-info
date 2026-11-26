"use client";
import { SearchField } from "@/components/ui/search-field";
import { useActionNotice } from "@/hooks/use-action-notice";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Clock3, Search, BookOpen, Trash2, Download } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { EmptyResult } from "@/components/brand/empty-result";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import {
  readHistory,
  subscribeHistory,
  historyEnabled,
  setHistoryEnabled,
  editHistory,
} from "@/lib/history/store";
import type { HistoryEntry } from "@/lib/history/model";
import styles from "@/components/ui/workspace.module.css";
import layout from "./history.module.css";
import { SelectionCheckbox } from "@/components/saved/selection-checkbox";
const empty: HistoryEntry[] = [];
export function HistoryPage() {
  const { locale } = usePreferences(),
    entries = useSyncExternalStore(subscribeHistory, readHistory, () => empty);
  const enabled = useSyncExternalStore(
    subscribeHistory,
    historyEnabled,
    () => true,
  );
  const [selected, setSelected] = useState(new Set<string>());
  const [kind, setKind] = useState<"all" | "search" | "course">("all"),
    [query, setQuery] = useState(""),
    [clearOpen, setClearOpen] = useState(false),
    [notice, setNotice] = useActionNotice();
  const visible = entries.filter(
    (x) =>
      (kind === "all" || x.kind === kind) &&
      (x.title + x.context).toLowerCase().includes(query.toLowerCase()),
  );
  const groups = new Map<string, HistoryEntry[]>();
  for (const item of visible) {
    const day = new Date(item.at).toLocaleDateString(
      locale === "zh" ? "zh-CN" : "en-US",
      { year: "numeric", month: "long", day: "numeric", weekday: "short" },
    );
    groups.set(day, [...(groups.get(day) ?? []), item]);
  }
  async function removeSelected() {
    const ids = new Set(selected);
    if (
      await editHistory((current) =>
        current.filter((item) => !ids.has(item.id)),
      )
    )
      setSelected(new Set());
    else setNotice(text(locale, "Could not update history.", "记录更新失败。"));
  }
  function exportHistory() {
    try {
      const data = {
          format: "waho-history",
          version: 1,
          exportedAt: new Date().toISOString(),
          items: readHistory(),
        },
        url = URL.createObjectURL(
          new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json",
          }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "waho-history-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice(text(locale, "Could not export history.", "记录导出失败。"));
    }
  }
  return (
    <>
      <AppHeader />
      <main className={styles.shell} data-telemetry-private>
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
              disabled={!entries.length}
              onClick={exportHistory}
            >
              <Download size={14} />
              {text(locale, "Export history", "导出记录")}
            </Button>
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
                setNotice("");
                setClearOpen(true);
              }}
            >
              <Trash2 size={14} />
              {text(locale, "Clear", "清空")}
            </Button>
          </div>
        </div>
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
        <div className={layout.historyLayout}>
          <aside className={layout.sidebar}>
            <span className={layout.sideLabel}>
              {text(locale, "YOUR ACTIVITY", "我的记录")}
            </span>
            {(["all", "search", "course"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={kind === value}
                onClick={() => {
                  setKind(value);
                  setSelected(new Set());
                }}
              >
                {value === "search" ? (
                  <Search size={16} />
                ) : value === "course" ? (
                  <BookOpen size={16} />
                ) : (
                  <Clock3 size={16} />
                )}
                <span>
                  {text(
                    locale,
                    value === "all"
                      ? "All activity"
                      : value === "search"
                        ? "Searches"
                        : "Viewed courses",
                    value === "all"
                      ? "全部记录"
                      : value === "search"
                        ? "搜索记录"
                        : "浏览课程",
                  )}
                </span>
                <small>
                  {
                    entries.filter((x) => value === "all" || x.kind === value)
                      .length
                  }
                </small>
              </button>
            ))}
            <p>
              {text(
                locale,
                "History stays in this browser for 90 days. You can pause or delete it at any time.",
                "记录在此浏览器保留 90 天，随时可以暂停或删除。",
              )}
            </p>
          </aside>
          <section className={layout.timeline}>
            <label className={layout.search}>
              <Search size={17} />
              <SearchField
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={text(
                  locale,
                  "Search your history",
                  "搜索历史记录",
                )}
                aria-label={text(locale, "Search your history", "搜索历史记录")}
              />
            </label>
            {visible.length ? (
              <div className={layout.selection}>
                <SelectionCheckbox
                  keys={visible.map((x) => x.id)}
                  selected={selected}
                  onChange={setSelected}
                  label={
                    selected.size
                      ? text(
                          locale,
                          selected.size + " selected",
                          selected.size + " 项已选",
                        )
                      : text(locale, "Select entries", "选择记录")
                  }
                />
                {selected.size ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void removeSelected()}
                  >
                    <Trash2 size={13} />
                    {text(locale, "Delete selected", "删除所选")}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {[...groups].map(([day, items]) => (
              <section key={day} className={layout.day}>
                <h2>
                  {day}
                  <span>{items.length}</span>
                </h2>
                <ul>
                  {items.map((item) => (
                    <li key={item.id} data-selected={selected.has(item.id)}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        aria-label={
                          text(locale, "Select ", "选择 ") + item.title
                        }
                        checked={selected.has(item.id)}
                        onChange={() =>
                          setSelected((old) => {
                            const next = new Set(old);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })
                        }
                      />
                      <time dateTime={item.at}>
                        {new Date(item.at).toLocaleTimeString(
                          locale === "zh" ? "zh-CN" : "en-US",
                          { hour: "2-digit", minute: "2-digit" },
                        )}
                      </time>
                      <span className={layout.kindIcon}>
                        {item.kind === "search" ? (
                          <Search size={16} />
                        ) : (
                          <BookOpen size={16} />
                        )}
                      </span>
                      <Link href={item.href as Route}>
                        <strong>{item.title}</strong>
                        {item.context ? <small>{item.context}</small> : null}
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={text(
                          locale,
                          "Remove history entry",
                          "删除记录",
                        )}
                        onClick={async () => {
                          if (
                            !(await editHistory((current) =>
                              current.filter((x) => x.id !== item.id),
                            ))
                          )
                            setNotice(
                              text(
                                locale,
                                "Could not update history.",
                                "记录更新失败。",
                              ),
                            );
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!visible.length ? (
              <EmptyResult layout="stack">
                <Clock3 size={20} />
                {text(
                  locale,
                  query
                    ? "No matching activity"
                    : "Your next discovery starts here",
                  query ? "没有匹配的记录" : "下一次探索，从这里开始",
                )}
              </EmptyResult>
            ) : null}
          </section>
        </div>
        <WorkspaceDialog
          open={clearOpen}
          onOpenChange={setClearOpen}
          title={text(locale, "Clear recent activity?", "清空最近记录？")}
          description={text(
            locale,
            "Remove search and course history from this browser. Favorites stay saved.",
            "移除此浏览器的搜索和浏览记录，收藏仍保留。",
          )}
          closeLabel={text(locale, "Close", "关闭")}
        >
          <div className={styles.actions}>
            <Button
              onClick={async () => {
                if (await editHistory(() => [])) setClearOpen(false);
                else
                  setNotice(
                    text(
                      locale,
                      "Could not clear history. Check browser storage.",
                      "清空失败，请检查浏览器存储。",
                    ),
                  );
              }}
            >
              {text(locale, "Clear history", "清空记录")}
            </Button>
            <Button variant="outline" onClick={() => setClearOpen(false)}>
              {text(locale, "Cancel", "取消")}
            </Button>
          </div>
        </WorkspaceDialog>
      </main>
      <AppFooter />
    </>
  );
}

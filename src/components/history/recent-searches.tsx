"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import type { Route } from "next";
import { History, ArrowUpRight } from "lucide-react";
import { readHistory, subscribeHistory } from "@/lib/history/store";
import type { HistoryEntry } from "@/lib/history/model";
import { text, type Locale } from "@/lib/i18n";
import styles from "./history.module.css";
const empty: HistoryEntry[] = [];
export function RecentSearches({ locale }: { locale: Locale }) {
  const entries = useSyncExternalStore(
      subscribeHistory,
      readHistory,
      () => empty,
    ),
    seen = new Set<string>();
  const searches = entries
    .filter((x) => {
      if (x.kind !== "search" || seen.has(x.title)) return false;
      seen.add(x.title);
      return true;
    })
    .slice(0, 4);
  if (!searches.length) return null;
  return (
    <div className={styles.recent} data-telemetry-private>
      <History size={14} />
      <span>{text(locale, "Recent", "最近搜索")}</span>
      <div className={styles.recentItems}>
        {searches.map((item) => (
          <Link href={item.href as Route} key={item.id}>
            <span>{item.title}</span>
            <ArrowUpRight size={11} />
          </Link>
        ))}
      </div>
      <Link className={styles.allHistory} href="/history">
        {text(locale, "All history", "全部记录")}
      </Link>
    </div>
  );
}

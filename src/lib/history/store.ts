"use client";
import { browserStorage } from "../preferences/browser-storage";
import { debugFlag } from "../debug/flags";
import {
  HISTORY_ENABLED_KEY,
  HISTORY_EVENT,
  HISTORY_KEY,
  parseHistory,
  mergeHistory,
  historyHref,
  type HistoryEntry,
} from "./model";
const empty: HistoryEntry[] = [];
let raw: string | null | undefined,
  cache = empty;
export function subscribeHistory(fn: () => void) {
  window.addEventListener(HISTORY_EVENT, fn);
  window.addEventListener("storage", fn);
  return () => {
    window.removeEventListener(HISTORY_EVENT, fn);
    window.removeEventListener("storage", fn);
  };
}
export function readHistory() {
  try {
    const value = browserStorage().getItem(HISTORY_KEY);
    if (value !== raw) {
      raw = value;
      cache = parseHistory(value);
    }
    return cache;
  } catch {
    return empty;
  }
}
export function historyEnabled() {
  try {
    return browserStorage().getItem(HISTORY_ENABLED_KEY) !== "false";
  } catch {
    return false;
  }
}
export function writeHistory(items: HistoryEntry[]) {
  try {
    browserStorage().setItem(HISTORY_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(HISTORY_EVENT));
    return true;
  } catch {
    return false;
  }
}
export function setHistoryEnabled(enabled: boolean) {
  try {
    browserStorage().setItem(HISTORY_ENABLED_KEY, String(enabled));
    window.dispatchEvent(new Event(HISTORY_EVENT));
  } catch {}
}
export function recordHistory(item: Omit<HistoryEntry, "at">) {
  if (!historyEnabled() || debugFlag("skipAnalytics")) return;
  writeHistory(
    mergeHistory(readHistory(), { ...item, at: new Date().toISOString() }),
  );
}
export function recordSearchHistory(query: string, currentQuery: string) {
  const q = query.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 180);
  if (!q || /@|(?:token|password|secret)\s*[:=]|[a-zA-Z0-9_-]{32,}/.test(q))
    return;
  const p = new URLSearchParams(currentQuery);
  p.set("q", q);
  for (const key of ["course", "detailTab", "focusSection", "ratingSource"])
    p.delete(key);
  const href = historyHref("/?" + p);
  if (!href) return;
  recordHistory({
    id:
      "search:" +
      q.toLowerCase() +
      ":" +
      (p.get("term") ?? "") +
      ":" +
      (p.get("campus") ?? ""),
    kind: "search",
    title: q,
    context: [p.get("term"), p.get("campus")].filter(Boolean).join(" · "),
    href,
  });
}

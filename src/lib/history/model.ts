export type HistoryEntry = {
  id: string;
  kind: "search" | "course";
  title: string;
  context: string;
  href: string;
  at: string;
};
export const HISTORY_KEY = "course-atlas:history:v1";
export const HISTORY_ENABLED_KEY = "course-atlas:history-enabled:v1";
export const HISTORY_EVENT = "course-atlas:history-change";
export function historyHref(raw: string) {
  try {
    const url = new URL(raw, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.pathname !== "/")
      return null;
    const params = new URLSearchParams();
    for (const key of [
      "q",
      "term",
      "campus",
      "subject",
      "course",
      "detailTab",
      "focusSection",
      "ratingSource",
    ]) {
      const value = url.searchParams.get(key);
      if (value && value.length <= 180) params.set(key, value);
    }
    if (/[@]|(?:token|secret|password)=/i.test(params.get("q") ?? ""))
      return null;
    return "/?" + params.toString();
  } catch {
    return null;
  }
}
export function parseHistory(
  raw: string | null,
  now = Date.now(),
): HistoryEntry[] {
  try {
    const values: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(values)) return [];
    const unique = new Map<string, HistoryEntry>();
    for (const item of values) {
      if (
        !item ||
        !["search", "course"].includes(item.kind) ||
        typeof item.id !== "string" ||
        item.id.length > 400 ||
        typeof item.title !== "string" ||
        typeof item.context !== "string" ||
        typeof item.at !== "string" ||
        now - Date.parse(item.at) > 90 * 86400000 ||
        !Number.isFinite(Date.parse(item.at))
      )
        continue;
      const href = historyHref(item.href);
      if (!href) continue;
      unique.set(item.id, {
        id: item.id,
        kind: item.kind,
        title: item.title.slice(0, 180),
        context: item.context.slice(0, 180),
        href,
        at: item.at,
      });
    }
    const sorted = [...unique.values()].sort(
      (a, b) => Date.parse(b.at) - Date.parse(a.at),
    );
    return [
      ...sorted.filter((x) => x.kind === "search").slice(0, 100),
      ...sorted.filter((x) => x.kind === "course").slice(0, 200),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  } catch {
    return [];
  }
}
export function mergeHistory(
  current: HistoryEntry[],
  item: HistoryEntry,
  now = Date.now(),
) {
  return parseHistory(
    JSON.stringify([...current.filter((x) => x.id !== item.id), item]),
    now,
  );
}

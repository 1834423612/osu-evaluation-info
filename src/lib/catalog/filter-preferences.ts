import { FILTER_KEYS } from "./filter-keys.ts";

export const CATALOG_PREFERENCES_KEY = "course-atlas:catalog-filters:v1";
const keys = [
  "campus",
  "subject",
  "term",
  "sort",
  "meeting-days",
  ...FILTER_KEYS,
];
/** Store only catalog preferences. Queries, cursors and opened courses are transient. */
export function catalogPreferences(params: URLSearchParams) {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = params.get(key);
      return value && value.length <= 300 ? [[key, value]] : [];
    }),
  );
}
export function restoreCatalogPreferences(query: string, raw: string | null) {
  const params = new URLSearchParams(query);
  if (params.get("filters") === "1") return params;
  try {
    const saved = JSON.parse(raw ?? "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved))
      for (const key of keys) {
        const value = saved[key];
        if (
          !params.has(key) &&
          typeof value === "string" &&
          value.length <= 300
        )
          params.set(key, value);
      }
  } catch {
    /* Malformed or unavailable preferences use URL defaults. */
  }
  params.set("filters", "1");
  return params;
}

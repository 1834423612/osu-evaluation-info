import { FILTER_KEYS } from "./filter-keys.ts";
const filters = new Set(["subject", "campus", ...FILTER_KEYS]);
/** Include the effective default without putting presentation defaults in the URL. */
export function activeCatalogFilters(
  params: Pick<URLSearchParams, "entries" | "get">,
): [string, string][] {
  const active = new Map(
    [...params.entries()].filter(([key, value]) => filters.has(key) && !!value),
  );
  const campus = params.get("campus") || "col";
  if (campus === "all") active.delete("campus");
  else active.set("campus", campus);
  return [...active];
}

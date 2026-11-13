import { normalizeCourseSearch } from "../analytics.ts";
import type { CatalogResponse } from "./types";

const CONTROLS = new Set([
  "q",
  "term",
  "sort",
  "cursor",
  "page",
  "limit",
  "pageHistory",
  "course",
  "detailTab",
  "ratingSource",
  "focusSection",
  "relatedFrom",
  "mode",
  "searchMode",
]);

/** One completed first-page result load; submissions and result loads are distinct metrics. */
export function courseSearchOutcome(
  params: URLSearchParams,
  result: CatalogResponse | null,
  durationMs: number,
) {
  const query = normalizeCourseSearch(params.get("q") ?? "");
  if (
    !query ||
    params.has("cursor") ||
    (result as (CatalogResponse & { debug?: boolean }) | null)?.debug
  )
    return null;
  const complete = Boolean(
    result &&
    !result.capped &&
    (result.searchInfo?.complete ?? !result.hasMore),
  );
  const status = !result
    ? "error"
    : result.searchInfo?.conflict
      ? "filter_conflict"
      : result.courses.length
        ? "matches"
        : !complete || result.hasMore
          ? "continuation"
          : "no_matches";
  const term = params.get("term") ?? result?.terms[0]?.code ?? "";
  return {
    search_term: query.searchTerm,
    search_type: query.searchType,
    status,
    match_kind: result?.searchInfo?.kind ?? "unknown",
    search_engine: result?.searchInfo?.engine ?? "official",
    index_fallback: result?.searchInfo?.fallbackReason ?? "none",
    fuzzy_results:
      result?.courses.filter((course) => course.searchMatch?.mode === "fuzzy")
        .length ?? 0,
    result_count: result?.courses.length ?? 0,
    total_courses: result?.totalCourses ?? -1,
    has_more: result?.hasMore ?? false,
    complete,
    term: /^\d{3,6}$/.test(term) ? term : "",
    campus: (params.get("campus") ?? "col").toLowerCase().slice(0, 20),
    filter_count: [...new Set(params.keys())].filter(
      (key) => !CONTROLS.has(key),
    ).length,
    duration_ms: Math.max(0, Math.min(120000, Math.round(durationMs))),
    path: "/",
  };
}

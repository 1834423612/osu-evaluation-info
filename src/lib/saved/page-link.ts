import { FILTER_KEYS } from "../catalog/filter-keys.ts";
import { safeSearchTerm } from "../analytics/privacy.ts";
import type { CatalogCourse } from "../catalog/types.ts";
const allowed = new Set([
  ...FILTER_KEYS,
  "department",
  "school",
  "identity",
  "type",
  "kind",
  "days",
  "from",
  "to",
  "searchMode",
  "q",
  "term",
  "campus",
  "subject",
  "course",
  "detailTab",
  "focusSection",
  "ratingSource",
  "sort",
  "career",
]);
export function pageShareHref(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    throw new Error("Unsupported link");
  const url = new URL(value, "https://share.invalid");
  if (
    url.origin !== "https://share.invalid" ||
    !/^\/(?:$|rmp(?:\/\d+)?|updates|reference|methodology)\/?$/.test(
      url.pathname,
    )
  )
    throw new Error("Unsupported page");
  const params = new URLSearchParams();
  for (const key of allowed) {
    const v = url.searchParams.get(key);
    if (v && v.length <= 320) {
      if (key === "q" && safeSearchTerm(v) === "[redacted]")
        throw new Error("Invalid query");
      params.set(key, v);
    }
  }
  const query = params.toString();
  return (
    url.pathname +
    (query ? "?" + query : "") +
    (url.pathname === "/reference" && /^#[a-z][a-z0-9-]{0,70}$/.test(url.hash)
      ? url.hash
      : "")
  );
}
export function courseShareHref(course: CatalogCourse, current = "") {
  const source = new URLSearchParams(current),
    params = new URLSearchParams({
      q: course.subject + " " + course.catalogNumber,
      course: course.id,
      term: course.termCode,
      campus: course.campusCode.toLowerCase(),
    });
  if (source.get("course") === course.id)
    for (const key of ["detailTab", "focusSection", "ratingSource"]) {
      const value = source.get(key);
      if (value) params.set(key, value);
    }
  return pageShareHref("/?" + params);
}

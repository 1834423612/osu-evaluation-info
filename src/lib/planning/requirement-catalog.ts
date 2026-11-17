import type { CatalogCourse } from "../catalog/types";
import { requirementSearch } from "./requirement-search.ts";
export async function readRequirementCourses(
  title: string,
  scope: { campus: string; term: string },
  fetcher: typeof fetch,
  signal: AbortSignal,
  cursor?: string,
) {
  const category = requirementSearch(title);
  if (!category)
    return {
      courses: [] as CatalogCourse[],
      nextCursor: null as string | null,
      mapped: false,
    };
  const params = new URLSearchParams({
    campus: scope.campus.toLowerCase(),
    term: scope.term,
    "gen-categories": category,
    limit: "24",
    exactPreview: "1",
  });
  if (cursor) params.set("cursor", cursor);
  const response = await fetcher("/api/catalog?" + params, { signal });
  if (!response.ok) throw Error("Catalog unavailable");
  const data = await response.json();
  // A relaxed upstream result must still carry the requested academic attribute.
  const courses = (data.courses ?? []).filter((c: CatalogCourse) =>
    c.attributes?.some((a) => a.toLowerCase().includes(category.toLowerCase())),
  );
  return {
    courses: courses as CatalogCourse[],
    nextCursor: data.nextCursor ?? null,
    mapped: true,
  };
}

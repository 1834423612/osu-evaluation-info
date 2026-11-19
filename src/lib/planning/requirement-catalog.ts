import type { CatalogCourse } from "../catalog/types";
import { requirementCatalogFilter } from "./requirement-search.ts";
export async function readRequirementCourses(
  title: string,
  scope: { campus: string; term: string },
  fetcher: typeof fetch,
  signal: AbortSignal,
  cursor?: string,
  browse?: { subject?: string; category?: string },
) {
  const inferred = requirementCatalogFilter(title);
  const category = inferred?.value || browse?.category;
  const subject = browse?.subject?.toUpperCase();
  if (subject && !/^[A-Z][A-Z&-]{0,19}$/.test(subject))
    throw Error("Invalid subject");
  if (!category && !subject)
    return {
      courses: [] as CatalogCourse[],
      nextCursor: null as string | null,
      mapped: false,
    };
  const params = new URLSearchParams({
    campus: scope.campus.toLowerCase(),
    term: scope.term,
    ...(category ? { [inferred?.key ?? "gen-categories"]: category } : {}),
    ...(subject ? { subject } : {}),
    limit: "24",
    exactPreview: "1",
  });
  if (cursor) params.set("cursor", cursor);
  const response = await fetcher("/api/catalog?" + params, { signal });
  if (!response.ok) throw Error("Catalog unavailable");
  const data = await response.json();
  // A relaxed upstream result must still carry the requested academic attribute.
  const courses = (data.courses ?? []).filter(
    (c: CatalogCourse) =>
      (!subject || c.subject.toUpperCase() === subject) &&
      (!category ||
        c.attributes?.some((a) =>
          a.toLowerCase().includes(category.toLowerCase()),
        )),
  );
  return {
    courses: courses as CatalogCourse[],
    nextCursor: data.nextCursor ?? null,
    mapped: !!inferred,
  };
}

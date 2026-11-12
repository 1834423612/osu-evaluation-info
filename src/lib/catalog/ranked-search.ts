import {
  courseSearchScore,
  officialKeywordQuery,
  normalizeSearchText,
} from "./search-query.ts";
import type { CatalogCourse, CatalogResponse, CatalogSearch } from "./types";

/** Bounded live retrieval; page cursors retain the ranked window and never drop filters. */
export async function searchRankedCatalog(
  input: CatalogSearch,
  read: (input: CatalogSearch) => Promise<CatalogResponse>,
  merge: (a: CatalogCourse, b: CatalogCourse) => CatalogCourse,
) {
  const query = normalizeSearchText(input.q ?? "");
  const numeric = /^\d{1,6}(?:\.\d{1,3})?[a-z]{0,2}$/i.test(query);
  const match = input.cursor?.match(/^(?:r:)?(\d{1,2}):(\d{1,3})$/);
  if (input.cursor && !match) throw new Error("Invalid ranked-search cursor");
  const startPage = match ? Number(match[1]) : (input.page ?? 1);
  const offset = match ? Number(match[2]) : 0;
  if (startPage < 1 || startPage > 50 || offset > 600)
    throw new Error("Invalid ranked-search cursor");
  const upstreamQuery = numeric ? query : officialKeywordQuery(query);
  const grouped = new Map<string, CatalogCourse>();
  let response: CatalogResponse | null = null;
  let nextPage = startPage;
  let hitLimit = false;
  for (let scanned = 0; scanned < 3 && nextPage <= 50; scanned++) {
    response = await read({
      ...input,
      q: upstreamQuery,
      page: nextPage,
      cursor: undefined,
    });
    for (const course of response.courses)
      grouped.set(
        course.id,
        grouped.has(course.id)
          ? merge(grouped.get(course.id)!, course)
          : course,
      );
    if (!response.hasMore) {
      nextPage = 0;
      break;
    }
    if (nextPage === 50) {
      hitLimit = true;
      nextPage = 0;
      break;
    }
    nextPage++;
  }
  if (!response) throw new Error("No search response");
  const scored = [...grouped.values()]
    .map((course) => ({ course, score: courseSearchScore(course, query) }))
    .filter((item) => item.score > 0);
  const direct = scored.filter((item) => item.score >= 60);
  const ranked = direct.length ? direct : scored;
  const compare = (a: CatalogCourse, b: CatalogCourse) => {
    const byNumber = input.sort?.includes("catalogNumber");
    const order = byNumber
      ? a.catalogNumber.localeCompare(b.catalogNumber, undefined, {
          numeric: true,
        }) || a.subject.localeCompare(b.subject)
      : a.subject.localeCompare(b.subject) ||
        a.catalogNumber.localeCompare(b.catalogNumber, undefined, {
          numeric: true,
        });
    return (
      order * (input.sort?.startsWith("-") ? -1 : 1) || a.id.localeCompare(b.id)
    );
  };
  ranked.sort(
    (a, b) =>
      (!input.sort || input.sort === "relevance" ? b.score - a.score : 0) ||
      compare(a.course, b.course),
  );
  const limit = Math.max(1, Math.min(24, input.limit ?? 12));
  const courses = ranked
    .slice(offset, offset + limit)
    .map((item) => item.course);
  const complete =
    startPage === 1 && !nextPage && !response.capped && !hitLimit;
  const sectionCount = ranked.reduce(
    (count, item) => count + item.course.sections.length,
    0,
  );
  const nextCursor =
    offset + limit < ranked.length
      ? `r:${startPage}:${offset + limit}`
      : nextPage
        ? `r:${nextPage}:0`
        : null;
  return {
    ...response,
    capped: response.capped || hitLimit,
    courses,
    page: startPage,
    nextCursor,
    hasMore: Boolean(nextCursor),
    totalItems: complete ? sectionCount : response.totalItems,
    matchedSections: complete ? sectionCount : null,
    totalCourses: complete ? ranked.length : null,
    searchInfo: {
      query,
      kind: numeric ? ("number" as const) : ("keyword" as const),
      complete,
      candidateSections: response.totalItems,
      descriptionMatches: !direct.length && Boolean(scored.length),
      suggestions: [],
    },
  };
}

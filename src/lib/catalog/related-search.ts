import { parseExactCourseQuery } from "./exact-search.ts";
import { debugServiceControlled } from "../debug/services.ts";
import type { CatalogFacet, CatalogResponse } from "./types";

function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const positions = [...a].flatMap((letter, i) =>
      letter === b[i] ? [] : [i],
    );
    return (
      positions.length === 1 ||
      (positions.length === 2 &&
        positions[1] === positions[0] + 1 &&
        a[positions[0]] === b[positions[1]] &&
        a[positions[1]] === b[positions[0]])
    );
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (short[i] === long[i] && i < short.length) i++;
  return short.slice(i) === long.slice(i + 1);
}

/** Correct a single subject token only; never invent or approximate a course number. */
export function suggestRelatedQuery(
  query: string,
  subjects: string[],
  selectedSubject?: string,
) {
  const value = query.trim().toUpperCase();
  const exact = parseExactCourseQuery(value);
  const token =
    exact?.subject ?? (/^[A-Z][A-Z-]{1,19}$/.test(value) ? value : "");
  if (!token || token.length < 2) return null;
  const known = [
    ...new Set(
      subjects
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z][A-Z-]{1,19}$/.test(s)),
    ),
  ];
  if (known.includes(token)) return null;
  const candidates = known.filter(
    (s) => !selectedSubject || s === selectedSubject.toUpperCase(),
  );
  const alias = token === "CS" && candidates.includes("CSE") ? "CSE" : null;
  const close = candidates.filter((s) => oneEdit(token, s));
  const subject = alias ?? (close.length === 1 ? close[0] : null);
  return subject
    ? {
        query: value === query ? query : query.trim(),
        matchedQuery: exact ? `${subject} ${exact.catalogNumber}` : subject,
        subject,
      }
    : null;
}

/** One exact search, then at most one correction. Errors and simulated empty states never fan out. */
export function createRelatedCatalogSearch(
  fetcher: typeof fetch,
  facets: (term: string) => Promise<CatalogFacet[]>,
) {
  return async (
    input: string,
    init?: RequestInit,
  ): Promise<CatalogResponse> => {
    const response = await fetcher(input, init);
    if (!response.ok) throw new Error("Course service unavailable");
    const original: CatalogResponse = await response.json();
    const url = new URL(input, "https://catalog.invalid");
    const query = url.searchParams.get("q")?.trim() ?? "";
    if (
      original.courses.length ||
      original.capped ||
      original.hasMore ||
      url.searchParams.has("cursor") ||
      (url.searchParams.get("page") && url.searchParams.get("page") !== "1") ||
      !/^[a-z][a-z-]{1,19}(?:\s*\d{3,5}(?:\.\d{1,3})?[a-z]{0,2})?$/i.test(
        query,
      ) ||
      debugServiceControlled("catalog") ||
      (original as CatalogResponse & { debug?: boolean }).debug
    )
      return original;
    const term = url.searchParams.get("term") || original.terms[0]?.code;
    if (!term || init?.signal?.aborted) return original;
    try {
      const filters = await facets(term);
      if (init?.signal?.aborted) throw init.signal.reason;
      const match = suggestRelatedQuery(
        query,
        filters
          .filter((f) => f.slug.toLowerCase() === "subject")
          .flatMap((f) => f.items.map((i) => i.value)),
        url.searchParams.get("subject") ?? undefined,
      );
      if (!match) return original;
      url.searchParams.set("q", match.matchedQuery);
      const relatedResponse = await fetcher(url.pathname + url.search, init);
      if (!relatedResponse.ok) return original;
      const related: CatalogResponse = await relatedResponse.json();
      return related.courses.length
        ? { ...related, relatedMatch: match }
        : original;
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      return original;
    }
  };
}

import { SubjectResolver } from "./subjects.ts";
import type { CatalogResponse } from "../catalog/types";
import { normalizeSearchText } from "../catalog/search-query.ts";

export type SubjectVocabulary = {
  slug: string;
  items: { value: string; label: string }[];
};

/** One confidently resolved complete code, with no enumerated subject aliases. */
export function exactOfficialQuery(
  query: string,
  facets: SubjectVocabulary[],
  selected?: string,
) {
  const input = normalizeSearchText(query);
  const match = /^(.+?)\s*[-:#]?\s*(\d{3,5}(?:\.\d{1,3})?[a-z]{0,2})$/i.exec(
    input,
  );
  const numeric = selected && /^\d{3,5}(?:\.\d{1,3})?[a-z]{0,2}$/i.test(input);
  if (!match && !numeric) return null;
  const token = numeric ? selected : match![1].trim();
  const subjects = facets
    .filter((f) => f.slug === "subject")
    .flatMap((f) =>
      f.items.map((item) => ({
        subject: item.value.toUpperCase(),
        subjectName: item.label,
      })),
    );
  const matches = new SubjectResolver(subjects).resolve(token),
    best = matches[0];
  const literal = /^[a-z][a-z-]{0,19}$/i.test(token)
    ? token.toUpperCase()
    : undefined;
  const subject = !best
    ? literal
    : best.score >= 0.88 &&
        !(best.score < 1 && matches[1] && best.score - matches[1].score < 0.06)
      ? best.code
      : undefined;
  if (!subject || (selected && subject !== selected.toUpperCase())) return null;
  return {
    subject,
    catalogNumber: (numeric ? input : match![2]).toUpperCase(),
  };
}
export function createExactOfficialSearch(
  fetcher: typeof fetch,
  facets: (term: string) => Promise<SubjectVocabulary[]>,
  budgetMs = 2000,
) {
  return async (
    input: string,
    init?: RequestInit,
  ): Promise<CatalogResponse | null> => {
    const url = new URL(input, "https://catalog.invalid"),
      q = url.searchParams.get("q") ?? "";
    if (url.searchParams.has("cursor") || !/\d{3}/.test(q)) return null;
    const timeout = AbortSignal.timeout(budgetMs),
      signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const abortable = <T>(promise: Promise<T>) =>
      new Promise<T>((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        promise
          .then(resolve, reject)
          .finally(() => signal.removeEventListener("abort", abort))
          .catch(() => {});
      });
    try {
      let vocabulary: SubjectVocabulary[] = [];
      try {
        vocabulary = await abortable(
          facets(url.searchParams.get("term") ?? ""),
        );
      } catch (error) {
        if (init?.signal?.aborted || signal.aborted) throw error;
      }
      const exact = exactOfficialQuery(
        q,
        vocabulary,
        url.searchParams.get("subject") ?? undefined,
      );
      if (!exact) return null;
      const params = new URLSearchParams(url.searchParams);
      params.set("exactPreview", "1");
      params.set("subject", exact.subject);
      params.set("q", `${exact.subject} ${exact.catalogNumber}`);
      const response = await abortable(
        fetcher(`/api/catalog?${params}`, { ...init, signal }),
      );
      if (!response.ok) return null;
      const result: CatalogResponse = await abortable(response.json());
      if (
        !result.courses?.length ||
        (result.sourceMode !== "official" &&
          !(result as CatalogResponse & { debug?: boolean }).debug)
      )
        return null;
      // The official payload is used directly, without replacing it with archive details.
      return {
        ...result,
        searchInfo: {
          ...result.searchInfo,
          query: q,
          kind: "course",
          interpretedQuery: `${exact.subject} ${exact.catalogNumber}`,
          subject: exact.subject,
          complete: !result.capped,
          suggestions: result.searchInfo?.suggestions ?? [],
        },
      };
    } catch (error) {
      if (init?.signal?.aborted) throw error;
      return null;
    }
  };
}

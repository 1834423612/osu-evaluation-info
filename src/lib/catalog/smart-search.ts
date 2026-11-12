import { editDistance, planCatalogSearch } from "./search-query.ts";
import type { CatalogFacet, CatalogResponse } from "./types";

async function subjectFacets(
  promise: Promise<CatalogFacet[]>,
  signal?: AbortSignal | null,
) {
  if (signal?.aborted) throw signal.reason;
  let abort: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<CatalogFacet[]>((resolve, reject) => {
        timer = setTimeout(() => resolve([]), 2500);
        abort = () => reject(signal?.reason);
        signal?.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

export function createSmartCatalogSearch(
  fetcher: typeof fetch,
  facets: (term: string) => Promise<CatalogFacet[]>,
) {
  return async (
    input: string,
    init?: RequestInit,
  ): Promise<CatalogResponse> => {
    const url = new URL(input, "https://catalog.invalid");
    const query = url.searchParams.get("q")?.trim() ?? "";
    async function read(params: URLSearchParams) {
      if (init?.signal?.aborted) throw init.signal.reason;
      const response = await fetcher(`${url.pathname}?${params}`, init);
      if (!response.ok) throw new Error("Course service unavailable");
      return response.json() as Promise<CatalogResponse>;
    }
    if (!query) return read(url.searchParams);
    let filters: CatalogFacet[] = [];
    try {
      filters = await subjectFacets(
        facets(url.searchParams.get("term") ?? ""),
        init?.signal,
      );
    } catch (error) {
      if (init?.signal?.aborted) throw error;
    }
    const selected = url.searchParams.get("subject") ?? undefined;
    const plan = planCatalogSearch(query, filters, selected);
    const params = new URLSearchParams(url.searchParams);
    params.set("q", plan.canonicalQuery);
    if (plan.subject && !plan.conflict) params.set("subject", plan.subject);
    if (!params.has("sort") && plan.kind !== "subject")
      params.set("sort", "relevance");
    let result = await read(params);
    if ((result as CatalogResponse & { debug?: boolean }).debug) return result;
    const suggestions = [
      ...plan.suggestions,
      ...(result.searchInfo?.suggestions ?? []),
    ];
    const number = plan.canonicalQuery.match(
      /(\d{3,6})(?:\.\d{1,3})?[a-z]{0,2}$/i,
    )?.[1];
    // An unavailable/mistyped number yields explicitly labelled real alternatives,
    // never a changed course identity or an automatic replacement of the input.
    if (
      !result.courses.length &&
      !result.hasMore &&
      !result.capped &&
      !result.searchInfo?.suggestions.length &&
      !plan.conflict &&
      plan.subject &&
      number &&
      !params.has("cursor") &&
      !(result as CatalogResponse & { debug?: boolean }).debug
    ) {
      const nearby = new URLSearchParams(params);
      nearby.set("q", number.slice(0, 2));
      nearby.set("limit", "24");
      nearby.set("sort", "catalogNumber");
      try {
        const choices = await read(nearby);
        const candidates = [...choices.courses];
        if (choices.hasMore && choices.nextCursor) {
          nearby.set("cursor", choices.nextCursor);
          candidates.push(...(await read(nearby)).courses);
        }
        const maximum = number.length >= 5 ? 2 : 1;
        suggestions.push(
          ...candidates
            .filter(
              (course) =>
                editDistance(
                  course.catalogNumber.split(".")[0].replace(/[A-Z]+$/i, ""),
                  number,
                  maximum,
                ) <= maximum,
            )
            .sort(
              (a, b) =>
                editDistance(a.catalogNumber, number, maximum) -
                editDistance(b.catalogNumber, number, maximum),
            )
            .map((course) => ({
              query: `${course.subject} ${course.catalogNumber}`,
              label: `${course.subject} ${course.catalogNumber} · ${course.title}`,
              kind: "course" as const,
            })),
        );
      } catch (error) {
        if (init?.signal?.aborted) throw error;
      }
    }
    if (
      !result.courses.length &&
      !result.hasMore &&
      number &&
      number.length <= 5 &&
      /\p{L}/u.test(plan.query)
    )
      suggestions.push({ query: number, label: number, kind: "number" });
    result = {
      ...result,
      searchInfo: {
        ...result.searchInfo,
        query: plan.query,
        kind: result.searchInfo?.kind === "course" ? "course" : plan.kind,
        interpretedQuery: plan.canonicalQuery,
        subject: plan.subject,
        complete: result.searchInfo?.complete ?? !result.hasMore,
        conflict: plan.conflict,
        suggestions: [
          ...new Map(
            suggestions.map((item) => [`${item.kind}:${item.query}`, item]),
          ).values(),
        ],
      },
    };
    return result;
  };
}

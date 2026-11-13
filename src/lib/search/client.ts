import type { CatalogResponse } from "../catalog/types";

export function createIndexedCatalogSearch(
  fetcher: typeof fetch,
  live: (url: string, init?: RequestInit) => Promise<CatalogResponse>,
) {
  return async (
    input: string,
    init?: RequestInit,
  ): Promise<CatalogResponse> => {
    const url = new URL(input, "https://catalog.invalid"),
      cursor = url.searchParams.get("cursor");
    if (
      !url.searchParams.get("q")?.trim() ||
      url.searchParams.get("searchMode") === "live" ||
      (cursor && !cursor.startsWith("s:"))
    )
      return live(input, init);
    let reason: "unavailable" | "filter" = "unavailable";
    try {
      const response = await fetcher(
        `/api/catalog/search?${url.searchParams}`,
        init,
      );
      if (response.status === 400) throw new InvalidSearchPage();
      reason = response.status === 422 ? "filter" : "unavailable";
      if (response.ok) {
        const result = await response.json();
        if (
          result.debug ||
          (result.sourceMode === "index" &&
            Array.isArray(result.courses) &&
            result.searchInfo?.engine)
        )
          return result;
      }
    } catch (error) {
      if (init?.signal?.aborted || error instanceof InvalidSearchPage || cursor)
        throw error;
    }
    if (init?.signal?.aborted) throw init.signal.reason;
    // A pinned generation cannot be replaced by live results mid-pagination.
    if (cursor) throw new Error("Search index unavailable for this page");
    const result = await live(input, init);
    return result.searchInfo
      ? {
          ...result,
          searchInfo: { ...result.searchInfo, fallbackReason: reason },
        }
      : result;
  };
}
class InvalidSearchPage extends Error {
  constructor() {
    super("Search page no longer matches this query. Start the search again.");
  }
}

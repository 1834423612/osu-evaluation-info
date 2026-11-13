import { cacheBypassed } from "../debug/flags.ts";
import { debugServiceControlled } from "../debug/services.ts";
import { fetchCatalogResource } from "./browser-transport.ts";
import { createSmartCatalogSearch } from "./smart-search.ts";
import { createIndexedCatalogSearch } from "../search/client.ts";
import type { CatalogFacet } from "./types";

const cache = new Map<
  string,
  { expires: number; promise: Promise<CatalogFacet[]> }
>();
/** The filter panel and spelling fallback share one bounded, term-specific subject read. */
export function fetchCatalogFacets(term: string) {
  let saved = cache.get(term);
  if (
    !saved ||
    saved.expires < Date.now() ||
    cacheBypassed() ||
    debugServiceControlled("catalog")
  ) {
    const promise = fetchCatalogResource(
      `/api/catalog/facets?term=${encodeURIComponent(term)}&campus=all`,
      { signal: AbortSignal.timeout(20_000) },
    ).then(async (response) => {
      if (!response.ok) throw Error("Filters unavailable");
      return (await response.json()).filters as CatalogFacet[];
    });
    saved = { expires: Date.now() + 300_000, promise };
    cache.set(term, saved);
    while (cache.size > 10) cache.delete(cache.keys().next().value!);
    const entry = saved;
    void promise.catch(() => {
      if (cache.get(term) === entry) cache.delete(term);
    });
  }
  return saved.promise;
}
const liveSearch = createSmartCatalogSearch(
  fetchCatalogResource,
  fetchCatalogFacets,
);
export const searchCatalogWithRelated = createIndexedCatalogSearch(
  fetchCatalogResource,
  liveSearch,
);

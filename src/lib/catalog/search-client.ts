import { cacheBypassed } from "../debug/flags.ts";
import { debugServiceControlled } from "../debug/services.ts";
import { fetchCatalogResource } from "./browser-transport.ts";
import { createSmartCatalogSearch } from "./smart-search.ts";
import {
  createExactOfficialSearch,
  type SubjectVocabulary,
} from "../search/exact-route";
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
const subjectCache = new Map<
  string,
  { expires: number; promise: Promise<SubjectVocabulary[]> }
>();
function fetchSearchSubjects(term: string) {
  if (debugServiceControlled("catalog")) return fetchCatalogFacets(term);
  const hit = subjectCache.get(term);
  if (hit && hit.expires > Date.now() && !cacheBypassed()) return hit.promise;
  const promise = fetch(
    `/api/catalog/subjects?term=${encodeURIComponent(term)}`,
    { signal: AbortSignal.timeout(1500) },
  ).then(async (response) => {
    if (!response.ok) throw Error("Vocabulary unavailable");
    const data = await response.json();
    return Array.isArray(data.filters)
      ? (data.filters as SubjectVocabulary[])
      : [];
  });
  const entry = { expires: Date.now() + 300000, promise };
  subjectCache.set(term, entry);
  while (subjectCache.size > 8)
    subjectCache.delete(subjectCache.keys().next().value!);
  void promise.catch(() => {
    if (subjectCache.get(term) === entry) subjectCache.delete(term);
  });
  return promise;
}
const liveSearch = createSmartCatalogSearch(
  fetchCatalogResource,
  fetchCatalogFacets,
);
export const searchCatalogWithRelated = createIndexedCatalogSearch(
  fetchCatalogResource,
  liveSearch,
  createExactOfficialSearch(fetchCatalogResource, fetchSearchSubjects),
);

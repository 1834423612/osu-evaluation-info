import { createRequestPool } from "../catalog/request-pool.ts";
import { cacheBypassed } from "../debug/flags.ts";
import {
  entryMatches,
  SyllabusError,
  validCode,
  validQuery,
} from "./normalize.ts";
import {
  discoverSyllabusTerms,
  readSyllabusDocument,
  readSyllabusPage,
} from "./upstream.ts";
import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusQuery,
  SyllabusResult,
  SyllabusTerm,
} from "./types.ts";

export function createSyllabusClient(fetcher: typeof fetch = fetch) {
  const documentPool = createRequestPool<SyllabusResult<SyllabusDocument>>({
    concurrency: 2,
    minStartIntervalMs: 150,
    maxQueued: 20,
  });
  const documentCache = new Map<
    string,
    { result: SyllabusResult<SyllabusDocument>; expires: number }
  >();
  const pool = createRequestPool<unknown>({
    concurrency: 2,
    minStartIntervalMs: 150,
    maxQueued: 20,
    cacheMs: 5 * 60_000,
  });
  const metadata = createRequestPool<unknown>({
    concurrency: 1,
    cacheMs: 30 * 60_000,
  });
  let directUnavailable = false;
  const official = <T>(data: T): SyllabusResult<T> => ({
    data,
    source: "official-direct",
    fetchedAt: new Date().toISOString(),
  });

  async function relay<T>(
    params: URLSearchParams,
    signal?: AbortSignal,
  ): Promise<SyllabusResult<T>> {
    const response = await fetcher(`/api/syllabus?${params}`, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new SyllabusError(
        response.status === 403
          ? "restricted"
          : response.status === 404
            ? "missing"
            : "unavailable",
      );
    }
    const result = (await response.json()) as SyllabusResult<T>;
    if (
      !["official-relay", "backup"].includes(result.source) ||
      !result.fetchedAt ||
      !("data" in result)
    )
      throw new SyllabusError("unavailable");
    return result;
  }

  async function directOrRelay<T>(
    direct: () => Promise<T>,
    params: URLSearchParams,
    signal?: AbortSignal,
  ): Promise<SyllabusResult<T>> {
    if (!directUnavailable)
      try {
        return official(await direct());
      } catch (error) {
        if (signal?.aborted) throw error;
        // A cross-origin TypeError otherwise causes the same failed probe on every document.
        if (error instanceof TypeError) directUnavailable = true;
      }
    return relay<T>(params, signal);
  }

  function terms(signal?: AbortSignal) {
    return metadata.read(
      "terms",
      (jobSignal) =>
        directOrRelay(
          () => discoverSyllabusTerms(fetcher, jobSignal),
          new URLSearchParams({ resource: "terms" }),
          jobSignal,
        ),
      { signal },
    ) as Promise<SyllabusResult<SyllabusTerm[]>>;
  }

  function entries(query: SyllabusQuery, signal?: AbortSignal) {
    if (!validQuery(query)) return Promise.reject(new SyllabusError("invalid"));
    const params = new URLSearchParams({
      resource: "entries",
      subject: query.subject,
      catalog: query.catalogNumber,
      term: query.termCode,
    });
    return pool.read(
      `entries:${params}`,
      async (jobSignal) => {
        const termList = await terms(jobSignal);
        const term = termList.data.find(
          (term) => term.code === query.termCode && term.published,
        );
        if (!term || termList.source !== "official-direct")
          return relay<SyllabusEntry[]>(params, jobSignal);
        return directOrRelay(
          async () => {
            const found = new Map<string, SyllabusEntry>();
            let total: number | null = null;
            for (let page = 0; page < 20; page++) {
              const result = await readSyllabusPage(
                term,
                page,
                query,
                fetcher,
                jobSignal,
              );
              if (total !== null && result.total !== total)
                throw new SyllabusError("unavailable");
              total = result.total;
              for (const entry of result.entries) {
                if (found.has(entry.code))
                  throw new SyllabusError("unavailable");
                found.set(entry.code, entry);
              }
              if (!result.hasMore) {
                if (found.size !== total)
                  throw new SyllabusError("unavailable");
                return [...found.values()].filter((entry) =>
                  entryMatches(entry, query),
                );
              }
            }
            throw new SyllabusError("unavailable");
          },
          params,
          jobSignal,
        );
      },
      { signal },
    ) as Promise<SyllabusResult<SyllabusEntry[]>>;
  }

  function document(
    code: string,
    signal?: AbortSignal,
    { fresh = false }: { fresh?: boolean } = {},
  ) {
    if (!validCode(code)) return Promise.reject(new SyllabusError("invalid"));
    if (signal?.aborted) return Promise.reject(signal.reason);
    const cached = documentCache.get(code);
    if (!fresh && !cacheBypassed() && cached && cached.expires > Date.now())
      return Promise.resolve(cached.result);
    return documentPool.read(
      `document:${code}`,
      async (jobSignal) => {
        const result = await directOrRelay(
          () => readSyllabusDocument(code, fetcher, jobSignal),
          new URLSearchParams({ resource: "document", code }),
          jobSignal,
        );
        documentCache.set(code, { result, expires: Date.now() + 5 * 60_000 });
        while (documentCache.size > 100)
          documentCache.delete(documentCache.keys().next().value!);
        return result;
      },
      { signal },
    );
  }
  return { terms, entries, document };
}

export const syllabusClient = createSyllabusClient();

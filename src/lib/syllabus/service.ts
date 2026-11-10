import { createRequestPool } from "../catalog/request-pool.ts";
import { anonymousSyllabusFetch } from "./anonymous-fetch.ts";
import { cleanSyllabusHtml } from "./content.ts";
import {
  entryMatches,
  SyllabusError,
  validCode,
  validQuery,
} from "./normalize.ts";
import {
  syllabusBackupDocument,
  syllabusBackupEntries,
  syllabusBackupTerms,
} from "./repository.ts";
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

const pool = createRequestPool<unknown>({
  concurrency: 2,
  minStartIntervalMs: 250,
  maxQueued: 40,
  cacheMs: 5 * 60_000,
});
const official = <T>(data: T): SyllabusResult<T> => ({
  data,
  source: "official-relay",
  fetchedAt: new Date().toISOString(),
});

export async function syllabusTerms(
  signal?: AbortSignal,
): Promise<SyllabusResult<SyllabusTerm[]>> {
  try {
    return (await pool.read(
      "terms",
      async (jobSignal) =>
        official(
          await discoverSyllabusTerms(anonymousSyllabusFetch, jobSignal),
        ),
      { signal },
    )) as SyllabusResult<SyllabusTerm[]>;
  } catch (error) {
    if (signal?.aborted) throw error;
    const backup = await syllabusBackupTerms();
    if (backup) return backup;
    throw error;
  }
}

export async function syllabusEntries(
  query: SyllabusQuery,
  signal?: AbortSignal,
): Promise<SyllabusResult<SyllabusEntry[]>> {
  if (!validQuery(query)) throw new SyllabusError("invalid");
  try {
    const terms = await syllabusTerms(signal);
    if (terms.source === "backup") throw new SyllabusError("unavailable");
    const term = terms.data.find(
      (term) => term.code === query.termCode && term.published,
    );
    if (!term) {
      const backup = await syllabusBackupEntries(query);
      return backup ?? official([]);
    }
    return (await pool.read(
      `entries:${query.termCode}:${query.subject.toUpperCase()}:${query.catalogNumber.toUpperCase()}`,
      async (jobSignal) => {
        const entries = new Map<string, SyllabusEntry>();
        let expected: number | null = null;
        for (let page = 0; page < 20; page++) {
          const result = await readSyllabusPage(
            term,
            page,
            query,
            anonymousSyllabusFetch,
            jobSignal,
          );
          if (expected !== null && expected !== result.total)
            throw new SyllabusError("unavailable");
          expected = result.total;
          for (const entry of result.entries) {
            if (entries.has(entry.code)) throw new SyllabusError("unavailable");
            entries.set(entry.code, entry);
          }
          if (!result.hasMore) {
            if (entries.size !== result.total)
              throw new SyllabusError("unavailable");
            return official(
              [...entries.values()].filter((entry) =>
                entryMatches(entry, query),
              ),
            );
          }
        }
        throw new SyllabusError("unavailable");
      },
      { signal },
    )) as SyllabusResult<SyllabusEntry[]>;
  } catch (error) {
    if (signal?.aborted) throw error;
    const backup = await syllabusBackupEntries(query);
    if (backup) return backup;
    throw error;
  }
}

export async function syllabusDocument(
  code: string,
  signal?: AbortSignal,
): Promise<SyllabusResult<SyllabusDocument>> {
  if (!validCode(code)) throw new SyllabusError("invalid");
  try {
    return (await pool.read(
      `document:${code}`,
      async (jobSignal) => {
        const doc = await readSyllabusDocument(
          code,
          anonymousSyllabusFetch,
          jobSignal,
        );
        return official({
          ...doc,
          components: doc.components.map((component) => ({
            ...component,
            html: cleanSyllabusHtml(component.html),
          })),
        });
      },
      { signal },
    )) as SyllabusResult<SyllabusDocument>;
  } catch (error) {
    if (signal?.aborted) throw error;
    const backup = await syllabusBackupDocument(code);
    if (backup) return backup;
    throw error;
  }
}

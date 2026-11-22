import "server-only";
import type { QueryResultRow } from "pg";
import { getDatabasePool } from "@/lib/db";
import {
  FIND_CATALOG_SNAPSHOT_SQL,
  FIND_PREVIOUS_CATALOG_SNAPSHOT_SQL,
  LATEST_CATALOG_TERM_SQL,
  LIST_CATALOG_TERMS_SQL,
} from "@/lib/catalog/snapshot-policy";
import type { CatalogSearch } from "@/lib/catalog/types";
import { loadPreparedCorpus } from "./prepared-corpus";
import { createIndexCache } from "./index-cache";
import {
  hydrateSearchPage,
  loadCatalogCorpus,
  type CatalogCorpus,
} from "./catalog-source";
import { createSearchResultCache } from "./result-cache";
import { searchSignature, readSearchCursor, searchCorpus } from "./results";
import {
  loadSearchGeneration,
  withinSearchDeadline,
  withSearchConnection,
} from "./generation-fallback";

type Publication = {
  run: string;
  term: string;
  snapshotAt: string;
  terms: { code: string; label: string }[];
};
const indexes = createIndexCache<CatalogCorpus>(2);
const searchConnections = { connect: () => getDatabasePool().connect() };
const pages =
  createSearchResultCache<import("../catalog/types").CatalogResponse>();
const publications = new Map<
  string,
  { expires: number; promise: Promise<Publication> }
>();

async function publication(
  term?: string,
  run?: string,
  deadline = performance.now() + 20000,
) {
  const key = `${term ?? "latest"}:${run ?? "latest"}`;
  const saved = publications.get(key);
  if (saved && saved.expires > Date.now()) return saved.promise;
  const promise = (async () => {
    const pool = searchConnections;
    const read = <Row extends QueryResultRow>(
      sql: string,
      values: unknown[] = [],
    ) =>
      withSearchConnection(pool, deadline, 4000, (connection) =>
        connection.query<Row>(sql, values),
      );
    const selected =
      term ??
      (await read<{ term_code: string }>(LATEST_CATALOG_TERM_SQL)).rows[0]
        ?.term_code;
    if (!selected) throw new Error("No published catalog");
    const row = (
      await read<{
        id: string;
        completed_at: string | Date;
        terms: string[];
      }>(FIND_CATALOG_SNAPSHOT_SQL, [selected, run ?? null])
    ).rows[0];
    if (!row) throw new Error("Published search generation unavailable");
    const terms = (
      await read<import("../catalog/types").CatalogTerm>(LIST_CATALOG_TERMS_SQL)
    ).rows;
    return {
      run: row.id,
      term: selected,
      snapshotAt: new Date(row.completed_at).toISOString(),
      terms,
    };
  })();
  const entry = { expires: Date.now() + 30000, promise };
  publications.set(key, entry);
  while (publications.size > 20)
    publications.delete(publications.keys().next().value!);
  void promise.catch(() => {
    if (publications.get(key) === entry) publications.delete(key);
  });
  return promise;
}

export async function searchPublishedCatalog(input: CatalogSearch) {
  const requestDeadline = performance.now() + 28000;
  const deadline = requestDeadline - 8000;
  return withinSearchDeadline(
    (async () => {
      const cursor = readSearchCursor(input);
      const selected = await publication(
        cursor?.term ?? input.term,
        cursor?.run,
        deadline,
      );
      const key = JSON.stringify([
        selected.run,
        selected.term,
        searchSignature(input),
        input.cursor ?? "",
      ]);
      return pages.get(key, async () => {
        const corpus = await loadSearchGeneration(selected, {
          pinned: Boolean(cursor),
          previous: async (current) => {
            if (performance.now() >= deadline) return null;
            const result = await withSearchConnection(
              searchConnections,
              deadline,
              4000,
              (connection) =>
                connection.query<{ id: string; completed_at: string | Date }>(
                  FIND_PREVIOUS_CATALOG_SNAPSHOT_SQL,
                  [current.term, current.run],
                ),
            );
            const previous = result.rows[0];
            return previous
              ? {
                  ...current,
                  run: previous.id,
                  snapshotAt: new Date(previous.completed_at).toISOString(),
                }
              : null;
          },
          load: (generation) =>
            indexes.get(`${generation.run}:${generation.term}`, async () => {
              return withSearchConnection(
                searchConnections,
                deadline,
                6000,
                async (connection) => {
                  try {
                    await connection.query(
                      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
                    );
                    await connection.query("SET LOCAL statement_timeout='6s'");
                    const visible = await connection.query(
                      "SELECT 1 FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id WHERE v.run_id=$1::uuid AND v.published_at IS NOT NULL AND r.status='complete'",
                      [generation.run],
                    );
                    if (!visible.rowCount)
                      throw new Error(
                        "Search generation retired before loading",
                      );
                    const corpus =
                      (await loadPreparedCorpus(connection, generation)) ??
                      (await loadCatalogCorpus(connection, generation));
                    await connection.query("COMMIT");
                    return corpus;
                  } catch (error) {
                    await connection.query("ROLLBACK").catch(() => {});
                    throw error;
                  }
                },
              );
            }),
        });
        return withSearchConnection(
          searchConnections,
          requestDeadline,
          8000,
          (connection) =>
            hydrateSearchPage(connection, corpus, {
              ...searchCorpus(corpus, input),
              terms: selected.terms,
            }),
        );
      });
    })(),
    requestDeadline,
  );
}

const subjectPages = createSearchResultCache<
  import("./exact-route").SubjectVocabulary[]
>({ maxEntries: 8, maxBytes: 512 * 1024, maxPending: 8, ttl: 300000 });
/** Tiny vocabulary read; it never loads section payloads or builds the full index. */
export async function searchSubjectVocabulary(term?: string) {
  const selected = await publication(term);
  return subjectPages.get(`${selected.run}:${selected.term}`, async () => {
    const { rows } = await getDatabasePool().query<{
      subject: string;
      label: string;
    }>(
      `SELECT subject,max(coalesce(nullif(data->>'subjectDesc',''),subject)) AS label FROM osu_catalog.course_snapshots
    WHERE last_seen_run=$1::uuid AND term_code=$2 GROUP BY subject ORDER BY subject LIMIT 1000`,
      [selected.run, selected.term],
    );
    return [
      {
        slug: "subject",
        title: "Subject",
        items: rows.map((row) => ({
          value: row.subject,
          label: row.label.slice(0, 160),
        })),
      },
    ];
  });
}

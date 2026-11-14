import "server-only";
import { getDatabasePool } from "@/lib/db";
import {
  FIND_CATALOG_SNAPSHOT_SQL,
  LATEST_CATALOG_TERM_SQL,
  LIST_CATALOG_TERMS_SQL,
} from "@/lib/catalog/snapshot-policy";
import type { CatalogSearch } from "@/lib/catalog/types";
import { createIndexCache } from "./index-cache";
import {
  hydrateSearchPage,
  loadCatalogCorpus,
  type CatalogCorpus,
} from "./catalog-source";
import { createSearchResultCache } from "./result-cache";
import { searchSignature, readSearchCursor, searchCorpus } from "./results";

type Publication = {
  run: string;
  term: string;
  snapshotAt: string;
  terms: { code: string; label: string }[];
};
const indexes = createIndexCache<CatalogCorpus>(2);
const pages =
  createSearchResultCache<import("../catalog/types").CatalogResponse>();
const publications = new Map<
  string,
  { expires: number; promise: Promise<Publication> }
>();

async function publication(term?: string, run?: string) {
  const key = `${term ?? "latest"}:${run ?? "latest"}`;
  const saved = publications.get(key);
  if (saved && saved.expires > Date.now()) return saved.promise;
  const promise = (async () => {
    const pool = getDatabasePool();
    const selected =
      term ??
      (await pool.query<{ term_code: string }>(LATEST_CATALOG_TERM_SQL)).rows[0]
        ?.term_code;
    if (!selected) throw new Error("No published catalog");
    const row = (
      await pool.query<{
        id: string;
        completed_at: string | Date;
        terms: string[];
      }>(FIND_CATALOG_SNAPSHOT_SQL, [selected, run ?? null])
    ).rows[0];
    if (!row) throw new Error("Published search generation unavailable");
    const terms = (
      await pool.query<import("../catalog/types").CatalogTerm>(
        LIST_CATALOG_TERMS_SQL,
      )
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
  const cursor = readSearchCursor(input);
  const selected = await publication(cursor?.term ?? input.term, cursor?.run);
  const key = JSON.stringify([
    selected.run,
    selected.term,
    searchSignature(input),
    input.cursor ?? "",
  ]);
  return pages.get(key, async () => {
    const corpus = await indexes.get(
      `${selected.run}:${selected.term}`,
      async () => {
        const connection = await getDatabasePool().connect();
        try {
          await connection.query(
            "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
          );
          await connection.query("SET LOCAL statement_timeout='20s'");
          const visible = await connection.query(
            "SELECT 1 FROM osu_catalog.snapshot_versions WHERE run_id=$1::uuid AND published_at IS NOT NULL",
            [selected.run],
          );
          if (!visible.rowCount)
            throw new Error("Search generation retired before loading");
          const corpus = await loadCatalogCorpus(connection, selected);
          await connection.query("COMMIT");
          return corpus;
        } catch (error) {
          await connection.query("ROLLBACK").catch(() => {});
          throw error;
        } finally {
          connection.release();
        }
      },
    );
    return hydrateSearchPage(getDatabasePool(), corpus, {
      ...searchCorpus(corpus, input),
      terms: selected.terms,
    });
  });
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

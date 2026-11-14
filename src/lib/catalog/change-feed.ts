import "server-only";
import { getDatabasePool } from "@/lib/db";
import { createSearchResultCache } from "@/lib/search/result-cache";
import {
  LATEST_CATALOG_TERM_SQL,
  LIST_CATALOG_TERMS_SQL,
} from "./snapshot-policy";
import {
  changeSignature,
  readChangeCursor,
  ChangeInputError,
  type ChangeFilters,
  type ChangesResponse,
  type CatalogChange,
  type ChangeKind,
} from "./changes";
const cache = createSearchResultCache<ChangesResponse>({
  maxEntries: 32,
  maxBytes: 4 * 1024 * 1024,
  maxPending: 32,
  ttl: 60000,
});
export async function catalogChanges(filters: ChangeFilters) {
  const cursor = readChangeCursor(filters);
  return cache.get(JSON.stringify(filters), async () => {
    const connection = await getDatabasePool().connect();
    try {
      await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const terms = (
        await connection.query<ChangesResponse["terms"][number]>(
          LIST_CATALOG_TERMS_SQL,
        )
      ).rows;
      const term =
        filters.term ??
        (await connection.query<{ term_code: string }>(LATEST_CATALOG_TERM_SQL))
          .rows[0]?.term_code;
      if (!term || !terms.some((t) => t.code === term))
        throw new ChangeInputError("Unknown academic term");
      const since =
        cursor?.since ??
        new Date(Date.now() - filters.days * 86400000).toISOString();
      const anchor =
        cursor?.anchor ??
        (
          await connection.query<{ id: string }>(
            "SELECT coalesce(max(id),0)::text id FROM osu_catalog.course_changes",
          )
        ).rows[0].id;
      const values = [
        term,
        filters.campus,
        filters.q,
        since,
        anchor,
        filters.kind,
        cursor?.time ?? null,
        cursor?.id ?? null,
      ];
      const where = `e.term_code=$1 AND ($2='ALL' OR e.campus_code=$2) AND ($3='' OR strpos(lower(e.subject||e.catalog_number||' '||e.subject||' '||e.catalog_number||' '||e.title),lower($3))>0) AND e.observed_at>=$4::timestamptz AND e.id<=$5::bigint`;
      const counts = { added: 0, restored: 0, changed: 0, removed: 0 };
      const totals = await connection.query<{ kind: ChangeKind; n: number }>(
        `SELECT e.kind,count(*)::int n FROM osu_catalog.course_changes e WHERE ${where} GROUP BY e.kind`,
        values.slice(0, 5),
      );
      for (const row of totals.rows) counts[row.kind] = row.n;
      const rows = (
        await connection.query<CatalogChange>(
          `SELECT e.id::text,e.term_code term,e.course_id "courseId",e.offering_number offering,e.campus_code campus,e.subject,e.catalog_number catalog,e.title,e.kind,e.fields,EXISTS(SELECT 1 FROM osu_catalog.course_snapshots c WHERE c.last_seen_run=(SELECT run_id FROM osu_catalog.term_archives WHERE term_code=$1) AND c.term_code=e.term_code AND c.course_id=e.course_id AND c.offering_number=e.offering_number AND c.campus_code=e.campus_code) "current",to_char(e.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') "observedAt",e.before_data->>'title' "beforeTitle",e.before_data->'credits' "beforeCredits",e.after_data->'credits' "afterCredits",(SELECT count(*)::int FROM jsonb_object_keys(coalesce(e.before_data->'sections','{}'::jsonb))) "beforeSections",(SELECT count(*)::int FROM jsonb_object_keys(coalesce(e.after_data->'sections','{}'::jsonb))) "afterSections" FROM osu_catalog.course_changes e WHERE ${where} AND ($6='all' OR e.kind=$6) AND ($7::timestamptz IS NULL OR (e.observed_at,e.id)<($7::timestamptz,$8::bigint)) ORDER BY e.observed_at DESC,e.id DESC LIMIT 25`,
          values,
        )
      ).rows;
      const coverage = (
        await connection.query<{
          latestCheck: string | null;
          comparisonSince: string | null;
          baselineSince: string | null;
        }>(
          `SELECT max(observed_at)::text "latestCheck",min(observed_at) FILTER(WHERE previous_run_id IS NOT NULL)::text "comparisonSince",min(observed_at)::text "baselineSince" FROM osu_catalog.change_batches WHERE term_code=$1`,
          [term],
        )
      ).rows[0];
      if (!coverage.latestCheck)
        throw Error("Change history has not been initialized");
      const items = rows.slice(0, 24),
        last = items.at(-1);
      const nextCursor =
        rows.length > 24 && last
          ? Buffer.from(
              JSON.stringify({
                v: 1,
                signature: changeSignature(filters),
                id: last.id,
                anchor,
                time: last.observedAt,
                since,
              }),
            ).toString("base64url")
          : null;
      const pendingBatches = Number(
        (
          await connection.query(
            `SELECT count(*)::int n FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id WHERE v.published_at IS NOT NULL AND r.status='complete' AND r.terms ? $1 AND NOT EXISTS(SELECT 1 FROM osu_catalog.change_batches b WHERE b.run_id=v.run_id AND b.term_code=$1)`,
            [term],
          )
        ).rows[0].n,
      );
      await connection.query("COMMIT");
      return {
        term,
        terms,
        counts,
        items,
        nextCursor,
        ...coverage,
        pendingBatches,
        archived:
          terms.find((t) => t.code === term)?.sourceStatus === "not-listed",
      };
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      connection.release();
    }
  });
}

import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  CATALOG_LOCK,
  createCatalogClient,
  loadCatalogEnvironment,
  requireCatalogSchema,
  withPageTransaction,
} from "./database.mjs";

export const RETIRED_SNAPSHOT_SQL = `
  WITH ranked AS (
    SELECT v.run_id,row_number() OVER (PARTITION BY term.code ORDER BY v.published_at DESC,v.run_id DESC) AS rank
    FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id
    CROSS JOIN LATERAL jsonb_array_elements_text(r.terms) term(code)
    WHERE v.published_at IS NOT NULL AND r.status='complete'
  )
  SELECT v.run_id FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id
  WHERE r.status='complete' AND coalesce(v.published_at,r.completed_at)<now()-($2::double precision*interval '1 hour')
    AND NOT EXISTS(SELECT 1 FROM ranked p WHERE p.run_id=v.run_id AND p.rank<=$1)
  ORDER BY coalesce(v.published_at,r.completed_at),v.run_id LIMIT 1`;

/** Retire one old generation, then reclaim its rows with small resumable commits. */
export async function pruneCatalogSnapshots(
  client,
  {
    keep = 3,
    minAgeHours = 24,
    batchSize = 500,
    budgetMs = 60_000,
    wait = delay,
  } = {},
) {
  if (
    !Number.isInteger(keep) ||
    keep < 1 ||
    !Number.isFinite(minAgeHours) ||
    minAgeHours < 0 ||
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 2000
  )
    throw new Error("Invalid snapshot retention options.");
  const run = (await client.query(RETIRED_SNAPSHOT_SQL, [keep, minAgeHours]))
    .rows[0]?.run_id;
  if (!run) return { deletedRows: 0, complete: true };
  await withPageTransaction(client, () =>
    client.query(
      "UPDATE osu_catalog.snapshot_versions SET published_at=NULL WHERE run_id=$1",
      [run],
    ),
  );
  const started = Date.now();
  let deletedRows = 0;
  for (const table of ["section_snapshots", "course_snapshots"]) {
    while (Date.now() - started < budgetMs) {
      const deleted = await withPageTransaction(client, () =>
        client.query(
          `DELETE FROM osu_catalog.${table} WHERE ctid IN (SELECT ctid FROM osu_catalog.${table} WHERE last_seen_run=$1 ORDER BY ctid LIMIT $2)`,
          [run, batchSize],
        ),
      );
      deletedRows += deleted.rowCount;
      if (!deleted.rowCount) break;
      await wait(100);
    }
  }
  const remains = (
    await client.query(
      "SELECT EXISTS(SELECT 1 FROM osu_catalog.section_snapshots WHERE last_seen_run=$1) OR EXISTS(SELECT 1 FROM osu_catalog.course_snapshots WHERE last_seen_run=$1) AS present",
      [run],
    )
  ).rows[0].present;
  if (!remains)
    await withPageTransaction(client, () =>
      client.query(
        "DELETE FROM osu_catalog.snapshot_versions WHERE run_id=$1 AND published_at IS NULL",
        [run],
      ),
    );
  return { runId: run, deletedRows, complete: !remains };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: pnpm catalog:prune\nKeep at least three published generations per term and all versions younger than 24 hours; reclaim one retired version in bounded batches.",
    );
  } else {
    loadCatalogEnvironment();
    const client = createCatalogClient("osu-catalog-prune");
    let locked = false;
    try {
      await client.connect();
      locked = (
        await client.query("SELECT pg_try_advisory_lock($1) AS locked", [
          CATALOG_LOCK,
        ])
      ).rows[0].locked;
      if (!locked)
        console.log("Catalog maintenance is already running; cleanup skipped.");
      else {
        await requireCatalogSchema(client);
        console.log(JSON.stringify(await pruneCatalogSnapshots(client)));
      }
    } catch (error) {
      console.error(
        `Catalog cleanup failed (${error.code ?? "configuration"}): ${error.message}`,
      );
      process.exitCode = 1;
    } finally {
      if (locked)
        await client
          .query("SELECT pg_advisory_unlock($1)", [CATALOG_LOCK])
          .catch(() => {});
      await client.end().catch(() => {});
    }
  }
}

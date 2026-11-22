import {
  CATALOG_LOCK,
  createCatalogClient,
  loadCatalogEnvironment,
  requireCatalogSchema,
  withPageTransaction,
} from "./database.mjs";
import {
  captureCourseChanges,
  parseChangeBackfillOptions,
} from "./changes.mjs";
import { catalogFailure } from "./diagnostics.mjs";
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Usage: node scripts/catalog/backfill_changes.mjs [--max-batches 12] [--max-seconds 180]\nIndex missing term batches from complete snapshots; no OSU requests or source writes.",
  );
  process.exit(0);
}
const { maxBatches: limit, maxSeconds } = parseChangeBackfillOptions(args);
const deadline = performance.now() + maxSeconds * 1000;
loadCatalogEnvironment();
const client = createCatalogClient("osu-catalog-change-backfill");
let locked = false;
try {
  await client.connect();
  await requireCatalogSchema(client);
  locked = (
    await client.query("SELECT pg_try_advisory_lock($1) locked", [CATALOG_LOCK])
  ).rows[0].locked;
  if (!locked) throw Error("Another catalog maintenance operation is running.");
  const { rows } = await client.query(
    `SELECT v.run_id,t.value term FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id CROSS JOIN jsonb_array_elements_text(r.terms) t(value) WHERE v.published_at IS NOT NULL AND r.status='complete' AND NOT EXISTS(SELECT 1 FROM osu_catalog.change_batches b WHERE b.run_id=r.id AND b.term_code=t.value) ORDER BY v.published_at,v.run_id,t.value LIMIT $1`,
    [limit],
  );
  let processed = 0,
    pausedForRuntime = false;
  for (const row of rows) {
    if (performance.now() >= deadline) {
      pausedForRuntime = true;
      break;
    }
    const start = performance.now();
    let count;
    try {
      count = await withPageTransaction(client, () =>
        captureCourseChanges(client, row.run_id, row.term, { deadline }),
      );
    } catch (error) {
      if (!["CATALOG_CHANGE_BUDGET", "57014"].includes(error.code)) throw error;
      console.warn(
        JSON.stringify(
          catalogFailure("catalog.change_backfill_deferred", error, {
            run: row.run_id,
            term: row.term,
          }),
        ),
      );
      pausedForRuntime = true;
      break;
    }
    processed++;
    console.log(
      JSON.stringify({
        run: row.run_id,
        term: row.term,
        changes: count,
        ms: Math.round(performance.now() - start),
      }),
    );
  }
  console.log(
    JSON.stringify({
      processed,
      budgetReached: pausedForRuntime || processed === limit,
      pausedForRuntime,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify(catalogFailure("catalog.change_backfill_failed", error)),
  );
  process.exitCode = 1;
} finally {
  if (locked)
    await client
      .query("SELECT pg_advisory_unlock($1)", [CATALOG_LOCK])
      .catch(() => {});
  await client.end().catch(() => {});
}

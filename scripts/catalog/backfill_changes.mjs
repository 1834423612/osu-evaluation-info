import {
  CATALOG_LOCK,
  createCatalogClient,
  loadCatalogEnvironment,
  requireCatalogSchema,
  withPageTransaction,
} from "./database.mjs";
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Usage: node scripts/catalog/backfill_changes.mjs [--max-batches 12]\nIndex missing term batches from complete snapshots; no OSU requests or source writes.",
  );
  process.exit(0);
}
let limit = 12;
if (args.length) {
  if (
    args.length !== 2 ||
    args[0] !== "--max-batches" ||
    !/^\d+$/.test(args[1]) ||
    Number(args[1]) < 1 ||
    Number(args[1]) > 200
  )
    throw Error("Expected --max-batches 1..200");
  limit = Number(args[1]);
}
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
  for (const row of rows) {
    const start = performance.now();
    const count = await withPageTransaction(client, async () =>
      Number(
        (
          await client.query(
            "SELECT osu_catalog.capture_course_changes($1,$2) n",
            [row.run_id, row.term],
          )
        ).rows[0].n,
      ),
    );
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
      processed: rows.length,
      budgetReached: rows.length === limit,
    }),
  );
} catch (error) {
  console.error(
    `Change backfill failed (${error.code ?? "configuration"}): ${error.message}`,
  );
  process.exitCode = 1;
} finally {
  if (locked)
    await client
      .query("SELECT pg_advisory_unlock($1)", [CATALOG_LOCK])
      .catch(() => {});
  await client.end().catch(() => {});
}

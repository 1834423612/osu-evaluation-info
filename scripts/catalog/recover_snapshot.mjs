import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  CATALOG_LOCK,
  createCatalogClient,
  loadCatalogEnvironment,
  requireCatalogSchema,
  withPageTransaction,
} from "./database.mjs";
import { FIND_CATALOG_SNAPSHOT_SQL } from "../../src/lib/catalog/snapshot-policy.ts";
import { catalogFailure } from "./diagnostics.mjs";

/** Quarantine only a demonstrably degraded current head. Source archives remain immutable. */
export async function quarantinePublishedCatalog(
  client,
  run,
  { apply = false, backup } = {},
) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(run))
    throw Error("Invalid recovery run ID");
  if (apply && !backup)
    throw Error("An exclusive metadata backup path is required with --apply");
  return withPageTransaction(client, async () => {
    const lock = await client.query(
      "SELECT pg_try_advisory_xact_lock($1) AS locked",
      [CATALOG_LOCK],
    );
    if (!lock.rows[0].locked)
      throw Error("Another catalog maintenance task is running");
    const target = (
      await client.query(
        "SELECT r.*,v.published_at FROM osu_catalog.sync_runs r JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id WHERE r.id=$1 AND r.status='complete' AND v.published_at IS NOT NULL FOR UPDATE OF r",
        [run],
      )
    ).rows[0];
    if (!target) throw Error("Recovery requires a complete published run");
    const fallbacks = [];
    for (const term of target.terms) {
      const head = (await client.query(FIND_CATALOG_SNAPSHOT_SQL, [term, null]))
        .rows[0];
      if (head?.id !== run)
        throw Error(
          "Recovery target is no longer the current head for every term",
        );
      const previous = (
        await client.query(
          "SELECT r.id FROM osu_catalog.sync_runs r JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id WHERE r.status='complete' AND v.published_at IS NOT NULL AND r.terms ? $1 AND (v.published_at,r.id)<($2::timestamptz,$3::uuid) ORDER BY v.published_at DESC,r.id DESC LIMIT 1",
          [term, target.published_at, run],
        )
      ).rows[0];
      if (!previous)
        throw Error(
          "Recovery requires a previous complete publication for every term",
        );
      fallbacks.push({ term, run: previous.id });
    }
    const regressions = (
      await client.query(
        "SELECT * FROM osu_catalog.coverage_regressions($1::uuid)",
        [run],
      )
    ).rows;
    if (!regressions.length)
      throw Error(
        "No coverage regression found; refusing to quarantine a healthy publication",
      );
    const plan = {
      event: "catalog.snapshot_quarantine",
      apply,
      run,
      fallbacks,
      regressions,
    };
    if (apply) {
      await writeFile(
        backup,
        JSON.stringify({ target, ...plan }, null, 2) + "\n",
        { flag: "wx", mode: 0o600 },
      );
      const changed = await client.query(
        "UPDATE osu_catalog.sync_runs SET status='failed',error=$2 WHERE id=$1 AND status='complete'",
        [
          run,
          "CATALOG_COVERAGE_REGRESSION: quarantined; previous accepted publications retained.",
        ],
      );
      if (changed.rowCount !== 1)
        throw Error("Recovery target changed before quarantine");
    }
    return plan;
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: node scripts/catalog/recover_snapshot.mjs --run UUID [--apply --backup FILE]\nDefault: read-only recovery plan. Apply records an exclusive private metadata backup and quarantines a degraded current publication. All source snapshots and publication markers are retained. Requires catalog migration 7.",
    );
  } else {
    const options = {};
    let run;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--apply" && !options.apply) options.apply = true;
      else if (args[i] === "--run" && !run) run = args[++i];
      else if (args[i] === "--backup" && !options.backup)
        options.backup = args[++i];
      else throw Error("Expected --run UUID [--apply --backup FILE]");
    }
    loadCatalogEnvironment();
    const client = createCatalogClient("osu-catalog-recovery");
    try {
      await client.connect();
      await requireCatalogSchema(client);
      console.log(
        JSON.stringify(await quarantinePublishedCatalog(client, run, options)),
      );
    } catch (error) {
      console.error(
        JSON.stringify(catalogFailure("catalog.recovery_failed", error)),
      );
      process.exitCode = 1;
    } finally {
      await client.end();
    }
  }
}

import { pathToFileURL } from "node:url";
import {
  CATALOG_LOCK,
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";
import {
  FIND_CATALOG_SNAPSHOT_SQL,
  LIST_CATALOG_TERMS_SQL,
} from "../../src/lib/catalog/snapshot-policy.ts";
import { loadCatalogCorpus } from "../../src/lib/search/catalog-source.ts";
import {
  encodePreparedCorpus,
  decodePreparedCorpus,
  SEARCH_ARTIFACT_VERSION,
} from "../../src/lib/search/prepared-corpus.ts";

/** Used before publication; callers hold the catalog synchronization lock. */
export async function prepareSearchGeneration(client, snapshot) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  try {
    const corpus = await loadCatalogCorpus(client, snapshot);
    const artifact = encodePreparedCorpus(corpus);
    await client.query(
      `INSERT INTO osu_catalog.search_artifacts(run_id,term_code,format_version,payload,digest)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(run_id,term_code,format_version)
       DO UPDATE SET payload=EXCLUDED.payload,digest=EXCLUDED.digest,prepared_at=now()`,
      [
        snapshot.run,
        snapshot.term,
        SEARCH_ARTIFACT_VERSION,
        artifact.payload,
        artifact.digest,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}
/** Build outside visitor requests. Publish each complete artifact atomically. */
export async function prepareSearchArtifacts(client) {
  const installed = await client.query(
    "SELECT to_regclass('osu_catalog.search_artifacts') IS NOT NULL AS installed",
  );
  if (!installed.rows[0]?.installed)
    throw new Error(
      "Search artifact schema missing. Run pnpm catalog:migrate first.",
    );
  const terms = (await client.query(LIST_CATALOG_TERMS_SQL)).rows;
  let built = 0,
    reused = 0;
  for (const term of terms) {
    const selected = (
      await client.query(FIND_CATALOG_SNAPSHOT_SQL, [term.code, null])
    ).rows[0];
    if (!selected) continue;
    const snapshot = {
      run: selected.id,
      term: term.code,
      snapshotAt: new Date(selected.completed_at).toISOString(),
      terms,
    };
    const existing = await client.query(
      "SELECT payload,digest FROM osu_catalog.search_artifacts WHERE run_id=$1 AND term_code=$2 AND format_version=$3",
      [selected.id, term.code, SEARCH_ARTIFACT_VERSION],
    );
    if (existing.rows.length) {
      try {
        decodePreparedCorpus(
          existing.rows[0].payload,
          existing.rows[0].digest,
          snapshot,
        );
        reused++;
        continue;
      } catch {
        /* Rebuild damaged derived data from its immutable source. */
      }
    }
    await prepareSearchGeneration(client, snapshot);
    built++;
  }
  // Only disposable derived artifacts are pruned; original snapshots are never changed.
  await client.query(`DELETE FROM osu_catalog.search_artifacts WHERE (run_id,term_code,format_version) IN (
    SELECT run_id,term_code,format_version FROM (
      SELECT run_id,term_code,format_version,row_number() OVER (
        PARTITION BY term_code,format_version ORDER BY prepared_at DESC,run_id DESC) AS position
      FROM osu_catalog.search_artifacts a
      WHERE EXISTS (SELECT 1 FROM osu_catalog.snapshot_versions v
        WHERE v.run_id=a.run_id AND v.published_at IS NOT NULL)
    ) ranked WHERE position > 2)`);
  return { built, reused };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.includes("--help")) {
    console.log(
      "Usage: pnpm search:prepare\nReads published catalog snapshots, writes derived search artifacts. Requires catalog migration 6. No upstream calls.",
    );
  } else {
    loadCatalogEnvironment();
    const client = createCatalogClient("osu-search-prepare");
    try {
      await client.connect();
      // Share the synchronization lock; ordinary catalog readers remain unblocked.
      const lock = await client.query(
        "SELECT pg_try_advisory_lock($1) AS locked",
        [CATALOG_LOCK],
      );
      if (!lock.rows[0].locked)
        throw new Error("Search preparation is already running.");
      console.log(JSON.stringify(await prepareSearchArtifacts(client)));
    } finally {
      await client.end();
    }
  }
}

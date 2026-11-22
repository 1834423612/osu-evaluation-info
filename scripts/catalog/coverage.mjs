import { catalogError } from "./upstream.mjs";

/** Read-only preflight. Migration 7 also enforces this at the publication boundary. */
export async function assertCatalogCoverage(client, runId) {
  const { rows } = await client.query(
    "SELECT * FROM osu_catalog.coverage_regressions($1::uuid)",
    [runId],
  );
  if (!rows.length) return;
  const detail = {
    run: runId,
    affected: rows.length,
    regressions: rows.slice(0, 20),
  };
  console.error(
    JSON.stringify({ event: "catalog.publication_rejected", ...detail }),
  );
  throw catalogError(
    `Official coverage collapsed; keeping the last accepted catalog. ${JSON.stringify(detail)}`,
    "CATALOG_COVERAGE_REGRESSION",
  );
}

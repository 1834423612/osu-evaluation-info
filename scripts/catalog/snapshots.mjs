import { withPageTransaction } from "./database.mjs";
import { catalogError } from "./upstream.mjs";

/** Validation and publication share one short transaction; readers keep old versions. */
export async function publishCatalogSnapshot(
  client,
  runId,
  expected,
  distinct,
  discovery = null,
) {
  if (
    discovery &&
    (!Array.isArray(discovery.terms) ||
      !discovery.terms.length ||
      discovery.terms.some((term) => !/^\d{4}$/.test(term)) ||
      !Number.isFinite(Date.parse(discovery.checkedAt)))
  )
    throw new Error("Invalid official term discovery.");
  await withPageTransaction(client, async () => {
    const completed = await client.query(
      `
      UPDATE osu_catalog.sync_runs r SET status='complete',completed_at=now(),fetched_hits=$2,distinct_sections=$3,
        source_terms=$4::jsonb,source_terms_checked_at=$5::timestamptz
      WHERE r.id=$1 AND r.status='running' AND r.expected_sections=$2 AND $3>0 AND $3<=$2
        AND EXISTS(SELECT 1 FROM osu_catalog.snapshot_versions v WHERE v.run_id=r.id AND v.published_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM osu_catalog.sync_partitions p WHERE p.run_id=r.id AND (NOT p.complete OR p.expected_sections<>p.fetched_sections))
        AND (SELECT coalesce(sum(p.fetched_sections),0) FROM osu_catalog.sync_partitions p WHERE p.run_id=r.id)=$2
        AND (SELECT coalesce(sum(p.expected_sections),0) FROM osu_catalog.sync_partitions p WHERE p.run_id=r.id)=$2
        AND (SELECT count(*) FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=r.id)=$3
        AND NOT EXISTS(SELECT 1 FROM osu_catalog.course_snapshots c WHERE c.last_seen_run=r.id
          AND (c.course_id !~ '^[0-9]+$' OR c.offering_number !~ '^[0-9]+$' OR c.campus_code=''
            OR c.subject='' OR c.catalog_number='' OR NOT r.terms ? c.term_code))
        AND NOT EXISTS(SELECT 1 FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=r.id
          AND (s.class_number !~ '^[0-9]+$' OR NOT r.terms ? s.term_code
            OR NOT EXISTS(SELECT 1 FROM osu_catalog.course_snapshots c WHERE c.last_seen_run=r.id
              AND c.term_code=s.term_code AND c.course_id=s.course_id AND c.offering_number=s.offering_number
              AND c.campus_code=s.campus_code AND c.subject=s.subject AND c.catalog_number=s.catalog_number)))
      RETURNING r.id`,
      [
        runId,
        expected,
        distinct,
        discovery ? JSON.stringify([...new Set(discovery.terms)].sort()) : null,
        discovery?.checkedAt ?? null,
      ],
    );
    if (completed.rowCount !== 1)
      throw catalogError(
        "Snapshot publication rejected: incomplete or inconsistent coverage.",
        "CATALOG_CHECKPOINT_INVALID",
      );
    const published = await client.query(
      "UPDATE osu_catalog.snapshot_versions SET published_at=now() WHERE run_id=$1 AND published_at IS NULL",
      [runId],
    );
    if (published.rowCount !== 1)
      throw catalogError(
        "Snapshot publication marker is missing.",
        "CATALOG_CHECKPOINT_INVALID",
      );
  });
}

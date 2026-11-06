import { withPageTransaction } from "./database.mjs";

/** Validation and publication share one short transaction; readers keep old versions. */
export async function publishCatalogSnapshot(
  client,
  runId,
  expected,
  distinct,
) {
  await withPageTransaction(client, async () => {
    const completed = await client.query(
      `
      UPDATE osu_catalog.sync_runs r SET status='complete',completed_at=now(),fetched_hits=$2,distinct_sections=$3
      WHERE r.id=$1 AND r.status='running' AND r.expected_sections=$2
        AND EXISTS(SELECT 1 FROM osu_catalog.snapshot_versions v WHERE v.run_id=r.id AND v.published_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM osu_catalog.sync_partitions p WHERE p.run_id=r.id AND (NOT p.complete OR p.expected_sections<>p.fetched_sections))
        AND (SELECT coalesce(sum(p.fetched_sections),0) FROM osu_catalog.sync_partitions p WHERE p.run_id=r.id)=$2
        AND (SELECT count(*) FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=r.id)=$3
        AND NOT EXISTS(SELECT 1 FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=r.id
          AND NOT EXISTS(SELECT 1 FROM osu_catalog.course_snapshots c WHERE c.last_seen_run=r.id
            AND c.term_code=s.term_code AND c.course_id=s.course_id AND c.offering_number=s.offering_number))
      RETURNING r.id`,
      [runId, expected, distinct],
    );
    if (completed.rowCount !== 1)
      throw new Error(
        "Snapshot publication rejected: incomplete or inconsistent coverage.",
      );
    const published = await client.query(
      "UPDATE osu_catalog.snapshot_versions SET published_at=now() WHERE run_id=$1 AND published_at IS NULL",
      [runId],
    );
    if (published.rowCount !== 1)
      throw new Error("Snapshot publication marker is missing.");
  });
}

import { withPageTransaction } from "./database.mjs";
import { catalogError } from "./upstream.mjs";

/** Duplicate static rows must agree; never silently replace a section's identity. */
export async function writePage(client, runId, partition, page, prepared) {
  const { courses, sections, sectionCount, totalPages } = prepared;
  const coursesJson = JSON.stringify(courses),
    sectionsJson = JSON.stringify(sections);
  const fetchedAt = new Date().toISOString();
  await withPageTransaction(client, async () => {
    const courseResult = await client.query(
      `INSERT INTO osu_catalog.course_snapshots AS old (term_code,course_id,offering_number,campus_code,subject,catalog_number,title,description,data,fetched_at,last_seen_run)
       SELECT x.*, $2::timestamptz, $3::uuid FROM jsonb_to_recordset($1::jsonb) AS x(term_code text,course_id text,offering_number text,campus_code text,subject text,catalog_number text,title text,description text,data jsonb)
       ON CONFLICT (last_seen_run,term_code,course_id,offering_number,campus_code) DO UPDATE SET fetched_at=EXCLUDED.fetched_at
       WHERE old.subject=EXCLUDED.subject AND old.catalog_number=EXCLUDED.catalog_number AND old.data=EXCLUDED.data`,
      [coursesJson, fetchedAt, runId],
    );
    const sectionResult = await client.query(
      `INSERT INTO osu_catalog.section_snapshots AS old (term_code,class_number,course_id,offering_number,campus_code,subject,catalog_number,data,fetched_at,last_seen_run)
       SELECT x.*, $2::timestamptz, $3::uuid FROM jsonb_to_recordset($1::jsonb) AS x(term_code text,class_number text,course_id text,offering_number text,campus_code text,subject text,catalog_number text,data jsonb)
       ON CONFLICT (last_seen_run,term_code,class_number) DO UPDATE SET fetched_at=EXCLUDED.fetched_at
       WHERE old.course_id=EXCLUDED.course_id AND old.offering_number=EXCLUDED.offering_number
         AND old.campus_code=EXCLUDED.campus_code AND old.subject=EXCLUDED.subject
         AND old.catalog_number=EXCLUDED.catalog_number AND old.data=EXCLUDED.data`,
      [sectionsJson, fetchedAt, runId],
    );
    if (
      courseResult.rowCount !== courses.length ||
      sectionResult.rowCount !== sections.length
    )
      throw catalogError(
        "Conflicting static records across official pages; page rolled back.",
        "CATALOG_IDENTITY_CONFLICT",
      );
    const checkpoint = await client.query(
      `UPDATE osu_catalog.sync_partitions p SET next_page=$3+1,complete=$4,fetched_sections=fetched_sections+$5
       WHERE run_id=$1 AND partition_key=$2 AND next_page=$3 AND NOT complete
         AND fetched_sections+$5<=expected_sections AND (NOT $4 OR fetched_sections+$5=expected_sections)
         AND EXISTS(SELECT 1 FROM osu_catalog.sync_runs r JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id
           WHERE r.id=p.run_id AND r.status='running' AND v.published_at IS NULL)`,
      [runId, partition.partition_key, page, page === totalPages, sectionCount],
    );
    if (checkpoint.rowCount !== 1)
      throw catalogError(
        "Coverage check failed: page/checkpoint no longer agrees with the plan.",
        "CATALOG_INDEX_CHANGED",
      );
  });
}

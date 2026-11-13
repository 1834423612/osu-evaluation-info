/** Only validated, published generations are visible; cursors may pin older ones. */
export const LATEST_CATALOG_TERM_SQL = `
  SELECT term_code FROM osu_catalog.term_archives
  ORDER BY (source_status='listed') DESC,term_code DESC LIMIT 1`;

export const LIST_CATALOG_TERMS_SQL = `SELECT term_code AS code,label,
  source_status AS "sourceStatus",completed_at::text AS "snapshotAt"
  FROM osu_catalog.term_archives ORDER BY term_code DESC`;

export const FIND_CATALOG_SNAPSHOT_SQL = `
  SELECT r.id,r.completed_at,ARRAY(SELECT jsonb_array_elements_text(r.terms)) AS terms
  FROM osu_catalog.sync_runs r JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id
  WHERE v.published_at IS NOT NULL AND r.status='complete' AND r.completed_at IS NOT NULL
    AND r.terms ? $1 AND ($2::uuid IS NULL OR r.id=$2)
  ORDER BY v.published_at DESC,r.id DESC LIMIT 1`;

export const FIND_COURSE_ARCHIVE_SQL = `
  SELECT r.id,r.completed_at,ARRAY(SELECT jsonb_array_elements_text(r.terms)) AS terms
  FROM osu_catalog.sync_runs r JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id
  WHERE r.status='complete' AND r.completed_at IS NOT NULL AND v.published_at IS NOT NULL AND r.terms ? $1
    AND EXISTS(SELECT 1 FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=r.id AND s.term_code=$1
      AND s.subject=$2 AND s.catalog_number=$3 AND ($4='ALL' OR s.campus_code=$4))
  ORDER BY v.published_at DESC,r.id DESC LIMIT 1`;

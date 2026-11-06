/** Only validated, published generations are visible; cursors may pin older ones. */
export const LATEST_CATALOG_TERM_SQL = `
  SELECT available.term_code
  FROM osu_catalog.sync_runs r
  JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id
  CROSS JOIN LATERAL jsonb_array_elements_text(r.terms) AS available(term_code)
  WHERE v.published_at IS NOT NULL AND r.status='complete' AND r.completed_at IS NOT NULL
  ORDER BY available.term_code DESC,v.published_at DESC,r.id DESC LIMIT 1`;

export const FIND_CATALOG_SNAPSHOT_SQL = `
  SELECT r.id,r.completed_at,ARRAY(SELECT jsonb_array_elements_text(r.terms)) AS terms
  FROM osu_catalog.sync_runs r JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id
  WHERE v.published_at IS NOT NULL AND r.status='complete' AND r.completed_at IS NOT NULL
    AND r.terms ? $1 AND ($2::uuid IS NULL OR r.id=$2)
  ORDER BY v.published_at DESC,r.id DESC LIMIT 1`;

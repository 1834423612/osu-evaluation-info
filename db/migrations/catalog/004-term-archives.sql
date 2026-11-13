ALTER TABLE osu_catalog.sync_runs ADD COLUMN IF NOT EXISTS source_terms jsonb;
ALTER TABLE osu_catalog.sync_runs ADD COLUMN IF NOT EXISTS source_terms_checked_at timestamptz;
CREATE OR REPLACE VIEW osu_catalog.term_archives AS
WITH heads AS (
 SELECT DISTINCT ON (term_code) term_code,r.id run_id,r.completed_at,v.published_at
 FROM osu_catalog.sync_runs r JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id
 CROSS JOIN LATERAL jsonb_array_elements_text(r.terms) t(term_code)
 WHERE r.status='complete' AND r.completed_at IS NOT NULL AND v.published_at IS NOT NULL
 ORDER BY term_code,v.published_at DESC,r.id DESC
), listing AS (
 SELECT r.source_terms,r.source_terms_checked_at FROM osu_catalog.sync_runs r
 JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id
 WHERE r.status='complete' AND v.published_at IS NOT NULL AND r.source_terms IS NOT NULL
 ORDER BY v.published_at DESC,r.id DESC LIMIT 1
)
SELECT h.*,coalesce((SELECT nullif(c.data->>'term','') FROM osu_catalog.course_snapshots c
 WHERE c.last_seen_run=h.run_id AND c.term_code=h.term_code AND nullif(c.data->>'term','') IS NOT NULL LIMIT 1),h.term_code) label,
 CASE WHEN l.source_terms IS NULL THEN 'unknown' WHEN l.source_terms ? h.term_code THEN 'listed' ELSE 'not-listed' END source_status,
 l.source_terms_checked_at source_checked_at
FROM heads h LEFT JOIN listing l ON true;

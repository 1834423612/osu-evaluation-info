-- Additive migration: legacy tables remain readable throughout deployment.
CREATE TABLE IF NOT EXISTS osu_catalog.snapshot_versions (
  run_id uuid PRIMARY KEY REFERENCES osu_catalog.sync_runs(id),
  published_at timestamptz
);
CREATE TABLE IF NOT EXISTS osu_catalog.course_snapshots (
  LIKE osu_catalog.courses INCLUDING DEFAULTS INCLUDING STORAGE,
  PRIMARY KEY (last_seen_run,term_code,course_id,offering_number,campus_code),
  FOREIGN KEY (last_seen_run) REFERENCES osu_catalog.sync_runs(id)
);
CREATE TABLE IF NOT EXISTS osu_catalog.section_snapshots (
  LIKE osu_catalog.sections INCLUDING DEFAULTS INCLUDING STORAGE,
  PRIMARY KEY (last_seen_run,term_code,class_number),
  FOREIGN KEY (last_seen_run) REFERENCES osu_catalog.sync_runs(id)
);
CREATE INDEX IF NOT EXISTS course_snapshots_lookup ON osu_catalog.course_snapshots(last_seen_run,term_code,subject,catalog_number,campus_code);
CREATE INDEX IF NOT EXISTS section_snapshots_browse ON osu_catalog.section_snapshots(last_seen_run,term_code,campus_code,subject,catalog_number);
CREATE INDEX IF NOT EXISTS section_snapshots_course ON osu_catalog.section_snapshots(last_seen_run,term_code,course_id,offering_number);

-- Bootstrap only intact completed legacy snapshots, never partially overwritten data.
INSERT INTO osu_catalog.course_snapshots
SELECT c.* FROM osu_catalog.courses c
JOIN osu_catalog.sync_runs r ON r.id=c.last_seen_run
WHERE r.status='complete' AND r.completed_at IS NOT NULL
  AND r.distinct_sections=(SELECT count(*) FROM osu_catalog.sections s WHERE s.last_seen_run=r.id)
  AND NOT EXISTS (SELECT 1 FROM osu_catalog.sync_runs newer WHERE newer.started_at>r.started_at AND newer.status<>'complete' AND newer.terms ?| ARRAY(SELECT jsonb_array_elements_text(r.terms)))
ON CONFLICT DO NOTHING;
INSERT INTO osu_catalog.section_snapshots
SELECT s.* FROM osu_catalog.sections s
JOIN osu_catalog.sync_runs r ON r.id=s.last_seen_run
WHERE r.status='complete' AND r.completed_at IS NOT NULL
  AND r.distinct_sections=(SELECT count(*) FROM osu_catalog.sections original WHERE original.last_seen_run=r.id)
  AND NOT EXISTS (SELECT 1 FROM osu_catalog.sync_runs newer WHERE newer.started_at>r.started_at AND newer.status<>'complete' AND newer.terms ?| ARRAY(SELECT jsonb_array_elements_text(r.terms)))
ON CONFLICT DO NOTHING;
INSERT INTO osu_catalog.snapshot_versions(run_id,published_at)
SELECT r.id,r.completed_at FROM osu_catalog.sync_runs r
WHERE r.status='complete' AND r.completed_at IS NOT NULL AND r.distinct_sections IS NOT NULL
  AND r.distinct_sections=(SELECT count(*) FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=r.id)
  AND NOT EXISTS (SELECT 1 FROM osu_catalog.sync_runs newer WHERE newer.started_at>r.started_at AND newer.status<>'complete' AND newer.terms ?| ARRAY(SELECT jsonb_array_elements_text(r.terms)))
ON CONFLICT DO NOTHING;


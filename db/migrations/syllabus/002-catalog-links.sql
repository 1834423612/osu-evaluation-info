-- Syllabus entities have independent lifecycles; never cascade catalog retention into archives.
-- Join against an independently verified, published catalog snapshot before accepting s_ aliases.
DO $migration$
BEGIN
  IF to_regclass('osu_catalog.section_snapshots') IS NOT NULL
     AND to_regclass('osu_catalog.snapshot_versions') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW osu_syllabus.catalog_links AS
      SELECT e.code,e.term_id,e.term_code,s.class_number,s.course_id,s.offering_number,
        s.campus_code,s.subject,s.catalog_number,s.last_seen_run AS catalog_snapshot_id,
        CASE WHEN e.class_number=s.class_number THEN 'class_number' ELSE 'verified_import_alias' END AS match_method
      FROM osu_syllabus.entries e
      JOIN LATERAL (
        SELECT v.run_id FROM osu_catalog.snapshot_versions v
        JOIN osu_catalog.sync_runs r ON r.id=v.run_id
        WHERE v.published_at IS NOT NULL AND r.status='complete' AND r.terms ? e.term_code
        ORDER BY v.published_at DESC LIMIT 1
      ) latest ON true
      JOIN osu_catalog.section_snapshots s ON s.last_seen_run=latest.run_id
        AND s.term_code=e.term_code AND upper(s.subject)=upper(e.subject)
        AND upper(s.catalog_number)=upper(e.catalog_number)
        AND s.class_number=CASE
          WHEN e.class_number ~ '^[0-9]{1,8}$' THEN e.class_number
          WHEN e.data->>'sectionIdentifier' ~* '^s_[0-9]{1,8}$' THEN substring(e.data->>'sectionIdentifier' FROM 3)
          ELSE NULL END
    $view$;
  END IF;
END
$migration$;
INSERT INTO osu_syllabus.schema_versions(version) VALUES(2) ON CONFLICT DO NOTHING;

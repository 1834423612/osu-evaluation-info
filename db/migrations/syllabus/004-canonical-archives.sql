CREATE TABLE IF NOT EXISTS osu_syllabus.term_discoveries(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 checked_at timestamptz NOT NULL DEFAULT now(),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='array')
);
CREATE OR REPLACE FUNCTION osu_syllabus.protect_discovery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'PERMANENT_ARCHIVE: syllabus discovery evidence is immutable'; END $$;
CREATE TRIGGER permanent_archive_discovery BEFORE UPDATE OR DELETE OR TRUNCATE ON osu_syllabus.term_discoveries
 FOR EACH STATEMENT EXECUTE FUNCTION osu_syllabus.protect_discovery();
CREATE OR REPLACE VIEW osu_syllabus.index_heads AS
 SELECT DISTINCT ON(term_id) term_id,run_id,published_at,expected_count
 FROM osu_syllabus.sync_partitions WHERE published_at IS NOT NULL
 ORDER BY term_id,published_at DESC,run_id DESC;
CREATE OR REPLACE VIEW osu_syllabus.term_archives AS
 WITH discovery AS (SELECT * FROM osu_syllabus.term_discoveries ORDER BY id DESC LIMIT 1)
 SELECT t.id term_id,t.code,t.name,h.run_id,h.published_at,d.checked_at source_checked_at,
 CASE WHEN d.id IS NULL THEN 'unknown'
 WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(d.data) x WHERE x->>'id'=t.id::text AND x->>'published'='true') THEN 'listed'
 WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(d.data) x WHERE x->>'id'=t.id::text) THEN 'unpublished'
 ELSE 'not-listed' END source_status
 FROM osu_syllabus.terms t LEFT JOIN osu_syllabus.index_heads h ON h.term_id=t.id LEFT JOIN discovery d ON true;
CREATE OR REPLACE FUNCTION osu_syllabus.official_modified(value text) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
BEGIN
 IF value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' OR value !~ '(Z|[+-][0-9]{2}:?[0-9]{2})$' THEN RETURN NULL; END IF;
 RETURN value::timestamptz;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN NULL;
END $$;
INSERT INTO osu_syllabus.schema_versions(version) VALUES(4) ON CONFLICT DO NOTHING;

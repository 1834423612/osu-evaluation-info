BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION osu_rmp.retain_raw_source()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PERMANENT_ARCHIVE: raw RMP source data must be retained';
END;
$$;
DO $migration$
DECLARE target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['professor','review','professor_school'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS retain_raw_source_delete ON osu_rmp.%I',target);
    EXECUTE format('CREATE TRIGGER retain_raw_source_delete BEFORE DELETE ON osu_rmp.%I FOR EACH ROW EXECUTE FUNCTION osu_rmp.retain_raw_source()',target);
    EXECUTE format('DROP TRIGGER IF EXISTS retain_raw_source_truncate ON osu_rmp.%I',target);
    EXECUTE format('CREATE TRIGGER retain_raw_source_truncate BEFORE TRUNCATE ON osu_rmp.%I FOR EACH STATEMENT EXECUTE FUNCTION osu_rmp.retain_raw_source()',target);
  END LOOP;
END $migration$;
CREATE INDEX IF NOT EXISTS idx_rmp_library_review_course
  ON osu_rmp.review(professor_id,(btrim(coalesce(class_name,''))),legacy_id DESC);
INSERT INTO osu_rmp.app_migration(version) VALUES('rmp-library-v1') ON CONFLICT DO NOTHING;
COMMIT;

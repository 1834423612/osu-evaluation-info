CREATE OR REPLACE FUNCTION osu_syllabus.protect_archive() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'PERMANENT_ARCHIVE: archived syllabi cannot be removed';
  END IF;
  IF TG_TABLE_NAME='document_versions' THEN
    IF ROW(NEW.code,NEW.snapshot_id,NEW.content_hash,NEW.data,NEW.first_fetched_at)
         IS DISTINCT FROM ROW(OLD.code,OLD.snapshot_id,OLD.content_hash,OLD.data,OLD.first_fetched_at) THEN
      RAISE EXCEPTION 'PERMANENT_ARCHIVE: syllabus document versions are immutable';
    END IF;
  ELSIF TG_TABLE_NAME='entry_observations' THEN
    IF ROW(NEW.run_id,NEW.term_id,NEW.code,NEW.data,NEW.fetched_at)
         IS DISTINCT FROM ROW(OLD.run_id,OLD.term_id,OLD.code,OLD.data,OLD.fetched_at) THEN
      RAISE EXCEPTION 'PERMANENT_ARCHIVE: syllabus index observations are immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DO $migration$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['terms','entries','entry_observations','document_versions'] LOOP
    EXECUTE format('CREATE TRIGGER permanent_archive_delete BEFORE DELETE ON osu_syllabus.%I FOR EACH ROW EXECUTE FUNCTION osu_syllabus.protect_archive()',table_name);
    EXECUTE format('CREATE TRIGGER permanent_archive_truncate BEFORE TRUNCATE ON osu_syllabus.%I FOR EACH STATEMENT EXECUTE FUNCTION osu_syllabus.protect_archive()',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['entry_observations','document_versions'] LOOP
    EXECUTE format('CREATE TRIGGER permanent_archive_update BEFORE UPDATE ON osu_syllabus.%I FOR EACH ROW EXECUTE FUNCTION osu_syllabus.protect_archive()',table_name);
  END LOOP;
END $migration$;
INSERT INTO osu_syllabus.schema_versions(version) VALUES(3) ON CONFLICT DO NOTHING;

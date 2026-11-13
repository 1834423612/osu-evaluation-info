-- Protect history even when an older scheduled cleanup executable is used.
CREATE OR REPLACE FUNCTION osu_catalog.protect_archive() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'PERMANENT_ARCHIVE: catalog history cannot be truncated';
  END IF;
  IF TG_TABLE_NAME = 'snapshot_versions' THEN
    IF TG_OP = 'DELETE' OR
       (OLD.published_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'PERMANENT_ARCHIVE: catalog versions cannot be retired or removed';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM osu_catalog.sync_runs WHERE id=OLD.last_seen_run AND status='complete') THEN
    RAISE EXCEPTION 'PERMANENT_ARCHIVE: completed catalog records cannot be changed or removed';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER permanent_archive_version BEFORE UPDATE OR DELETE ON osu_catalog.snapshot_versions
FOR EACH ROW EXECUTE FUNCTION osu_catalog.protect_archive();
CREATE TRIGGER permanent_archive_course BEFORE UPDATE OR DELETE ON osu_catalog.course_snapshots
FOR EACH ROW EXECUTE FUNCTION osu_catalog.protect_archive();
CREATE TRIGGER permanent_archive_section BEFORE UPDATE OR DELETE ON osu_catalog.section_snapshots
FOR EACH ROW EXECUTE FUNCTION osu_catalog.protect_archive();
CREATE TRIGGER permanent_archive_version_truncate BEFORE TRUNCATE ON osu_catalog.snapshot_versions
FOR EACH STATEMENT EXECUTE FUNCTION osu_catalog.protect_archive();
CREATE TRIGGER permanent_archive_course_truncate BEFORE TRUNCATE ON osu_catalog.course_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION osu_catalog.protect_archive();
CREATE TRIGGER permanent_archive_section_truncate BEFORE TRUNCATE ON osu_catalog.section_snapshots
FOR EACH STATEMENT EXECUTE FUNCTION osu_catalog.protect_archive();

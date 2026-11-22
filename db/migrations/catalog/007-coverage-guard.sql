-- An internally consistent upstream index can still be incomplete. Compare
-- every candidate with the last accepted publication for each of its terms.
CREATE OR REPLACE FUNCTION osu_catalog.coverage_regressions(candidate uuid)
RETURNS TABLE(term_code text,campus_code text,subject text,previous_run uuid,previous_sections bigint,candidate_sections bigint)
LANGUAGE sql STABLE AS $$
  WITH terms AS (
    SELECT jsonb_array_elements_text(r.terms) term_code FROM osu_catalog.sync_runs r WHERE r.id=candidate
  ), baseline AS (
    SELECT DISTINCT ON (t.term_code) t.term_code,r.id
    FROM terms t JOIN osu_catalog.sync_runs r ON r.terms ? t.term_code
    JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id
    WHERE r.id<>candidate AND r.status='complete' AND v.published_at IS NOT NULL
    ORDER BY t.term_code,v.published_at DESC,r.id DESC
  ), prior AS (
    SELECT s.term_code,coalesce(s.campus_code,'') campus_code,coalesce(s.subject,'') subject,b.id previous_run,count(*) section_count
    FROM baseline b JOIN osu_catalog.section_snapshots s ON s.last_seen_run=b.id AND s.term_code=b.term_code
    GROUP BY GROUPING SETS ((s.term_code,b.id),(s.term_code,s.campus_code,b.id),(s.term_code,s.campus_code,s.subject,b.id))
  ), fresh AS (
    SELECT s.term_code,coalesce(s.campus_code,'') campus_code,coalesce(s.subject,'') subject,count(*) section_count
    FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=candidate
    GROUP BY GROUPING SETS ((s.term_code),(s.term_code,s.campus_code),(s.term_code,s.campus_code,s.subject))
  )
  SELECT p.term_code,p.campus_code,p.subject,p.previous_run,p.section_count,coalesce(f.section_count,0)
  FROM prior p LEFT JOIN fresh f USING(term_code,campus_code,subject)
  WHERE CASE WHEN p.subject='' THEN
    coalesce(f.section_count,0)=0 OR (coalesce(f.section_count,0)<p.section_count*0.8 AND p.section_count-coalesce(f.section_count,0)>=20)
  ELSE
    coalesce(f.section_count,0)<p.section_count*0.5 AND p.section_count-coalesce(f.section_count,0)>=10
  END
  ORDER BY p.term_code,p.campus_code,p.subject
$$;

-- This gate also protects publications made by older deployed sync scripts.
CREATE OR REPLACE FUNCTION osu_catalog.guard_publication_coverage() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE regressions jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(r)) INTO regressions FROM osu_catalog.coverage_regressions(NEW.run_id) r;
  IF regressions IS NOT NULL THEN
    RAISE EXCEPTION 'CATALOG_COVERAGE_REGRESSION: %',regressions;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER catalog_publication_coverage BEFORE UPDATE OF published_at ON osu_catalog.snapshot_versions
FOR EACH ROW WHEN (OLD.published_at IS NULL AND NEW.published_at IS NOT NULL)
EXECUTE FUNCTION osu_catalog.guard_publication_coverage();

-- A rejected publication is retained for audit. Its records remain immutable
-- even when operators mark its sync run failed so readers use the prior head.
CREATE OR REPLACE FUNCTION osu_catalog.protect_archive() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'PERMANENT_ARCHIVE: catalog history cannot be truncated';
  END IF;
  IF TG_TABLE_NAME = 'snapshot_versions' THEN
    IF TG_OP = 'DELETE' OR (OLD.published_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
      RAISE EXCEPTION 'PERMANENT_ARCHIVE: catalog versions cannot be retired or removed';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM osu_catalog.snapshot_versions WHERE run_id=OLD.last_seen_run AND published_at IS NOT NULL) THEN
    RAISE EXCEPTION 'PERMANENT_ARCHIVE: published catalog records cannot be changed or removed';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

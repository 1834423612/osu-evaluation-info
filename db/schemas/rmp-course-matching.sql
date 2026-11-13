-- Derived course identities. Collector source labels and review IDs are untouched.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION osu_rmp.review_course_token(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(upper(normalize(coalesce(value,''), NFKC)), '[^A-Z0-9.]', '', 'g')
$$;

CREATE TABLE IF NOT EXISTS osu_rmp.course_identity_match (
  professor_id bigint NOT NULL REFERENCES osu_rmp.professor(legacy_id),
  campus_code text NOT NULL,
  raw_course_token text NOT NULL,
  course_key text,
  state text NOT NULL CHECK (state IN ('accepted','ambiguous','unresolved','stale')),
  reason text NOT NULL,
  candidates jsonb NOT NULL,
  evidence jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (professor_id,campus_code,raw_course_token),
  CHECK ((state='accepted') = (course_key IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_rmp_course_identity_target
  ON osu_rmp.course_identity_match (professor_id,campus_code,course_key,raw_course_token)
  WHERE state='accepted';

CREATE TABLE IF NOT EXISTS osu_rmp.course_matching_refresh (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evidence_sha256 text NOT NULL UNIQUE,
  summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW osu_rmp.course_review_query AS
-- Preserve exact lookups even before a new catalog publication is indexed.
SELECT r.*,campuses.campus_code,r.course_key AS matched_course_key
FROM osu_rmp.review_query r
JOIN (SELECT DISTINCT ps.professor_id,s.campus_code
      FROM osu_rmp.professor_school ps JOIN osu_rmp.school s ON s.legacy_id=ps.school_id) campuses
  ON campuses.professor_id=r.professor_id
WHERE r.course_key IS NOT NULL
UNION ALL
SELECT r.*,m.campus_code,m.course_key AS matched_course_key
FROM osu_rmp.course_identity_match m
JOIN osu_rmp.review_query r ON r.professor_id=m.professor_id
  AND osu_rmp.review_course_token(r.class_name)=m.raw_course_token
WHERE m.state='accepted' AND m.course_key IS DISTINCT FROM r.course_key;

INSERT INTO osu_rmp.app_migration (version) VALUES ('rmp-app-v4') ON CONFLICT DO NOTHING;
COMMIT;

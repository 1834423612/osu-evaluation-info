-- __RMP_ADMIN__ is replaced by the validated domain namespace at installation.
-- Source/automatic tables stay in osu_rmp. Manual decisions are independent.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='60s';
CREATE SCHEMA IF NOT EXISTS __RMP_ADMIN__;
CREATE TABLE IF NOT EXISTS __RMP_ADMIN__.course_decision (
  professor_id bigint NOT NULL REFERENCES osu_rmp.professor(legacy_id),
  campus_code text NOT NULL,
  raw_course_token text NOT NULL,
  action text NOT NULL CHECK(action IN ('bind','unbind','reject')),
  course_key text,
  reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 2000),
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(evidence_urls)='array'),
  decided_by text NOT NULL,
  proposal_id text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(professor_id,campus_code,raw_course_token),
  CHECK((action='bind')=(course_key IS NOT NULL))
);
ALTER TABLE __RMP_ADMIN__.course_decision ADD COLUMN IF NOT EXISTS proposal_id text;
CREATE TABLE IF NOT EXISTS __RMP_ADMIN__.course_decision_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  professor_id bigint NOT NULL,
  campus_code text NOT NULL,
  raw_course_token text NOT NULL,
  previous_decision jsonb,
  decision jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rmp_course_decision_history ON __RMP_ADMIN__.course_decision_audit(professor_id,campus_code,raw_course_token,id DESC);
CREATE OR REPLACE FUNCTION __RMP_ADMIN__.audit_course_decision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO __RMP_ADMIN__.course_decision_audit(professor_id,campus_code,raw_course_token,previous_decision,decision)
    VALUES(NEW.professor_id,NEW.campus_code,NEW.raw_course_token,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS audit_course_decision ON __RMP_ADMIN__.course_decision;
CREATE TRIGGER audit_course_decision AFTER INSERT OR UPDATE ON __RMP_ADMIN__.course_decision
  FOR EACH ROW EXECUTE FUNCTION __RMP_ADMIN__.audit_course_decision();
CREATE OR REPLACE FUNCTION __RMP_ADMIN__.retain_course_decision()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'RMP decisions and audit records must be retained';
END; $$;
DROP TRIGGER IF EXISTS retain_course_decision ON __RMP_ADMIN__.course_decision;
CREATE TRIGGER retain_course_decision BEFORE DELETE OR TRUNCATE ON __RMP_ADMIN__.course_decision
  FOR EACH STATEMENT EXECUTE FUNCTION __RMP_ADMIN__.retain_course_decision();
DROP TRIGGER IF EXISTS retain_course_decision_audit ON __RMP_ADMIN__.course_decision_audit;
CREATE TRIGGER retain_course_decision_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON __RMP_ADMIN__.course_decision_audit
  FOR EACH STATEMENT EXECUTE FUNCTION __RMP_ADMIN__.retain_course_decision();
CREATE OR REPLACE VIEW __RMP_ADMIN__.course_review_query AS
SELECT r.*,campuses.campus_code,r.course_key AS matched_course_key
FROM osu_rmp.review_query r
JOIN (SELECT DISTINCT ps.professor_id,s.campus_code FROM osu_rmp.professor_school ps
      JOIN osu_rmp.school s ON s.legacy_id=ps.school_id) campuses ON campuses.professor_id=r.professor_id
LEFT JOIN __RMP_ADMIN__.course_decision d ON d.professor_id=r.professor_id AND d.campus_code=campuses.campus_code
  AND d.raw_course_token=osu_rmp.review_course_token(r.class_name)
WHERE d.professor_id IS NULL AND r.course_key IS NOT NULL
UNION ALL
SELECT r.*,m.campus_code,m.course_key AS matched_course_key
FROM osu_rmp.course_identity_match m
JOIN osu_rmp.review_query r ON r.professor_id=m.professor_id AND osu_rmp.review_course_token(r.class_name)=m.raw_course_token
LEFT JOIN __RMP_ADMIN__.course_decision d ON d.professor_id=m.professor_id AND d.campus_code=m.campus_code AND d.raw_course_token=m.raw_course_token
WHERE m.state='accepted' AND m.course_key IS DISTINCT FROM r.course_key AND d.professor_id IS NULL
UNION ALL
SELECT r.*,d.campus_code,d.course_key AS matched_course_key
FROM __RMP_ADMIN__.course_decision d
JOIN osu_rmp.review_query r ON r.professor_id=d.professor_id AND osu_rmp.review_course_token(r.class_name)=d.raw_course_token
WHERE d.action='bind';
CREATE TABLE IF NOT EXISTS __RMP_ADMIN__.admin_migration(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO __RMP_ADMIN__.admin_migration(version) VALUES('rmp-admin-v1') ON CONFLICT DO NOTHING;
INSERT INTO __RMP_ADMIN__.admin_migration(version) VALUES('rmp-admin-v2') ON CONFLICT DO NOTHING;
COMMIT;

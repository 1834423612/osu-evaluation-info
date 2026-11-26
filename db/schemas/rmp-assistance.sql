BEGIN;
CREATE SCHEMA IF NOT EXISTS __RMP_ADMIN__;
CREATE TABLE IF NOT EXISTS __RMP_ADMIN__.assistance_job (
 id uuid PRIMARY KEY,
 created_by text NOT NULL,
 creator_user_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 token_hash text CHECK(token_hash IS NULL OR token_hash ~ '^[a-f0-9]{64}$'),
 snapshot_fingerprint text NOT NULL CHECK(snapshot_fingerprint ~ '^[a-f0-9]{64}$'),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='array' AND jsonb_array_length(evidence) BETWEEN 1 AND 100),
 revoked_at timestamptz,
 revoked_by text
);
CREATE TABLE IF NOT EXISTS __RMP_ADMIN__.assistance_proposal (
 id uuid PRIMARY KEY,
 job_id uuid NOT NULL REFERENCES __RMP_ADMIN__.assistance_job(id),
 proposal_fingerprint text NOT NULL CHECK(proposal_fingerprint ~ '^[a-f0-9]{64}$'),
 data jsonb NOT NULL,
 source text NOT NULL CHECK(source IN ('machine','human-import')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','reviewed')),
 approved_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(approved_keys)='array'),
 rejected_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(rejected_keys)='array'),
 submitted_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,
 reviewed_by text
);
ALTER TABLE __RMP_ADMIN__.assistance_proposal DROP CONSTRAINT IF EXISTS assistance_proposal_job_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS assistance_proposal_payload ON __RMP_ADMIN__.assistance_proposal(job_id,proposal_fingerprint);
CREATE TABLE IF NOT EXISTS __RMP_ADMIN__.assistance_proposal_record (
 job_id uuid NOT NULL REFERENCES __RMP_ADMIN__.assistance_job(id),
 record_key text NOT NULL,
 proposal_id uuid NOT NULL REFERENCES __RMP_ADMIN__.assistance_proposal(id),
 PRIMARY KEY(job_id,record_key)
);
ALTER TABLE __RMP_ADMIN__.assistance_proposal ADD COLUMN IF NOT EXISTS approved_keys jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE __RMP_ADMIN__.assistance_proposal ADD COLUMN IF NOT EXISTS rejected_keys jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE __RMP_ADMIN__.assistance_proposal DROP CONSTRAINT IF EXISTS assistance_proposal_status_check;
ALTER TABLE __RMP_ADMIN__.assistance_proposal ADD CONSTRAINT assistance_proposal_status_check CHECK(status IN ('pending','approved','rejected','reviewed'));
CREATE TABLE IF NOT EXISTS __RMP_ADMIN__.assistance_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id uuid NOT NULL,
 proposal_id uuid,
 action text NOT NULL,
 actor text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE __RMP_ADMIN__.assistance_proposal ADD COLUMN IF NOT EXISTS approved_keys jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE __RMP_ADMIN__.assistance_proposal ADD COLUMN IF NOT EXISTS rejected_keys jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE __RMP_ADMIN__.assistance_proposal DROP CONSTRAINT IF EXISTS assistance_proposal_status_check;
ALTER TABLE __RMP_ADMIN__.assistance_proposal ADD CONSTRAINT assistance_proposal_status_check CHECK(status IN ('pending','approved','rejected','reviewed'));
ALTER TABLE __RMP_ADMIN__.assistance_audit ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE __RMP_ADMIN__.assistance_audit ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE OR REPLACE FUNCTION __RMP_ADMIN__.retain_assistance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AI assistance records must be retained'; END $$;
DROP TRIGGER IF EXISTS retain_assistance_audit ON __RMP_ADMIN__.assistance_audit;
CREATE TRIGGER retain_assistance_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON __RMP_ADMIN__.assistance_audit FOR EACH STATEMENT EXECUTE FUNCTION __RMP_ADMIN__.retain_assistance();
DROP TRIGGER IF EXISTS retain_assistance_job ON __RMP_ADMIN__.assistance_job;
CREATE TRIGGER retain_assistance_job BEFORE DELETE OR TRUNCATE ON __RMP_ADMIN__.assistance_job FOR EACH STATEMENT EXECUTE FUNCTION __RMP_ADMIN__.retain_assistance();
DROP TRIGGER IF EXISTS retain_assistance_proposal ON __RMP_ADMIN__.assistance_proposal;
CREATE TRIGGER retain_assistance_proposal BEFORE DELETE OR TRUNCATE ON __RMP_ADMIN__.assistance_proposal FOR EACH STATEMENT EXECUTE FUNCTION __RMP_ADMIN__.retain_assistance();
DROP TRIGGER IF EXISTS retain_assistance_proposal_record ON __RMP_ADMIN__.assistance_proposal_record;
CREATE TRIGGER retain_assistance_proposal_record BEFORE UPDATE OR DELETE OR TRUNCATE ON __RMP_ADMIN__.assistance_proposal_record FOR EACH STATEMENT EXECUTE FUNCTION __RMP_ADMIN__.retain_assistance();
CREATE OR REPLACE FUNCTION __RMP_ADMIN__.protect_assistance_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'revoked_at'-'revoked_by') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at'-'revoked_by') OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR length(coalesce(NEW.revoked_by,''))<3 THEN RAISE EXCEPTION 'Immutable AI job'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_assistance_job ON __RMP_ADMIN__.assistance_job;
CREATE TRIGGER protect_assistance_job BEFORE UPDATE ON __RMP_ADMIN__.assistance_job FOR EACH ROW EXECUTE FUNCTION __RMP_ADMIN__.protect_assistance_job();
CREATE OR REPLACE FUNCTION __RMP_ADMIN__.protect_assistance_proposal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'status'-'reviewed_at'-'reviewed_by'-'approved_keys'-'rejected_keys') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'reviewed_at'-'reviewed_by'-'approved_keys'-'rejected_keys') OR NOT (NEW.approved_keys @> OLD.approved_keys) OR NOT (NEW.rejected_keys @> OLD.rejected_keys) OR OLD.status<>'pending' OR NEW.status NOT IN ('pending','approved','rejected','reviewed') OR NEW.reviewed_at IS NULL OR length(coalesce(NEW.reviewed_by,''))<3 THEN RAISE EXCEPTION 'Immutable AI proposal'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_assistance_proposal ON __RMP_ADMIN__.assistance_proposal;
CREATE TRIGGER protect_assistance_proposal BEFORE UPDATE ON __RMP_ADMIN__.assistance_proposal FOR EACH ROW EXECUTE FUNCTION __RMP_ADMIN__.protect_assistance_proposal();
CREATE OR REPLACE FUNCTION __RMP_ADMIN__.audit_assistance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='assistance_job' THEN
  INSERT INTO __RMP_ADMIN__.assistance_audit(job_id,action,actor) VALUES(NEW.id,CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'revoked' END,CASE WHEN TG_OP='INSERT' THEN NEW.created_by ELSE NEW.revoked_by END);
 ELSE
  INSERT INTO __RMP_ADMIN__.assistance_audit(job_id,proposal_id,action,actor,details) VALUES(NEW.job_id,NEW.id,CASE WHEN TG_OP='INSERT' THEN 'submitted' WHEN NEW.status='pending' THEN 'partial_review' ELSE NEW.status END,CASE WHEN TG_OP='INSERT' THEN NEW.source ELSE NEW.reviewed_by END,jsonb_build_object('approvedKeys',NEW.approved_keys,'rejectedKeys',NEW.rejected_keys));
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_assistance_job ON __RMP_ADMIN__.assistance_job;
CREATE TRIGGER audit_assistance_job AFTER INSERT OR UPDATE ON __RMP_ADMIN__.assistance_job FOR EACH ROW EXECUTE FUNCTION __RMP_ADMIN__.audit_assistance();
DROP TRIGGER IF EXISTS audit_assistance_proposal ON __RMP_ADMIN__.assistance_proposal;
CREATE TRIGGER audit_assistance_proposal AFTER INSERT OR UPDATE ON __RMP_ADMIN__.assistance_proposal FOR EACH ROW EXECUTE FUNCTION __RMP_ADMIN__.audit_assistance();
COMMIT;

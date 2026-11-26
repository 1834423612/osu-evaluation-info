CREATE SCHEMA IF NOT EXISTS osu_identity;
CREATE TABLE IF NOT EXISTS osu_identity.admin_role_guard (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version bigint NOT NULL DEFAULT 0
);
INSERT INTO osu_identity.admin_role_guard(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS osu_identity.account_role (
  user_id text NOT NULL REFERENCES osu_identity."user"(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'admin' CHECK(role='admin'),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text NOT NULL CHECK(length(granted_by) BETWEEN 3 AND 200),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 8 AND 500),
  PRIMARY KEY(user_id,role)
);
CREATE TABLE IF NOT EXISTS osu_identity.account_role_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_user_id text NOT NULL,
  action text NOT NULL CHECK(action IN ('grant','revoke')),
  actor text NOT NULL CHECK(length(actor) BETWEEN 3 AND 200),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 8 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_role_audit_target ON osu_identity.account_role_audit(target_user_id,id DESC);
CREATE OR REPLACE FUNCTION osu_identity.protect_admin_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'IMMUTABLE_ADMIN_ROLE: revoke and grant instead'; END IF;
  -- Updating this single row also forces a serialization failure under stale repeatable-read snapshots.
  UPDATE osu_identity.admin_role_guard SET version=version+1 WHERE singleton;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM osu_identity."user" WHERE id=NEW.user_id) AND NOT EXISTS(SELECT 1 FROM osu_identity."user" WHERE id=NEW.user_id AND "emailVerified"=true) THEN RAISE EXCEPTION 'ADMIN_ROLE_UNVERIFIED: verify the account before granting administrator access'; END IF;
  IF TG_OP='DELETE' THEN
    IF (SELECT count(*) FROM osu_identity.account_role WHERE role='admin')<=1 OR NOT EXISTS(SELECT 1 FROM osu_identity.account_role r JOIN osu_identity."user" u ON u.id=r.user_id WHERE r.role='admin' AND u."emailVerified"=true) OR (EXISTS(SELECT 1 FROM osu_identity."user" WHERE id=OLD.user_id AND "emailVerified"=true) AND (SELECT count(*) FROM osu_identity.account_role r JOIN osu_identity."user" u ON u.id=r.user_id WHERE r.role='admin' AND u."emailVerified"=true)<=1) THEN
      RAISE EXCEPTION 'LAST_ADMIN: the final administrator cannot be revoked';
    END IF;
    IF length(coalesce(current_setting('waho.admin_actor',true),''))<3 OR length(trim(coalesce(current_setting('waho.admin_reason',true),'')))<8 THEN
      RAISE EXCEPTION 'AUDIT_CONTEXT: actor and reason required';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_admin_role ON osu_identity.account_role;
CREATE TRIGGER protect_admin_role BEFORE INSERT OR UPDATE OR DELETE ON osu_identity.account_role FOR EACH ROW EXECUTE FUNCTION osu_identity.protect_admin_role();
CREATE OR REPLACE FUNCTION osu_identity.audit_admin_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO osu_identity.account_role_audit(target_user_id,action,actor,reason) VALUES(NEW.user_id,'grant',NEW.granted_by,NEW.reason);
    RETURN NEW;
  END IF;
  INSERT INTO osu_identity.account_role_audit(target_user_id,action,actor,reason) VALUES(OLD.user_id,'revoke',current_setting('waho.admin_actor',true),current_setting('waho.admin_reason',true));
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS audit_admin_role ON osu_identity.account_role;
CREATE TRIGGER audit_admin_role AFTER INSERT OR DELETE ON osu_identity.account_role FOR EACH ROW EXECUTE FUNCTION osu_identity.audit_admin_role();
CREATE OR REPLACE FUNCTION osu_identity.protect_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_ADMIN_AUDIT'; END $$;
DROP TRIGGER IF EXISTS protect_admin_audit ON osu_identity.account_role_audit;
CREATE TRIGGER protect_admin_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON osu_identity.account_role_audit FOR EACH STATEMENT EXECUTE FUNCTION osu_identity.protect_admin_audit();
DROP TRIGGER IF EXISTS protect_admin_role_truncate ON osu_identity.account_role;
CREATE TRIGGER protect_admin_role_truncate BEFORE TRUNCATE ON osu_identity.account_role FOR EACH STATEMENT EXECUTE FUNCTION osu_identity.protect_admin_audit();
CREATE OR REPLACE FUNCTION osu_identity.change_admin_role(target text, operation text, actor text, explanation text, acting_user text DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
  IF operation NOT IN ('grant','revoke') OR length(actor) NOT BETWEEN 3 AND 200 OR length(trim(explanation)) NOT BETWEEN 8 AND 500 THEN RAISE EXCEPTION 'INVALID_ADMIN_ROLE'; END IF;
  UPDATE osu_identity.admin_role_guard SET version=version+1 WHERE singleton;
  IF acting_user IS NOT NULL AND NOT EXISTS(SELECT 1 FROM osu_identity.account_role r JOIN osu_identity."user" u ON u.id=r.user_id WHERE r.user_id=acting_user AND r.role='admin' AND u."emailVerified"=true) THEN RAISE EXCEPTION 'ADMIN_ROLE_FORBIDDEN'; END IF;
  PERFORM set_config('waho.admin_actor',actor,true);
  PERFORM set_config('waho.admin_reason',explanation,true);
  IF operation='grant' THEN
    INSERT INTO osu_identity.account_role(user_id,role,granted_by,reason) VALUES(target,'admin',actor,explanation) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM osu_identity.account_role WHERE user_id=target AND role='admin';
  END IF;
  GET DIAGNOSTICS changed=ROW_COUNT;
  RETURN changed>0;
END $$;

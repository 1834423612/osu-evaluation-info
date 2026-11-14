BEGIN;
CREATE SCHEMA IF NOT EXISTS osu_user;
CREATE TABLE IF NOT EXISTS osu_user.rate_bucket (
  bucket text NOT NULL,
  window_start bigint NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS rate_bucket_expiry ON osu_user.rate_bucket(expires_at);
CREATE TABLE IF NOT EXISTS osu_user.security_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  principal text,
  action text NOT NULL,
  network_digest text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_event_time ON osu_user.security_event(created_at);

alter table "ca_user" add column "recoveryGeneration" text;
CREATE UNIQUE INDEX IF NOT EXISTS "ca_passkey_credential_unique" ON "ca_passkey" ("credentialID");
CREATE TABLE IF NOT EXISTS "osu_user".installation (name text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()); INSERT INTO "osu_user".installation(name) VALUES ('auth:ca_') ON CONFLICT DO NOTHING;
COMMIT;

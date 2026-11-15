CREATE SCHEMA IF NOT EXISTS osu_identity;
CREATE TABLE IF NOT EXISTS osu_identity.rate_bucket (
  bucket text NOT NULL,
  window_start bigint NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS rate_bucket_expiry ON osu_identity.rate_bucket(expires_at);
CREATE TABLE IF NOT EXISTS osu_identity.security_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  principal text,
  action text NOT NULL,
  network_digest text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_event_time ON osu_identity.security_event(created_at);

CREATE TABLE IF NOT EXISTS osu_identity.cooldown_bucket (bucket text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS cooldown_bucket_expiry ON osu_identity.cooldown_bucket(expires_at);

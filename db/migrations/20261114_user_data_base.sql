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

CREATE TABLE IF NOT EXISTS osu_identity.cooldown_bucket (bucket text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE INDEX IF NOT EXISTS cooldown_bucket_expiry ON osu_identity.cooldown_bucket(expires_at);

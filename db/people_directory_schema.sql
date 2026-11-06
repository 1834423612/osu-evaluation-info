-- Public, normalized OSU directory cache. The server writes rows only after
-- verifying the name.# against an official OSU response.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE SCHEMA IF NOT EXISTS osu_directory;

CREATE TABLE IF NOT EXISTS osu_directory.person_cache (
    name_dot_number text PRIMARY KEY
        CHECK (name_dot_number ~ '^[a-z0-9_-]+\.[0-9]{1,10}$'),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 180),
    roles jsonb NOT NULL CHECK (jsonb_typeof(roles) = 'array'),
    appointments jsonb NOT NULL CHECK (jsonb_typeof(appointments) = 'array'),
    source text NOT NULL CHECK (source IN ('osu-search', 'content-api-v2')),
    verified_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS person_cache_verified_at_idx
    ON osu_directory.person_cache (verified_at DESC);

COMMIT;

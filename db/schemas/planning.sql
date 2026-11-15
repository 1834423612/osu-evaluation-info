-- Apply through scripts/planning/database.mjs: namespace is substituted there.
CREATE SCHEMA IF NOT EXISTS osu_planning;
CREATE TABLE IF NOT EXISTS osu_planning.source_document (
  id text PRIMARY KEY,
  source_url text NOT NULL CHECK (source_url ~ '^https://([a-z0-9-]+\.)*osu\.edu/'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  fetched_at timestamptz NOT NULL,
  validated_at timestamptz,
  media_type text NOT NULL,
  UNIQUE(source_url, sha256)
);
CREATE TABLE IF NOT EXISTS osu_planning.curriculum_version (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES osu_planning.source_document(id),
  document_kind text NOT NULL CHECK (document_kind IN ('sample-plan', 'requirements')),
  program text NOT NULL,
  specialization text,
  campus text,
  ge_system text CHECK (ge_system IN ('GEN', 'GEL')),
  version text NOT NULL,
  applicable_from text,
  applicable_until text,
  evidence jsonb NOT NULL,
  curriculum jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  reviewer text,
  CHECK (review_status <> 'approved' OR (reviewed_at IS NOT NULL AND reviewer IS NOT NULL)),
  UNIQUE(source_id, program, version)
);
-- Immutable versions; no TTL or automatic deletion. Private plans never enter this schema.

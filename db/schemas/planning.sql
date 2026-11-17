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
-- Both hostnames are official university domains; credential-bearing URLs are
-- rejected by the import validator before SQL is reached.
ALTER TABLE osu_planning.source_document DROP CONSTRAINT IF EXISTS source_document_source_url_check;
ALTER TABLE osu_planning.source_document ADD CONSTRAINT source_document_source_url_check
  CHECK (source_url ~ '^https://([a-z0-9-]+\.)*(osu\.edu|ohio-state\.edu)/');
CREATE TABLE IF NOT EXISTS osu_planning.source_asset (
  source_id text PRIMARY KEY REFERENCES osu_planning.source_document(id),
  content bytea NOT NULL CHECK (octet_length(content) <= 8388608),
  extraction jsonb,
  metadata jsonb NOT NULL,
  CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE TABLE IF NOT EXISTS osu_planning.directory_snapshot (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz NOT NULL,
  index_url text NOT NULL,
  directory jsonb NOT NULL CHECK (jsonb_typeof(directory) = 'object')
);
CREATE TABLE IF NOT EXISTS osu_planning.source_extraction (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  source_id text NOT NULL REFERENCES osu_planning.source_document(id),
  parser_version text NOT NULL CHECK (parser_version ~ '^[a-z0-9-]{1,80}$'),
  extracted_at timestamptz NOT NULL,
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object')
);
CREATE TABLE IF NOT EXISTS osu_planning.template_seed (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  program_code text NOT NULL CHECK (program_code ~ '^[A-Z][A-Z0-9-]{1,39}$'),
  applied_version text NOT NULL CHECK (applied_version ~ '^(AU|SP|SU)20[0-9]{2}$'),
  template jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
  imported_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE osu_planning.curriculum_version
  ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'unknown' CHECK (publication_status IN ('draft','published','unknown') AND NOT (publication_status='draft' AND document_kind='requirements' AND review_status='approved')),
  ADD COLUMN IF NOT EXISTS plan_scope text NOT NULL DEFAULT 'unknown' CHECK (plan_scope IN ('single-program','multi-program','unknown')),
  ADD COLUMN IF NOT EXISTS academic_year text CHECK (academic_year IS NULL OR academic_year ~ '^20[0-9]{2}-20[0-9]{2}$');

-- An immutable, atomically published public catalog includes complete templates,
-- directory evidence, subject aliases and source metadata for reproducible reads.
CREATE TABLE IF NOT EXISTS osu_planning.catalog_release (
  id text PRIMARY KEY CHECK (id ~ '^[a-f0-9]{64}$'),
  published_at timestamptz NOT NULL DEFAULT now(),
  catalog jsonb NOT NULL CHECK (jsonb_typeof(catalog) = 'object')
);
CREATE INDEX IF NOT EXISTS catalog_release_published_idx
  ON osu_planning.catalog_release (published_at DESC, id);

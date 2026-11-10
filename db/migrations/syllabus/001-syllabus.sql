CREATE SCHEMA IF NOT EXISTS osu_syllabus;
CREATE TABLE IF NOT EXISTS osu_syllabus.schema_versions (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS osu_syllabus.terms (
  id uuid PRIMARY KEY,
  code text,
  name text NOT NULL,
  data jsonb NOT NULL,
  ever_published boolean NOT NULL DEFAULT false,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS syllabus_term_code ON osu_syllabus.terms(code);
CREATE TABLE IF NOT EXISTS osu_syllabus.sync_runs (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running','complete','partial','failed')),
  terms jsonb NOT NULL,
  error text
);
CREATE TABLE IF NOT EXISTS osu_syllabus.sync_partitions (
  run_id uuid NOT NULL REFERENCES osu_syllabus.sync_runs(id),
  term_id uuid NOT NULL REFERENCES osu_syllabus.terms(id),
  next_page integer NOT NULL DEFAULT 0,
  expected_count integer,
  page_size integer,
  published_at timestamptz,
  unavailable_at timestamptz,
  PRIMARY KEY (run_id,term_id)
);
ALTER TABLE osu_syllabus.sync_partitions ADD COLUMN IF NOT EXISTS unavailable_at timestamptz;
CREATE TABLE IF NOT EXISTS osu_syllabus.entry_observations (
  run_id uuid NOT NULL REFERENCES osu_syllabus.sync_runs(id),
  term_id uuid NOT NULL REFERENCES osu_syllabus.terms(id),
  code text NOT NULL,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  document_status text CHECK(document_status IN ('saved','restricted','missing','failed','uploaded')),
  PRIMARY KEY (run_id,code)
);
CREATE TABLE IF NOT EXISTS osu_syllabus.entries (
  code text PRIMARY KEY,
  term_id uuid NOT NULL REFERENCES osu_syllabus.terms(id),
  entity_id uuid NOT NULL,
  term_code text,
  subject text NOT NULL,
  catalog_number text NOT NULL,
  class_number text NOT NULL,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  last_seen_run uuid NOT NULL REFERENCES osu_syllabus.sync_runs(id),
  UNIQUE(term_id,entity_id,code)
);
CREATE INDEX IF NOT EXISTS syllabus_course_lookup ON osu_syllabus.entries(term_code,subject,catalog_number,class_number);
CREATE TABLE IF NOT EXISTS osu_syllabus.document_versions (
  code text NOT NULL REFERENCES osu_syllabus.entries(code),
  snapshot_id uuid NOT NULL,
  content_hash text NOT NULL,
  data jsonb NOT NULL,
  first_fetched_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code,snapshot_id,content_hash)
);
CREATE INDEX IF NOT EXISTS syllabus_latest_document ON osu_syllabus.document_versions(code,checked_at DESC);
INSERT INTO osu_syllabus.schema_versions(version) VALUES(1) ON CONFLICT DO NOTHING;

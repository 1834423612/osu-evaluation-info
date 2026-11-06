-- Current official class-search snapshots. Historical evaluation tables are untouched.
CREATE SCHEMA IF NOT EXISTS osu_catalog;
CREATE TABLE IF NOT EXISTS osu_catalog.sync_runs (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  terms jsonb NOT NULL,
  expected_sections integer,
  error text
);
CREATE TABLE IF NOT EXISTS osu_catalog.sync_partitions (
  run_id uuid NOT NULL REFERENCES osu_catalog.sync_runs(id),
  partition_key text NOT NULL,
  query jsonb NOT NULL,
  next_page integer NOT NULL DEFAULT 1,
  complete boolean NOT NULL DEFAULT false,
  expected_sections integer NOT NULL,
  fetched_sections integer NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, partition_key)
);
CREATE TABLE IF NOT EXISTS osu_catalog.courses (
  term_code text NOT NULL,
  course_id text NOT NULL,
  offering_number text NOT NULL,
  campus_code text NOT NULL,
  subject text NOT NULL,
  catalog_number text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  last_seen_run uuid NOT NULL REFERENCES osu_catalog.sync_runs(id),
  PRIMARY KEY (term_code, course_id, offering_number, campus_code)
);
CREATE TABLE IF NOT EXISTS osu_catalog.sections (
  term_code text NOT NULL,
  class_number text NOT NULL,
  course_id text NOT NULL,
  offering_number text NOT NULL,
  campus_code text NOT NULL,
  subject text NOT NULL,
  catalog_number text NOT NULL,
  data jsonb NOT NULL,
  fetched_at timestamptz NOT NULL,
  last_seen_run uuid NOT NULL REFERENCES osu_catalog.sync_runs(id),
  PRIMARY KEY (term_code, class_number)
);
CREATE INDEX IF NOT EXISTS catalog_courses_lookup_idx ON osu_catalog.courses (subject, catalog_number, term_code);
CREATE INDEX IF NOT EXISTS catalog_sections_course_idx ON osu_catalog.sections (term_code, course_id, offering_number);
CREATE INDEX IF NOT EXISTS catalog_sections_run_idx ON osu_catalog.sections (last_seen_run);
CREATE INDEX IF NOT EXISTS catalog_courses_title_idx ON osu_catalog.courses USING gin (to_tsvector('english', subject || ' ' || catalog_number || ' ' || title));

ALTER TABLE osu_catalog.sync_runs ADD COLUMN IF NOT EXISTS fetched_hits integer;
ALTER TABLE osu_catalog.sync_runs ADD COLUMN IF NOT EXISTS distinct_sections integer;

CREATE INDEX IF NOT EXISTS catalog_sections_browse_idx ON osu_catalog.sections (last_seen_run, term_code, campus_code, subject, catalog_number);

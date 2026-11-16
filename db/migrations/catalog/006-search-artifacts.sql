-- Derived public search data only. No personal data or credentials.
CREATE TABLE IF NOT EXISTS osu_catalog.search_artifacts (
  run_id uuid NOT NULL REFERENCES osu_catalog.sync_runs(id),
  term_code text NOT NULL,
  format_version integer NOT NULL CHECK (format_version > 0),
  payload bytea NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, term_code, format_version),
  CHECK (octet_length(payload) <= 201326592)
);

-- Append-only source observations plus the latest reproducible review outcome.
CREATE TABLE IF NOT EXISTS osu_rmp.identity_research_observation (
  professor_id bigint NOT NULL REFERENCES osu_rmp.professor(legacy_id),
  evidence_sha256 text NOT NULL,
  source text NOT NULL,
  source_url text NOT NULL,
  data jsonb NOT NULL,
  first_checked_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(professor_id,evidence_sha256)
);
CREATE TABLE IF NOT EXISTS osu_rmp.identity_research_result (
  professor_id bigint PRIMARY KEY REFERENCES osu_rmp.professor(legacy_id),
  state text NOT NULL CHECK(state IN ('confirmed','unresolved','ambiguous','source_unavailable','reserved')),
  name_dot_number text,
  reason text NOT NULL,
  classification jsonb NOT NULL,
  evidence jsonb NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

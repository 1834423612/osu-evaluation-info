CREATE TABLE osu_identity.planning_backup (
  account_id text PRIMARY KEY,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  plan jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (plan IS NULL OR octet_length(plan::text) <= 2097152)
);
CREATE TABLE osu_planning.requirement_template (
  digest text PRIMARY KEY CHECK (digest ~ '^[a-f0-9]{64}$'),
  program_code text NOT NULL,
  applied_version text,
  catalog_term text,
  tree jsonb NOT NULL,
  source_kind text NOT NULL DEFAULT 'user-submitted-bdp',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (octet_length(tree::text) <= 1048576)
);
CREATE INDEX requirement_template_program ON osu_planning.requirement_template(program_code, applied_version);

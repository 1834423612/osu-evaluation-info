CREATE TABLE osu_identity.planning_share (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  seed uuid NOT NULL,
  snapshot jsonb NOT NULL,
  bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 524288),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX planning_share_owner ON osu_identity.planning_share(owner_id);

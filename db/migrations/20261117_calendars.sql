CREATE TABLE osu_identity.calendar_link (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  selection_key text NOT NULL,
  calendar_ids jsonb NOT NULL,
  categories jsonb NOT NULL,
  author jsonb NOT NULL DEFAULT '{}',
  seed uuid NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,selection_key)
);
CREATE INDEX calendar_link_owner ON osu_identity.calendar_link(owner_id);
CREATE TABLE osu_identity.calendar (
  owner_id text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,id)
);
INSERT INTO osu_identity.calendar(owner_id,id,data)
SELECT account_id,entry->>'id',entry FROM osu_identity.planning_backup,
LATERAL jsonb_array_elements(coalesce(plan->'schedule'->'calendars','[]'::jsonb)) entry
ON CONFLICT DO NOTHING;

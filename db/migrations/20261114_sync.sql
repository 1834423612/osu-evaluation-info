CREATE TABLE osu_saved.sync_state (
  owner_id text PRIMARY KEY,
  sequence bigint NOT NULL DEFAULT 0,
  floor bigint NOT NULL DEFAULT 0
);
CREATE TABLE osu_saved.sync_item (
  owner_id text NOT NULL REFERENCES osu_saved.sync_state(owner_id),
  key text NOT NULL,
  version bigint NOT NULL,
  item jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,key)
);
CREATE INDEX sync_item_cursor ON osu_saved.sync_item(owner_id,version);
CREATE TABLE osu_saved.sync_receipt (
  owner_id text NOT NULL REFERENCES osu_saved.sync_state(owner_id),
  operation_id uuid NOT NULL,
  digest text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,operation_id)
);
CREATE INDEX sync_receipt_expiry ON osu_saved.sync_receipt(created_at);

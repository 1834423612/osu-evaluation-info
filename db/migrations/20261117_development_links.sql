CREATE TABLE osu_identity.development_grant (
  id uuid PRIMARY KEY,
  account_id text NOT NULL,
  display_label text NOT NULL,
  token_digest text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX development_grant_owner ON osu_identity.development_grant(account_id);
CREATE TABLE osu_identity.development_link (
  account_id text PRIMARY KEY,
  remote_account_id text NOT NULL,
  display_label text NOT NULL,
  token_cipher text NOT NULL,
  base jsonb NOT NULL,
  conflicts jsonb NOT NULL DEFAULT '[]',
  pulled_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

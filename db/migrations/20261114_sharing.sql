CREATE TABLE IF NOT EXISTS osu_user.principal (
 id text PRIMARY KEY,
 account_id text,
 token_digest text UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz
);
CREATE INDEX IF NOT EXISTS principal_expiry ON osu_user.principal(expires_at);
CREATE TABLE IF NOT EXISTS osu_sharing.shared_collection (
 id uuid PRIMARY KEY,
 owner_id text NOT NULL REFERENCES osu_user.principal(id),
 title text NOT NULL,
 snapshot jsonb NOT NULL,
 bytes integer NOT NULL,
 visibility text NOT NULL CHECK (visibility IN ('public','link')),
 capability_digest text NOT NULL,
 management_digest text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS shared_owner ON osu_sharing.shared_collection(owner_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS shared_expiry ON osu_sharing.shared_collection(expires_at);
CREATE TABLE IF NOT EXISTS osu_sharing.share_code (
 code text PRIMARY KEY CHECK (code ~ '^[0-9]{6}$'),
 share_id uuid NOT NULL REFERENCES osu_sharing.shared_collection(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 reusable_after timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS share_code_expiry ON osu_sharing.share_code(expires_at);
CREATE TABLE IF NOT EXISTS osu_sharing.share_event (
 event_key text PRIMARY KEY,
 share_id uuid NOT NULL REFERENCES osu_sharing.shared_collection(id) ON DELETE CASCADE,
 action text NOT NULL CHECK (action IN ('preview','open','import')),
 principal_id text,
 source text NOT NULL DEFAULT 'browser' CHECK (source IN ('browser','bot','unknown')),
 item_count integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS share_event_share ON osu_sharing.share_event(share_id,action,created_at);

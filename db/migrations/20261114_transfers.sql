CREATE TABLE osu_user.transfer (
 id uuid PRIMARY KEY,
 owner_id text NOT NULL REFERENCES osu_user.principal(id),
 request_digest text NOT NULL,
 seed uuid NOT NULL,
 snapshot jsonb NOT NULL,
 bytes integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 claimed_by text,
 claim_seed uuid,
 lease_until timestamptz,
 completed_at timestamptz
);
CREATE INDEX transfer_owner ON osu_user.transfer(owner_id,created_at DESC);
CREATE INDEX transfer_expiry ON osu_user.transfer(expires_at);
CREATE TABLE osu_user.transfer_code (
 code text PRIMARY KEY CHECK(code ~ '^[0-9]{6}$'),
 transfer_id uuid NOT NULL REFERENCES osu_user.transfer(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 reusable_after timestamptz NOT NULL
);
CREATE TABLE osu_user.transfer_pair (
 id uuid PRIMARY KEY,
 transfer_id uuid NOT NULL REFERENCES osu_user.transfer(id) ON DELETE CASCADE,
 recipient_id text NOT NULL REFERENCES osu_user.principal(id),
 challenge text NOT NULL,
 expires_at timestamptz NOT NULL,
 approved_at timestamptz,
 UNIQUE(transfer_id,recipient_id)
);
CREATE INDEX transfer_pair_expiry ON osu_user.transfer_pair(expires_at);

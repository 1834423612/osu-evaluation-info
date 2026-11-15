CREATE TABLE osu_sharing.page_link (
 id uuid PRIMARY KEY,
 owner_id text NOT NULL REFERENCES osu_user.principal(id),
 href text NOT NULL,
 title text NOT NULL,
 course jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 previews bigint NOT NULL DEFAULT 0,
 opens bigint NOT NULL DEFAULT 0,
 UNIQUE(owner_id,href)
);
CREATE INDEX page_link_owner ON osu_sharing.page_link(owner_id,created_at DESC);

ALTER TABLE osu_identity.calendar ADD COLUMN refresh_after timestamptz NOT NULL DEFAULT '-infinity';

ALTER TABLE osu_user.shared_collection ADD COLUMN IF NOT EXISTS capability_seed uuid;
ALTER TABLE osu_user.shared_collection ADD COLUMN IF NOT EXISTS request_digest text;

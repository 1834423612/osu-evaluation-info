ALTER TABLE osu_analytics.visitor_context ADD COLUMN account_id text, ADD COLUMN browser_context jsonb NOT NULL DEFAULT '{}', ADD COLUMN network_location jsonb, ADD COLUMN umami_id text;
CREATE INDEX visitor_context_account ON osu_analytics.visitor_context(account_id,created_at DESC);

CREATE INDEX visitor_context_environment_page ON osu_analytics.visitor_context(environment,created_at DESC,session_id DESC);

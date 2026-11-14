CREATE TABLE osu_user.product_event (
 id uuid PRIMARY KEY,
 actor_digest text NOT NULL,
 session_id uuid NOT NULL,
 type text NOT NULL,
 path text NOT NULL,
 entity text,
 term text,
 status text,
 result_count integer,
 duration_ms integer,
 captured_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 environment text NOT NULL,
 release text NOT NULL
);
CREATE INDEX product_event_recent ON osu_user.product_event(environment,received_at DESC);
CREATE INDEX product_event_expiry ON osu_user.product_event(received_at);
CREATE TABLE osu_user.product_day (
 day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
 environment text NOT NULL,
 type text NOT NULL,
 dimension text NOT NULL DEFAULT '',
 hits bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(day,environment,type,dimension)
);
CREATE TABLE osu_user.visitor_context (
 session_id uuid PRIMARY KEY,
 actor_digest text NOT NULL,
 user_agent text NOT NULL,
 accept_language text NOT NULL,
 language text NOT NULL,
 languages jsonb NOT NULL,
 time_zone text NOT NULL,
 viewport text NOT NULL,
 network_address inet,
 network_source text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 environment text NOT NULL
);
CREATE INDEX visitor_context_expiry ON osu_user.visitor_context(created_at);
CREATE INDEX sync_item_popular ON osu_user.sync_item(key,updated_at DESC) WHERE item IS NOT NULL;

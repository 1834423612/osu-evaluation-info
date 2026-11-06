-- Additive collector state; safe to reapply without rewriting imported reviews.
BEGIN;

ALTER TABLE osu_rmp.collection_run
    ADD COLUMN IF NOT EXISTS expected_professors integer,
    ADD COLUMN IF NOT EXISTS observed_professors integer,
    ADD COLUMN IF NOT EXISTS expected_reviews integer,
    ADD COLUMN IF NOT EXISTS observed_reviews integer,
    ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS deletion_check_status text NOT NULL DEFAULT 'pending';

ALTER TABLE osu_rmp.professor
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS last_full_refresh_at timestamptz;

ALTER TABLE osu_rmp.review
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Keep one immutable row for each distinct upstream payload. Repeated identical
-- runs deduplicate by entity and hash, so polling does not duplicate comments.
CREATE TABLE IF NOT EXISTS osu_rmp.professor_observation (
    professor_id        bigint NOT NULL REFERENCES osu_rmp.professor(legacy_id),
    observation_kind    text NOT NULL CHECK (observation_kind IN ('search', 'review-profile')),
    payload_sha256      text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    first_seen_run_id   bigint NOT NULL REFERENCES osu_rmp.collection_run(id),
    payload             jsonb NOT NULL,
    observed_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (professor_id, observation_kind, payload_sha256)
);

CREATE TABLE IF NOT EXISTS osu_rmp.review_observation (
    review_id           bigint NOT NULL REFERENCES osu_rmp.review(legacy_id),
    payload_sha256      text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
    first_seen_run_id   bigint NOT NULL REFERENCES osu_rmp.collection_run(id),
    professor_id        bigint NOT NULL REFERENCES osu_rmp.professor(legacy_id),
    payload             jsonb NOT NULL,
    observed_at         timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (review_id, payload_sha256)
);

CREATE INDEX IF NOT EXISTS idx_rmp_professor_observation_history
    ON osu_rmp.professor_observation (professor_id, observation_kind, first_seen_run_id DESC);
CREATE INDEX IF NOT EXISTS idx_rmp_review_observation_history
    ON osu_rmp.review_observation (review_id, first_seen_run_id DESC);
CREATE INDEX IF NOT EXISTS idx_rmp_review_observation_professor_history
    ON osu_rmp.review_observation (professor_id, first_seen_run_id DESC);

ALTER TABLE osu_rmp.run_school
    ADD COLUMN IF NOT EXISTS expected_count integer,
    ADD COLUMN IF NOT EXISTS loaded_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stored_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS previous_cursor text;

ALTER TABLE osu_rmp.run_professor
    ADD COLUMN IF NOT EXISTS expected_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stored_count integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS source_changed boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS refresh_mode text NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS previous_cursor text;

CREATE TABLE IF NOT EXISTS osu_rmp.page_cursor (
    run_id      bigint NOT NULL REFERENCES osu_rmp.collection_run(id) ON DELETE CASCADE,
    scope       text NOT NULL CHECK (scope IN ('school', 'professor')),
    entity_id   bigint NOT NULL,
    cursor      text NOT NULL,
    PRIMARY KEY (run_id, scope, entity_id, cursor)
);

CREATE INDEX IF NOT EXISTS idx_rmp_review_active_professor
    ON osu_rmp.review (professor_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_rmp_review_professor_seen
    ON osu_rmp.review (professor_id, last_seen_run_id);
CREATE INDEX IF NOT EXISTS idx_rmp_professor_school_seen
    ON osu_rmp.professor_school (school_id, last_seen_run_id);

-- A prior completed snapshot can seed freshness without re-fetching 105k rows.
UPDATE osu_rmp.professor p
SET last_full_refresh_at = r.completed_at
FROM osu_rmp.collection_run r
WHERE p.last_full_refresh_at IS NULL
  AND r.id = p.last_seen_run_id
  AND r.status = 'completed'
  AND jsonb_typeof(p.ratings_distribution->'total') = 'number';

CREATE TABLE IF NOT EXISTS osu_rmp.collector_migration (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO osu_rmp.collector_migration (version)
VALUES ('rmp-collector-v1'), ('rmp-collector-v2') ON CONFLICT DO NOTHING;

COMMIT;

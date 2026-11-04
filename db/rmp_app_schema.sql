-- Additive application layer. Source RMP IDs and collector tables remain stable.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS osu_rmp.app_migration (
    version text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION osu_rmp.course_key(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT CASE WHEN normalized ~ '^[A-Z]{2,8}[0-9]{3,5}(\.[0-9]{1,3})?[A-Z]{0,2}$'
                THEN normalized ELSE NULL END
    FROM (SELECT regexp_replace(upper(coalesce(value, '')), '[[:space:]_-]', '', 'g') normalized) input
$$;

CREATE OR REPLACE FUNCTION osu_rmp.review_day(value text)
RETURNS date LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
BEGIN
    IF value IS NULL OR value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}($|[ T])' THEN RETURN NULL; END IF;
    RETURN substring(value FROM 1 FOR 10)::date;
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION osu_rmp.tag_array(value jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT coalesce(jsonb_agg(tag ORDER BY tag), '[]'::jsonb)
    FROM (
        SELECT DISTINCT trim(tag) tag
        FROM jsonb_array_elements_text(
            CASE jsonb_typeof(value)
            WHEN 'array' THEN value
            WHEN 'string' THEN to_jsonb(string_to_array(value #>> '{}', '--'))
            ELSE '[]'::jsonb END
        ) input(tag)
        WHERE trim(tag) <> ''
    ) tags
$$;

CREATE TABLE IF NOT EXISTS osu_rmp.instructor_identity (
    name_dot_number text PRIMARY KEY,
    display_name text NOT NULL,
    osu_email text NOT NULL,
    official_instructor_id bigint,
    names jsonb NOT NULL DEFAULT '[]'::jsonb,
    departments jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (name_dot_number ~ '^[a-z][a-z0-9_-]*\.[0-9]+$')
);

CREATE TABLE IF NOT EXISTS osu_rmp.instructor_course (
    name_dot_number text NOT NULL REFERENCES osu_rmp.instructor_identity(name_dot_number) ON DELETE CASCADE,
    source text NOT NULL CHECK (source IN ('official_evaluation', 'official_catalog')),
    source_record_key text NOT NULL,
    campus_code text NOT NULL,
    course_key text NOT NULL,
    subject text NOT NULL,
    catalog_number text NOT NULL,
    latest_term text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (name_dot_number, source, source_record_key)
);
CREATE INDEX IF NOT EXISTS idx_rmp_instructor_course_lookup
    ON osu_rmp.instructor_course (campus_code, course_key, name_dot_number);

CREATE TABLE IF NOT EXISTS osu_rmp.professor_identity_map (
    professor_id bigint NOT NULL REFERENCES osu_rmp.professor(legacy_id) ON DELETE CASCADE,
    name_dot_number text NOT NULL REFERENCES osu_rmp.instructor_identity(name_dot_number) ON DELETE CASCADE,
    state text NOT NULL CHECK (state IN ('accepted', 'candidate', 'rejected', 'stale')),
    method text NOT NULL CHECK (method IN ('evidence-v1', 'manual')),
    score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
    evidence jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (professor_id, name_dot_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rmp_map_one_accepted_professor
    ON osu_rmp.professor_identity_map (professor_id) WHERE state = 'accepted';
-- One OSU instructor can have separate RMP profiles at different campuses.
-- Keep the source profiles distinct instead of merging or rewriting source IDs.
CREATE INDEX IF NOT EXISTS idx_rmp_map_identity_accepted
    ON osu_rmp.professor_identity_map (name_dot_number, professor_id) WHERE state = 'accepted';

CREATE TABLE IF NOT EXISTS osu_rmp.mapping_decision_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    professor_id bigint NOT NULL,
    name_dot_number text NOT NULL,
    previous_state text,
    new_state text NOT NULL CHECK (new_state IN ('accepted', 'rejected', 'stale')),
    reason text NOT NULL,
    decided_by text NOT NULL DEFAULT current_user,
    decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rmp_map_decision_history
    ON osu_rmp.mapping_decision_log (professor_id, name_dot_number, decided_at DESC);

-- Legacy SQLite rows have no immutable rating ID. Keep them separate until the
-- regular collector observes a matching source review and reconciles provenance.
CREATE TABLE IF NOT EXISTS osu_rmp.legacy_supplement (
    kind text NOT NULL CHECK (kind IN ('professor', 'review')),
    source_key text NOT NULL,
    professor_id bigint NOT NULL,
    school_id bigint NOT NULL,
    payload jsonb NOT NULL,
    source_seen_at timestamptz,
    matched_review_id bigint REFERENCES osu_rmp.review(legacy_id) ON DELETE SET NULL,
    imported_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (kind, source_key)
);
CREATE INDEX IF NOT EXISTS idx_rmp_supplement_pending
    ON osu_rmp.legacy_supplement (professor_id) WHERE kind = 'review' AND matched_review_id IS NULL;

CREATE OR REPLACE VIEW osu_rmp.review_query AS
SELECT r.legacy_id, r.professor_id, r.date_text,
       osu_rmp.review_day(r.date_text) AS review_date,
       r.class_name,
       osu_rmp.course_key(r.class_name) AS course_key,
       r.comment, r.helpful_rating, r.clarity_rating, r.difficulty_rating,
       r.would_take_again, r.is_for_online_class, r.is_for_credit,
       r.attendance_mandatory, r.grade, r.textbook_use,
       osu_rmp.tag_array(r.rating_tags) AS rating_tags,
       r.thumbs_up_total, r.thumbs_down_total, r.teacher_note,
       r.updated_at
FROM osu_rmp.review r
JOIN osu_rmp.professor p ON p.legacy_id = r.professor_id
WHERE r.active AND p.active;

CREATE OR REPLACE VIEW osu_rmp.accepted_identity AS
SELECT m.professor_id AS rmp_professor_id,
       m.name_dot_number AS osu_username,
       i.display_name AS osu_display_name,
       i.osu_email,
       i.official_instructor_id,
       p.first_name AS rmp_first_name,
       p.last_name AS rmp_last_name,
       p.department AS rmp_department,
       p.avg_rating,
       p.avg_difficulty,
       p.num_ratings,
       p.would_take_again_percent,
       ps.school_ids AS rmp_school_ids,
       ps.campus_codes AS rmp_campuses,
       ps.campus_codes[1] AS campus_code,
       m.score,
       m.evidence
FROM osu_rmp.professor_identity_map m
JOIN osu_rmp.instructor_identity i ON i.name_dot_number = m.name_dot_number
JOIN osu_rmp.professor p ON p.legacy_id = m.professor_id AND p.active
LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT ps.school_id ORDER BY ps.school_id) AS school_ids,
           array_agg(DISTINCT s.campus_code ORDER BY s.campus_code) AS campus_codes
    FROM osu_rmp.professor_school ps
    JOIN osu_rmp.school s ON s.legacy_id = ps.school_id
    WHERE ps.professor_id = p.legacy_id
) ps ON true
WHERE m.state = 'accepted';

INSERT INTO osu_rmp.app_migration (version) VALUES ('rmp-app-v1') ON CONFLICT DO NOTHING;
COMMIT;

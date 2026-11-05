-- Rate My Professors data is kept apart from official OSU evaluations.
BEGIN;

CREATE SCHEMA IF NOT EXISTS osu_rmp;

CREATE TABLE IF NOT EXISTS osu_rmp.collection_run (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status                  text NOT NULL CHECK (status IN ('running', 'paused', 'completed')),
    metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_request_epoch      double precision,
    last_error              text,
    started_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    completed_at            timestamptz
);

CREATE TABLE IF NOT EXISTS osu_rmp.school (
    legacy_id               bigint PRIMARY KEY,
    graphql_id              text NOT NULL UNIQUE,
    campus_code             text NOT NULL,
    name                    text NOT NULL,
    city                    text,
    state                   text,
    search_result_count     integer,
    raw_payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS osu_rmp.professor (
    legacy_id               bigint PRIMARY KEY,
    graphql_id              text NOT NULL UNIQUE,
    first_name              text NOT NULL,
    last_name               text NOT NULL,
    department              text,
    department_id           text,
    avg_rating              numeric(4,2),
    avg_difficulty          numeric(4,2),
    would_take_again_percent numeric(5,2),
    num_ratings             integer NOT NULL DEFAULT 0,
    ratings_distribution    jsonb NOT NULL DEFAULT '{}'::jsonb,
    rating_tags             jsonb NOT NULL DEFAULT '[]'::jsonb,
    course_codes            jsonb NOT NULL DEFAULT '[]'::jsonb,
    lock_status             text,
    raw_payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_seen_run_id        bigint NOT NULL REFERENCES osu_rmp.collection_run(id),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rmp_professor_name
    ON osu_rmp.professor (last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_rmp_professor_department
    ON osu_rmp.professor (department);

CREATE TABLE IF NOT EXISTS osu_rmp.professor_school (
    professor_id            bigint NOT NULL REFERENCES osu_rmp.professor(legacy_id) ON DELETE CASCADE,
    school_id               bigint NOT NULL REFERENCES osu_rmp.school(legacy_id),
    first_seen_run_id       bigint NOT NULL REFERENCES osu_rmp.collection_run(id),
    last_seen_run_id        bigint NOT NULL REFERENCES osu_rmp.collection_run(id),
    PRIMARY KEY (professor_id, school_id)
);

CREATE TABLE IF NOT EXISTS osu_rmp.run_school (
    run_id                  bigint NOT NULL REFERENCES osu_rmp.collection_run(id) ON DELETE CASCADE,
    school_id               bigint NOT NULL REFERENCES osu_rmp.school(legacy_id),
    cursor                  text,
    page_count              integer NOT NULL DEFAULT 0,
    result_count            integer,
    complete                boolean NOT NULL DEFAULT false,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, school_id)
);

CREATE TABLE IF NOT EXISTS osu_rmp.run_professor (
    run_id                  bigint NOT NULL REFERENCES osu_rmp.collection_run(id) ON DELETE CASCADE,
    professor_id            bigint NOT NULL REFERENCES osu_rmp.professor(legacy_id) ON DELETE CASCADE,
    cursor                  text,
    reviews_loaded          integer NOT NULL DEFAULT 0,
    reviews_complete        boolean NOT NULL DEFAULT false,
    updated_at              timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (run_id, professor_id)
);

CREATE INDEX IF NOT EXISTS idx_rmp_run_professor_pending
    ON osu_rmp.run_professor (run_id, reviews_complete, professor_id);

CREATE TABLE IF NOT EXISTS osu_rmp.review (
    legacy_id               bigint PRIMARY KEY,
    graphql_id              text NOT NULL UNIQUE,
    professor_id            bigint NOT NULL REFERENCES osu_rmp.professor(legacy_id) ON DELETE CASCADE,
    date_text               text,
    class_name              text,
    comment                 text,
    helpful_rating          numeric(4,2),
    clarity_rating          numeric(4,2),
    difficulty_rating       numeric(4,2),
    rating_tags             jsonb NOT NULL DEFAULT '[]'::jsonb,
    attendance_mandatory    text,
    would_take_again        boolean,
    grade                   text,
    textbook_use            text,
    is_for_online_class     boolean,
    is_for_credit           boolean,
    created_by_user         boolean,
    flag_status             text,
    admin_reviewed_at       text,
    thumbs_up_total         integer NOT NULL DEFAULT 0,
    thumbs_down_total       integer NOT NULL DEFAULT 0,
    teacher_note            jsonb,
    raw_payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
    last_seen_run_id        bigint NOT NULL REFERENCES osu_rmp.collection_run(id),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rmp_review_professor_date
    ON osu_rmp.review (professor_id, date_text DESC);
CREATE INDEX IF NOT EXISTS idx_rmp_review_class
    ON osu_rmp.review (class_name);

COMMIT;

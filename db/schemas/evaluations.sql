-- OSU SEI / SSLE PostgreSQL schema v2
-- Designed from full profiling of 68,729 Blue evaluation rows.
-- PostgreSQL 15+; recommended PostgreSQL 17+.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA IF NOT EXISTS osu_eval;

CREATE TABLE IF NOT EXISTS osu_eval.source_dataset (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_code         text NOT NULL UNIQUE,
    name                text NOT NULL,
    provider            text NOT NULL DEFAULT 'Explorance Blue',
    base_url            text,
    block_id            text,
    datasource_id       text,
    metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS osu_eval.ingest_run (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_dataset_id       bigint NOT NULL REFERENCES osu_eval.source_dataset(id),
    file_name               text NOT NULL,
    file_sha256             char(64) NOT NULL,
    source_reported_rows    integer,
    rows_read               integer NOT NULL DEFAULT 0,
    rows_loaded             integer NOT NULL DEFAULT 0,
    status                  text NOT NULL CHECK (status IN ('running','completed','failed')),
    validation_summary      jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message           text,
    started_at              timestamptz NOT NULL DEFAULT now(),
    completed_at            timestamptz,
    UNIQUE (source_dataset_id, file_sha256)
);

CREATE INDEX IF NOT EXISTS idx_ingest_run_source_started
    ON osu_eval.ingest_run (source_dataset_id, started_at DESC);

CREATE TABLE IF NOT EXISTS osu_eval.raw_evaluation_row (
    run_id                  bigint NOT NULL REFERENCES osu_eval.ingest_run(id) ON DELETE CASCADE,
    row_number              integer NOT NULL,
    row_hash                char(64) NOT NULL,
    natural_key_hash        char(64) NOT NULL,
    term_label              varchar(8) NOT NULL,
    class_number            varchar(16) NOT NULL,
    instructor_name_dot     varchar(128) NOT NULL,
    subject_code            varchar(32) NOT NULL,
    catalog_raw             varchar(64) NOT NULL,
    payload                 jsonb NOT NULL,
    PRIMARY KEY (run_id, row_number),
    UNIQUE (run_id, natural_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_raw_evaluation_natural_key
    ON osu_eval.raw_evaluation_row (natural_key_hash);
CREATE INDEX IF NOT EXISTS idx_raw_evaluation_row_hash
    ON osu_eval.raw_evaluation_row (row_hash);
CREATE INDEX IF NOT EXISTS idx_raw_evaluation_lookup
    ON osu_eval.raw_evaluation_row (term_label, class_number, instructor_name_dot);
CREATE INDEX IF NOT EXISTS idx_raw_evaluation_payload_gin
    ON osu_eval.raw_evaluation_row USING gin (payload);

CREATE TABLE IF NOT EXISTS osu_eval.term (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    label               varchar(8) NOT NULL UNIQUE,
    season              char(2) NOT NULL CHECK (season IN ('SP','SU','AU')),
    calendar_year       smallint NOT NULL,
    sort_key            integer NOT NULL UNIQUE,
    osu_term_code       varchar(16) UNIQUE,
    CHECK (calendar_year BETWEEN 2000 AND 2199)
);

CREATE INDEX IF NOT EXISTS idx_term_year_season
    ON osu_eval.term (calendar_year, season);

CREATE TABLE IF NOT EXISTS osu_eval.subject (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                varchar(32) NOT NULL UNIQUE,
    display_name        text
);

CREATE TABLE IF NOT EXISTS osu_eval.course (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subject_id          bigint NOT NULL REFERENCES osu_eval.subject(id),
    catalog             varchar(64),
    catalog_raw         varchar(64) NOT NULL,
    course_key          text NOT NULL UNIQUE,
    catalog_unknown     boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK ((catalog_unknown AND catalog IS NULL) OR (NOT catalog_unknown AND catalog IS NOT NULL))
);

-- Known catalog identities must be unique within a subject.
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_subject_catalog_known
    ON osu_eval.course (subject_id, catalog)
    WHERE catalog IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_course_subject
    ON osu_eval.course (subject_id);
CREATE INDEX IF NOT EXISTS idx_course_catalog
    ON osu_eval.course (catalog);

CREATE TABLE IF NOT EXISTS osu_eval.instructor (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name_dot_number         varchar(128) NOT NULL UNIQUE,
    current_first_name      text NOT NULL,
    current_last_name       text NOT NULL,
    current_full_name       text GENERATED ALWAYS AS (current_first_name || ' ' || current_last_name) STORED,
    current_name_sort_key   integer NOT NULL,
    first_seen_run_id       bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    last_seen_run_id        bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instructor_last_name_trgm
    ON osu_eval.instructor USING gin (current_last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_instructor_full_name_trgm
    ON osu_eval.instructor USING gin (current_full_name gin_trgm_ops);

-- Preserve display-name history. Multiple variants in the same term are supported.
CREATE TABLE IF NOT EXISTS osu_eval.instructor_name_observation (
    instructor_id       bigint NOT NULL REFERENCES osu_eval.instructor(id) ON DELETE CASCADE,
    term_id             bigint NOT NULL REFERENCES osu_eval.term(id),
    first_name          text NOT NULL,
    last_name           text NOT NULL,
    first_seen_run_id   bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    last_seen_run_id    bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    PRIMARY KEY (instructor_id, term_id, first_name, last_name)
);

CREATE TABLE IF NOT EXISTS osu_eval.section (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    term_id                 bigint NOT NULL REFERENCES osu_eval.term(id),
    class_number            varchar(16) NOT NULL,
    course_id               bigint NOT NULL REFERENCES osu_eval.course(id),
    class_title             text NOT NULL,
    college                 text NOT NULL,
    department              text NOT NULL,
    delivery_mode           text NOT NULL,
    campus_code             varchar(16) NOT NULL,
    class_size_category     varchar(16) NOT NULL,
    first_seen_run_id       bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    last_seen_run_id        bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (term_id, class_number)
);

CREATE INDEX IF NOT EXISTS idx_section_course
    ON osu_eval.section (course_id);
CREATE INDEX IF NOT EXISTS idx_section_term
    ON osu_eval.section (term_id);
CREATE INDEX IF NOT EXISTS idx_section_campus
    ON osu_eval.section (campus_code);
CREATE INDEX IF NOT EXISTS idx_section_department
    ON osu_eval.section (department);
CREATE INDEX IF NOT EXISTS idx_section_title_trgm
    ON osu_eval.section USING gin (class_title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS osu_eval.evaluation (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    section_id              bigint NOT NULL REFERENCES osu_eval.section(id) ON DELETE CASCADE,
    instructor_id           bigint NOT NULL REFERENCES osu_eval.instructor(id),
    instrument              varchar(16) NOT NULL CHECK (instrument IN ('SEI','SSLE')),
    metric_kind             varchar(64) NOT NULL CHECK (
                                metric_kind IN ('sei_overall_item_10','ssle_mean_all_items')
                            ),
    n_responses             integer NOT NULL CHECK (n_responses >= 1),
    rating                  numeric(4,2) NOT NULL CHECK (rating BETWEEN 1.00 AND 5.00),
    standard_deviation      numeric(4,2),
    invited_count           integer NOT NULL CHECK (invited_count >= 1),
    response_ratio          numeric(5,2) NOT NULL CHECK (response_ratio BETWEEN 0.00 AND 100.00),
    source_row_hash         char(64) NOT NULL,
    first_seen_run_id       bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    last_seen_run_id        bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (section_id, instructor_id),
    CHECK (n_responses <= invited_count),
    CHECK (standard_deviation IS NULL OR standard_deviation BETWEEN 0.00 AND 3.00),
    CONSTRAINT evaluation_instrument_metric_kind_check CHECK (
        (instrument = 'SEI' AND metric_kind = 'sei_overall_item_10')
        OR (instrument = 'SSLE' AND metric_kind = 'ssle_mean_all_items')
    ),
    CHECK (
        abs(
            response_ratio
            - round((n_responses::numeric / invited_count::numeric) * 100.0, 2)
        ) <= 0.01
    )
);

-- `CREATE TABLE IF NOT EXISTS` leaves existing installations untouched. Add
-- the metric pairing constraint when this schema upgrades an earlier version.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'evaluation_instrument_metric_kind_check'
          AND conrelid = 'osu_eval.evaluation'::regclass
    ) THEN
        ALTER TABLE osu_eval.evaluation
        ADD CONSTRAINT evaluation_instrument_metric_kind_check CHECK (
            (instrument = 'SEI' AND metric_kind = 'sei_overall_item_10')
            OR (instrument = 'SSLE' AND metric_kind = 'ssle_mean_all_items')
        );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_evaluation_instructor
    ON osu_eval.evaluation (instructor_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_section
    ON osu_eval.evaluation (section_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_instrument
    ON osu_eval.evaluation (instrument);
CREATE INDEX IF NOT EXISTS idx_evaluation_rating
    ON osu_eval.evaluation (rating);

-- Tracks whether an evaluation is present in the latest snapshot of each source.
-- This permits overlapping future historical Blue datasets without losing lineage.
CREATE TABLE IF NOT EXISTS osu_eval.evaluation_source_state (
    evaluation_id           bigint NOT NULL REFERENCES osu_eval.evaluation(id) ON DELETE CASCADE,
    source_dataset_id       bigint NOT NULL REFERENCES osu_eval.source_dataset(id) ON DELETE CASCADE,
    first_seen_run_id       bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    last_seen_run_id        bigint NOT NULL REFERENCES osu_eval.ingest_run(id),
    last_row_hash           char(64) NOT NULL,
    active                  boolean NOT NULL DEFAULT true,
    PRIMARY KEY (evaluation_id, source_dataset_id)
);

CREATE INDEX IF NOT EXISTS idx_evaluation_source_state_active
    ON osu_eval.evaluation_source_state (source_dataset_id, active);
CREATE INDEX IF NOT EXISTS idx_evaluation_source_state_active_evaluation
    ON osu_eval.evaluation_source_state (evaluation_id)
    WHERE active;

CREATE OR REPLACE VIEW osu_eval.v_evaluation_detail AS
SELECT
    e.id AS evaluation_id,
    t.label AS term,
    t.sort_key AS term_sort_key,
    s.class_number,
    subj.code AS subject,
    c.id AS course_id,
    c.catalog,
    c.catalog_raw,
    c.course_key,
    s.class_title,
    s.college,
    s.department,
    s.delivery_mode,
    s.campus_code,
    s.class_size_category,
    i.id AS instructor_id,
    i.name_dot_number,
    i.current_first_name,
    i.current_last_name,
    e.instrument,
    e.metric_kind,
    e.n_responses,
    e.rating,
    e.standard_deviation,
    e.invited_count,
    e.response_ratio,
    EXISTS (
        SELECT 1
        FROM osu_eval.evaluation_source_state ess
        WHERE ess.evaluation_id = e.id
          AND ess.active
    ) AS active_in_any_source,
    e.first_seen_run_id,
    e.last_seen_run_id
FROM osu_eval.evaluation e
JOIN osu_eval.section s ON s.id = e.section_id
JOIN osu_eval.term t ON t.id = s.term_id
JOIN osu_eval.course c ON c.id = s.course_id
JOIN osu_eval.subject subj ON subj.id = c.subject_id
JOIN osu_eval.instructor i ON i.id = e.instructor_id;

DROP MATERIALIZED VIEW IF EXISTS osu_eval.mv_instructor_course_summary;
CREATE MATERIALIZED VIEW osu_eval.mv_instructor_course_summary AS
SELECT
    i.id AS instructor_id,
    i.name_dot_number,
    i.current_first_name,
    i.current_last_name,
    c.id AS course_id,
    subj.code AS subject,
    c.catalog,
    c.catalog_raw,
    e.instrument,
    count(*)::integer AS evaluation_count,
    count(DISTINCT e.section_id)::integer AS section_count,
    sum(e.n_responses)::bigint AS total_responses,
    sum(e.invited_count)::bigint AS total_invited,
    round(avg(e.rating), 4) AS mean_section_rating,
    round(
        sum(e.rating * e.n_responses)::numeric
        / nullif(sum(e.n_responses), 0),
        4
    ) AS response_weighted_rating,
    round(
        (sum(e.n_responses)::numeric / nullif(sum(e.invited_count), 0)) * 100.0,
        2
    ) AS pooled_response_rate,
    min(t.sort_key) AS first_term_sort_key,
    max(t.sort_key) AS last_term_sort_key
FROM osu_eval.evaluation e
JOIN osu_eval.section s ON s.id = e.section_id
JOIN osu_eval.term t ON t.id = s.term_id
JOIN osu_eval.course c ON c.id = s.course_id
JOIN osu_eval.subject subj ON subj.id = c.subject_id
JOIN osu_eval.instructor i ON i.id = e.instructor_id
WHERE EXISTS (
    SELECT 1
    FROM osu_eval.evaluation_source_state ess
    WHERE ess.evaluation_id = e.id
      AND ess.active
)
GROUP BY
    i.id, i.name_dot_number, i.current_first_name, i.current_last_name,
    c.id, subj.code, c.catalog, c.catalog_raw, e.instrument
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_instructor_course_summary
    ON osu_eval.mv_instructor_course_summary (instructor_id, course_id, instrument);

CREATE INDEX IF NOT EXISTS idx_mv_instructor_course_subject_catalog
    ON osu_eval.mv_instructor_course_summary (subject, catalog);
CREATE INDEX IF NOT EXISTS idx_mv_instructor_course_name
    ON osu_eval.mv_instructor_course_summary (current_last_name, current_first_name);

DROP MATERIALIZED VIEW IF EXISTS osu_eval.mv_instructor_summary;
CREATE MATERIALIZED VIEW osu_eval.mv_instructor_summary AS
SELECT
    i.id AS instructor_id,
    i.name_dot_number,
    i.current_first_name,
    i.current_last_name,
    e.instrument,
    count(*)::integer AS evaluation_count,
    count(DISTINCT e.section_id)::integer AS section_count,
    count(DISTINCT s.course_id)::integer AS course_count,
    sum(e.n_responses)::bigint AS total_responses,
    sum(e.invited_count)::bigint AS total_invited,
    round(avg(e.rating), 4) AS mean_section_rating,
    round(
        sum(e.rating * e.n_responses)::numeric
        / nullif(sum(e.n_responses), 0),
        4
    ) AS response_weighted_rating,
    round(
        (sum(e.n_responses)::numeric / nullif(sum(e.invited_count), 0)) * 100.0,
        2
    ) AS pooled_response_rate,
    min(t.sort_key) AS first_term_sort_key,
    max(t.sort_key) AS last_term_sort_key
FROM osu_eval.evaluation e
JOIN osu_eval.section s ON s.id = e.section_id
JOIN osu_eval.term t ON t.id = s.term_id
JOIN osu_eval.instructor i ON i.id = e.instructor_id
WHERE EXISTS (
    SELECT 1
    FROM osu_eval.evaluation_source_state ess
    WHERE ess.evaluation_id = e.id
      AND ess.active
)
GROUP BY
    i.id, i.name_dot_number, i.current_first_name, i.current_last_name,
    e.instrument
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_instructor_summary
    ON osu_eval.mv_instructor_summary (instructor_id, instrument);

COMMIT;

# OSU SEI/SSLE PostgreSQL import package

This package was designed against the complete 68,729-row export at
`data/raw/blue-sei-ssle-su22-su26/osu_sei_ssle_all.jsonl`.

## Files

- `db/schema.sql` — PostgreSQL schema
- `scripts/import_osu_sei_ssle_postgres.py` — validator + idempotent importer
- `data/raw/blue-sei-ssle-su22-su26/` — immutable source snapshot
- `data/derived/profile/` — profiling report and machine-readable summary

## Database choice

Use PostgreSQL. The current dataset is small enough for either PostgreSQL or MySQL, but the project benefits from PostgreSQL's JSONB raw snapshots, partial/GIN/trigram indexes, materialized views, and strong set-based analytics.

PostgreSQL 17 is a good default.

## 1. Validate the export again on your computer

No DB package is required:

```powershell
python scripts/import_osu_sei_ssle_postgres.py `
  --file .\data\raw\blue-sei-ssle-su22-su26\osu_sei_ssle_all.jsonl `
  --validate-only `
  --expected-rows 68729
```

Expected headline values:

```text
rows: 68729
sections: 62484
evaluation_natural_keys: 68729
instructors: 7108
course_keys: 8738
SEI: 50365
SSLE: 18364
```

## 2. Install PostgreSQL driver

```powershell
python -m pip install "psycopg[binary]>=3.2"
```

## 3. Create a PostgreSQL database

Example with Docker Desktop:

```powershell
docker run --name osu-postgres `
  -e POSTGRES_USER=osu_app `
  -e POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD `
  -e POSTGRES_DB=osu_data `
  -p 127.0.0.1:5432:5432 `
  -v osu_postgres_data:/var/lib/postgresql/data `
  -d postgres:17
```

Check it:

```powershell
docker ps
```

## 4. Initialize schema and import

From the repository root:

```powershell
python scripts/import_osu_sei_ssle_postgres.py `
  --file .\data\raw\blue-sei-ssle-su22-su26\osu_sei_ssle_all.jsonl `
  --schema .\db\schema.sql `
  --dsn "postgresql://osu_app:CHANGE_THIS_PASSWORD@localhost:5432/osu_data" `
  --init-schema `
  --expected-rows 68729
```

The importer performs a full validation pass before writing anything. For database imports, `--expected-rows` is required by default so a truncated scrape cannot be mistaken for a valid full snapshot and deactivate missing rows.

A successful first import creates:

- 68,729 raw snapshot rows
- 13 terms
- 248 subjects
- 8,738 current source course identities
- 62,484 sections
- 7,108 instructors
- 68,729 normalized evaluations
- instructor display-name history
- per-source active/inactive state
- materialized instructor/course summaries

## Idempotence

The source + file SHA-256 is unique. Running the same completed JSONL again does not duplicate data; the importer exits after identifying the already-completed run.

A newly collected snapshot receives a new ingest run and upserts current entities while retaining the old raw snapshot.

## Why raw + normalized?

`raw_evaluation_row` preserves exactly what Blue supplied in each run.

Normalized tables provide stable application entities:

```text
term
subject
course
section
instructor
instructor_name_observation
evaluation
```

This lets the system detect future source corrections and display-name changes without losing historical evidence.

## Source removal / rolling-window behavior

`evaluation_source_state` tracks whether a row is present in the latest snapshot of a datasource.

During a new import, only terms actually present in the incoming snapshot are considered when marking missing evaluations inactive. This is deliberate: if Blue later changes a rolling dataset from Summer 2022+ to Summer 2023+, Summer 2022 records are not deleted merely because they fell outside the new window.

Materialized public summaries only include evaluations active in at least one source state.

## SEI vs SSLE

The importer derives the instrument from term chronology:

- through Summer 2025 → `SEI`, metric `sei_overall_item_10`
- Autumn 2025 onward → `SSLE`, metric `ssle_mean_all_items`

Do not merge the two measures into a single unlabeled "overall rating" statistic.

## Useful queries

### MATH 1151 instructor/course summaries

```sql
SELECT *
FROM osu_eval.mv_instructor_course_summary
WHERE subject = 'MATH'
  AND catalog = '1151'
ORDER BY instrument, response_weighted_rating DESC NULLS LAST;
```

### Mansfield evaluations

```sql
SELECT *
FROM osu_eval.v_evaluation_detail
WHERE campus_code = 'MNS'
  AND active_in_any_source
ORDER BY term_sort_key DESC, subject, catalog, class_number;
```

### One instructor's term history

```sql
SELECT
    term,
    subject,
    catalog,
    class_number,
    instrument,
    rating,
    n_responses,
    invited_count,
    response_ratio
FROM osu_eval.v_evaluation_detail
WHERE name_dot_number = 'example.123'
  AND active_in_any_source
ORDER BY term_sort_key;
```

### Name history

```sql
SELECT
    i.name_dot_number,
    t.label,
    o.first_name,
    o.last_name
FROM osu_eval.instructor_name_observation o
JOIN osu_eval.instructor i ON i.id = o.instructor_id
JOIN osu_eval.term t ON t.id = o.term_id
WHERE i.name_dot_number = 'example.123'
ORDER BY t.sort_key;
```

## Before production

Recommended next integrations:

1. OSU Schedule API → canonical term codes, meeting times, section metadata
2. OSU course catalog → course title/description/credits/prerequisites
3. older SEI datasets → separate `source_dataset` records, same normalized model
4. API layer → FastAPI/Java/Node backend
5. scheduled collector → create a new JSONL snapshot, validate, import

Do not expose the Blue opaque `userid` token in a public repository. The database only needs datasource/block metadata; the import package intentionally does not embed that token.

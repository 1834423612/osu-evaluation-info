# OSU SEI / SSLE database notes

## Recommended database: PostgreSQL

Use PostgreSQL as the system of record. The current public table is only ~68k rows, so capacity is not the deciding factor. PostgreSQL is preferable because this project benefits from JSONB raw snapshots, strong constraints, partial indexes, `pg_trgm` fuzzy search, materialized views, window/aggregate analytics, and reliable `INSERT ... ON CONFLICT` upserts.

MySQL 8 would work, especially if the surrounding application is already standardized on MySQL, but it offers no meaningful advantage for this dataset. Migrating later becomes annoying once raw JSON snapshots, analytics views, and fuzzy instructor/course search are built around the database.

## Two-layer ingest design

1. **Raw/immutable layer**: save exactly what Blue returned for every collection run (`ingest_run` + `raw_evaluation_row`). Keep a SHA-256 row hash and page/row position.
2. **Normalized/latest layer**: upsert `term`, `course`, `instructor`, `section`, and `evaluation` from the raw snapshot.

Never delete or overwrite old raw runs merely because the public page changed. A later correction by OSU should be visible as a changed row hash and a new `last_seen_at`/source run.

## Natural identities

- Course: `(SUBJECT, Catalog)` when Catalog is known. A source value of
  `Catalog = N/A` uses a title-qualified identity
  `(SUBJECT, <UNKNOWN_CATALOG>, Class)` so unrelated unknown-catalog courses
  are never merged.
- Section: `(Term, Class Number)`
- Instructor: prefer `Namen` (`name.#`); if blank, use a deterministic fallback key based on the supplied names and flag it for review.
- Evaluation: `(section, instructor, instrument)`

Do **not** deduplicate solely on `Class Number`: multiple instructors can legitimately share one class section.

## SEI vs SSLE

Do not expose a single undifferentiated historical "rating" in analytics.

- before AU 2025 in this public block: `SEI`, metric = overall-rating question (Question 10)
- AU 2025 onward: `SSLE`, metric = mean across SSLE questions

Both are 1-5 values, but they are different measurements. Aggregate and rank them separately by default.

## Validation checks per collection run

- server `Total Items` equals rows fetched
- expected 18 columns are present
- `(Term, Class Number, instructor)` duplicate count is reported, not automatically deleted
- rating is null or 1..5
- response ratio is null or 0..100
- when counts are available, `N of Responses / InvitedCount * 100` should approximately match `ResponseRatio` (allow rounding)
- `Standard Deviation = N/A` becomes SQL `NULL`, never zero
- keep `Class Size Category` exactly as supplied; do not derive it from invited count

## Collection cadence

A complete snapshot is cheap enough to re-download. Prefer a full snapshot after each term's reports are released, plus occasional verification runs. Four workers and page size 100 are conservative defaults. If the source starts returning 429/5xx responses, reduce concurrency rather than retrying aggressively.

## Future joins

Keep separate source adapters for:

- Blue SEI/SSLE public results
- OSU class schedule / section data
- OSU course catalog descriptions and prerequisites
- instructor directory/department metadata, only where publicly available and appropriate

Normalize them into common course/term/section/instructor identities rather than making the Blue table itself the canonical course catalog.

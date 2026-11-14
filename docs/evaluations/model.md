# OSU SEI / SSLE database notes

English · [简体中文](../zh-CN/evaluations/model.md)

## Cross-source identity and refresh architecture

The PostgreSQL database is organized by source ownership rather than by one
wide merged instructor/course table:

- `osu_eval` stores immutable Explorance Blue imports and normalized
  SEI/SSLE course, section, instructor, and evaluation rows.
- `osu_catalog` stores the most recently completed OSU course-catalog snapshot
  while retaining run metadata and raw course/section JSON.
- `osu_rmp` stores the source's own profile/review identities, normalized
  official OSU username identities, official course facts, and reviewed
  profile-to-OSU mapping decisions.

`osu_rmp.department_alias` stores reviewed equivalents between source department
labels, with an official evidence URL. This handles abbreviations such as
Computer Science versus Computer Science & Engineering without fuzzy identity
joins. Aliases never replace the exact name, campus, course, and uniqueness
requirements. Uniqueness compares candidates with all required signals; an
unrelated person who only shares a name does not invalidate a complete match.

The stable join keys are the official OSU `name_dot_number` identity and exact
`(subject, catalog, campus)` course identity. `osu_rmp.instructor_course`
records which official feed supplied each course fact and its source record
key; a future catalog or evaluation feed can add its own fact without
rewriting either source's raw rows. `osu_rmp.professor_identity_map` keeps RMP
profile IDs separate and records accepted, candidate, rejected, or stale
links with the evidence and decision history. Raw review IDs and raw course
codes remain source-owned.

Names are useful evidence, never identity keys. The mapping refresh collects
historical official display-name variants so spelling changes can generate
reviewable exact-name candidates. Automatic acceptance still requires exact
normalized name, matching campus, a department match, an overlapping course,
and unique candidate evidence. A display-name-only match is never enough to
attach another person's ratings to a teacher. `exact-email` and `no-data` are separate
states: the first identifies the official teacher; the second says this exact
course has no historical evaluation records.

### Incremental refresh and recovery

1. Import each official SEI/SSLE release into its source-specific raw run, then
   update only normalized rows whose source hash or values changed.
2. Complete a catalog snapshot into `osu_catalog`; the mapper reads the newest
   completed term snapshots and holds out in-progress terms.
3. Run `sync_rmp_mappings.py --dry-run` to review source windows and candidate
   counts. This is read-only and requires the additive RMP schema to be
   installed already.
4. Run the normal mapping refresh. It takes a PostgreSQL advisory lock,
   upserts source facts in a transaction, keeps manual decisions, and records
   an immutable candidate/evidence snapshot in `mapping_refresh` and
   `mapping_refresh_item`. A SHA-256 digest deduplicates identical evidence
   snapshots. Interrupted transactions roll
   back; repeating the run is idempotent.
5. Collect RMP source profiles/reviews separately. Application queries join
   only accepted mappings and exact course keys; they never mutate either raw
   source during display.

If a mapping refresh needs to be undone, mark the affected automatic mapping
stale or restore reviewed decisions from the retained refresh snapshot; do not delete raw
imports or rewrite source IDs. Manual decisions are restored from
`mapping_decision_log`. For schema rollback, stop the mapper/application first,
retain the additive source/mapping tables for audit, and disable their readers;
do not drop data as part of an application rollback. The existing migration is
additive, idempotent, bounded by a two-second lock timeout, and creates the
large review lookup index concurrently.

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

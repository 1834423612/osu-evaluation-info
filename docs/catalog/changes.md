# Course update history

English · [简体中文](../zh-CN/catalog/changes.md)

`/updates`, in the Courses menu, lists observed additions, returns, changes and records no longer present in a complete OSU class catalog. It filters by term, campus, code/title, type and 7/30/90-day window. Counts are change records, not unique courses or students. Course links require that exact offering to remain in the latest complete term snapshot; otherwise the record shows retained-history status. Links preserve the term and campus.

## Meaning and coverage

A new offering means that a course/offering/campus key appeared after the previous complete snapshot of the same term. It does not prove that OSU first created that course. A reappearing key is labelled separately. The first complete snapshot of each term is a baseline, with no fabricated mass-addition event. A term disappearing from discovery produces no mass-removal events.

Times are snapshot detection/publication times, displayed in the browser timezone with a zone label. OSU `effectiveDate` is not treated as an addition or announcement timestamp. Formal proposals, approvals and withdrawals are separate [registrar circulating forms](https://registrar.osu.edu/staff-resources/class-catalog-and-space/circulating-forms-archive/); the page links to that official archive.

Comparison covers code, title, normalized description, credits, academic career, grading, attributes, sections/status, teachers, schedule, location and delivery. Seats, enrollment/waitlist counts, capacities, internal parent IDs and fetch/effective times do not generate events. Teacher/meeting/attribute order and duplicate entries are normalized. Adding a section does not also pretend that every shared section's teacher or timetable changed.

## Install and replay

```sh
pnpm catalog:migrate
node scripts/catalog/backfill_changes.mjs --max-batches 12
```

Migration 5 adds append-only `change_batches` and `course_changes`, indexes and comparison functions. It does not change source snapshots. The replay uses existing complete published snapshots only, makes no OSU requests, takes the catalog maintenance lock and commits one term batch at a time. Default budget is 12; explicit budgets are bounded to 1–200. Rerunning skips completed batches, so interruption and retry are safe.

Normal catalog publication remains atomic. Derived history is indexed afterward in separate bounded transactions; failure is deferred without invalidating the published catalog. The scheduled catalog workflow also completes up to 12 pending batches after its normal maintenance. No runtime/scheduled DDL is introduced. Migrate before deploying code that requires schema version 5.

The initial 2026-11-13 replay covered 12 retained complete runs / 36 term batches and produced 310 records: 13 additions, 292 changes and 5 no-longer-listed entries. These describe the observed archive interval, not university-wide course creation or current live counts.

## Serving and pagination

`GET /api/catalog/changes` accepts `term`, `campus`, `q`, `kind`, `days` and `cursor`. It returns at most 24 entries plus counts, source/coverage status and the next cursor. A read-only repeatable-read transaction keeps rows and counts consistent. The cache coalesces identical loads and caps at 32 pages / 4 MiB / 60 seconds, with 32 distinct pending keys; overload returns 429 with Retry-After. User visits read the indexed change table, never compare all snapshots or call OSU.

Keyset pagination pins filters, the initial event-ID horizon and the time window. Timestamps retain all six database fractional digits; truncating them to JavaScript milliseconds would skip entries from the same sync. Later writes cannot insert duplicate rows into an ongoing page sequence. Archived terms, missing comparisons and pending history each have distinct states; a service failure is not an empty result.

## Verification

```sh
node --test tests/catalog/changes.test.mjs
CATALOG_DATABASE_TEST=1 node --env-file-if-exists=.env.local --test tests/catalog/changes.integration.test.mjs
node tests/catalog/changes.browser.mjs
```

The integration test uses a disposable schema and covers baseline terms, separate campuses, edits, additions, returns, missing terms, volatile noise, idempotence, unpublished rejection and append-only protection. Browser checks cover bilingual 320/390/768/1440px layouts, forms, destinations, zones and empty/error states. Set `CATALOG_CHANGES_REAL_TEST=1` for read-only API pagination over the configured database. Browser settings are `CHANGES_TEST_BASE_URL`, `CHANGES_TEST_OUTPUT`, `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

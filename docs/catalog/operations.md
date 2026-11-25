# Catalog operations

English · [简体中文](../zh-CN/catalog/operations.md)

Run commands from the repository root. Database credentials come from `DATABASE_URL` or `.env.local`.

## Explicit schema migrations

```sh
pnpm catalog:migrate
pnpm catalog:sync
```

Migrations are a separate maintenance command. Recurring synchronization checks the installed schema version and never runs `CREATE`, `ALTER`, or index DDL. Provision a new database with the migration command before starting synchronization.

All catalog maintenance commands use the same PostgreSQL advisory lock, so a local command and a scheduled job cannot both write concurrently. The writer uses connection-local `lock_timeout=2s`, `statement_timeout=30s`, and `idle_in_transaction_session_timeout=30s`; global database settings are unchanged.

The synchronizer sorts courses and sections by their stable database keys, prepares JSON outside transactions, and commits one upstream page with its checkpoint. Deadlock (`40P01`), serialization (`40001`), and lock-timeout (`55P03`) failures roll back and retry the whole transaction at most three times with exponential backoff and jitter. Other errors stop the run; connection failures with an uncertain commit outcome are not blindly replayed.

## Immutable snapshot publication

Migration 2 adds `course_snapshots`, `section_snapshots`, and `snapshot_versions`. It bootstraps only intact completed legacy snapshots; original tables stay unchanged for rollback compatibility. New sync runs write rows keyed by their run ID. Coverage validation, the completed status, and the publication timestamp commit atomically. Running and failed generations never hide a previous publication.

Mirror pagination pins a published run ID, so publishing a new version does not invalidate existing cursors. RMP identity mapping also reads published generations. Resume only selects unpublished runs created by the versioned synchronizer; old in-place checkpoints are never resumed into the new storage. Schema version 3 adds permanent archive protection; run `pnpm catalog:migrate` before synchronization.

Discovery builds one complete plan in memory before writing any run or partition. Resume compares every canonical query key and its individual expected hit count, including additions, removals, and equal-total redistributions. Checkpoints older than six hours, known invalid builds, and staging rows with broken identities are replaced. Retiring a checkpoint, creating its replacement, and inserting the full plan commit together. A discovery failure leaves the saved run untouched.

Course offering and campus identities come from each official section (falling back to the course only when absent), so a course group containing several offerings/campuses creates the matching parents. Missing or malformed required identities, wrong term/subject results, conflicting duplicate class identities, and conflicting static JSON are rejected. Both course and section JSON exclude volatile enrollment fields. Page writes verify their checkpoint has not advanced and roll back entirely on any disagreement. Identical official duplicate hits are counted but stored once.

An official parent can disagree with the subject/catalog of its current section. A narrow reconciliation requires the selected subject facet title to match both section subject labels, explicit matching course IDs, a valid term/offering/parent key and agreeing section catalog fields. The parent retains its original identity in `officialParentIdentity`; unresolved disagreements still fail. See [the dated source/archive comparison](source-audit-2026-11-25.md) and [read-only reproduction commands](scheduled-sync.md#diagnose-a-failed-run).

Each page must still match the planned official count. Before publication the entire plan is rediscovered and compared again; SQL then verifies complete per-partition coverage, valid identities, term membership, and the complete course/section relationship including campus, subject, and catalog number. A moving official index triggers at most one fresh rebuild in the same invocation. Persistent drift or invalid data fails visibly while the previous publication stays readable. HTTP transport errors, 408, 429, and 5xx responses retry up to five times; permanent HTTP failures and invalid envelopes stop immediately. Retry-After is bounded at 30 seconds. Requests have a 30-second timeout and the invocation has a 20-minute request budget, leaving maintenance time within the 30-minute workflow. Signals and between-page budget checks defer publication and preserve checkpoints.

The official API provides no snapshot token. Count and plan validation cannot detect every upstream edit that preserves all counts or a stable omission/duplicate swap. Such data is still official, but publication does not claim a transactionally consistent upstream export. Stronger guarantees require an upstream version token or independently enumerable section manifest.

An actual database integration test uses a unique, disposable schema:

```sh
CATALOG_DATABASE_TEST=1 node --test tests/catalog/snapshots.integration.test.mjs
```

The tests bootstrap legacy data, hold a concurrent read transaction through publication, check old cursors, exercise real CLI recovery, reject conflicting/invalid pages, test initialization rollback, and drop all fixture tables. To include CLI and pure validation tests:

```sh
CATALOG_DATABASE_TEST=1 node --test tests/catalog/*.test.mjs
```

A separate explicit opt-in runs every currently searchable term against the real upstream API and PostgreSQL, using a random disposable schema. It never writes business tables. It can take several minutes; logs are written under `/tmp/osu-catalog-live-verification.log`.

```sh
CATALOG_LIVE_TEST=1 node --test tests/catalog/live-sync.integration.test.mjs
```

## Permanent retention

Every saved generation is retained indefinitely. Official term removal, individual course/section removal, and later edits do not delete earlier copies. New publications select the current view while old pinned generations remain readable. `pnpm catalog:prune` is a compatibility no-op, even when called with old retention options; scheduled workflows no longer call it.

Migration 3 prevents retiring/removing version markers, modifying/deleting completed course or section rows, and truncating archive tables. This database protection also blocks the old cleanup executable. Running checkpoints can still be completed normally. Syllabus migration 3 separately protects documents, observations and persistent indexes; repeated checks can update `checked_at`, and later document changes append new versions. There is no automatic expiry. Storage grows with archived observations; previously pruned versions cannot be recovered by this change. Database backups remain necessary for disk failure or administrator-level schema removal.

## Scheduled automation

The GitHub workflow accepts only `schedule`, with an additional job guard for `github.event_name == 'schedule'`. Pushes, pull requests, manual dispatch, reusable-workflow calls, and repository dispatch do not trigger it. It runs at 00:17, 04:17, 08:17, 12:17, 16:17, and 20:17 in `America/New_York`; GitHub may delay scheduled starts. Synchronization runs first, followed by RMP evidence refresh, with no history cleanup. Database credentials are scoped to the steps that use them. The sync step preserves its exit status through `tee`; the summary reports each maintenance outcome and captured log separately. An advisory-lock conflict is a safe skip. Deliberate page limits or the internal budget may leave a checkpoint without publication; inspect the log to distinguish this from a completed refresh. Schema migrations never run in the scheduled job. The database referenced by the Actions `DATABASE_URL` secret must have been explicitly migrated before the schedule is enabled.

The public repository uses shell steps instead of external Actions to comply with its owner-only Actions policy. Checkout fetches and verifies the exact scheduled commit. Runtime setup selects cached Node 24 (the runner's default may be Node 22), with a checksum-verified official Node 24.18.1 download as a fallback, and installs the exact pnpm version declared in `package.json` (currently 12.18.0). No repository Actions policy changes are required. An unauthenticated checkout is sufficient for this public repository; a future private repository would need authenticated checkout.

On November 6, 2026, [run 42284068119](https://github.com/1834423612/osu-evaluation-info/actions/runs/42284068119) failed before creating any jobs because the policy rejected `actions/checkout`, `actions/setup-node`, and `pnpm/action-setup`. An [earlier run](https://github.com/1834423612/osu-evaluation-info/actions/runs/41760312909) reached synchronization but reported `DATABASE_URL is required`. The workflow now checks for an empty secret before checkout or installation, without logging credentials. Configure the repository-level `DATABASE_URL` under Settings → Secrets and variables → Actions; an environment-scoped secret is unavailable unless the job declares that environment. This check confirms presence; synchronization still verifies database connectivity and schema compatibility.

## Coverage guard and recovery

Install migration 7 with `pnpm catalog:migrate` before using the updated synchronizer. A SQL publication trigger also protects older sync executables. Each candidate is compared with the last accepted publication of its term. Publication rejects a missing term/campus, a loss exceeding 20% and at least 20 sections at term/campus level, or a loss exceeding 50% and at least 10 sections within a campus/subject. Small changes and new terms remain publishable. Large intentional removals require operator investigation; scheduled jobs have no bypass.

An upstream response can be internally consistent while missing much of its catalog. On November 22, 2026, Spring 2027 Columbus coverage fell from 25,524 to 10,931 sections and Mansfield disappeared. The previous complete archive restored search. Counts and integrity hashes alone cannot distinguish this source outage from real deletions.

Investigate a suspect current publication before applying recovery. Replace `RUN_UUID` with its exact run ID:

```sh
node scripts/catalog/recover_snapshot.mjs --run RUN_UUID
node scripts/catalog/recover_snapshot.mjs --run RUN_UUID --apply --backup .cache/catalog-quarantine.json
pnpm search:prepare
```

The first command only reports a plan. Apply requires a detected regression, a prior publication for every term, and the target still being every term's current head. It takes the maintenance lock and writes an exclusive metadata backup with mode 0600 before transactionally marking the bad run failed. Source rows, publication markers, indexes and change history are retained. Published source records remain immutable after quarantine. Accepted readers and the change feed exclude quarantined runs; old cursors into one must restart. Keep full database backups separately: immutable history and a metadata recovery file do not protect against database loss.

Search maintenance prepares both the latest and previous accepted indexes per term, repairing missing artifacts before visitors need them. Quarantined artifacts do not consume accepted retention slots; retention ranks by publication time. Requests first restore a checked prepared artifact, then may try the same immutable source within budget. If the generation cannot load, an unpinned search tries at most two older accepted publications of the same term. A shared 28-second deadline covers metadata, connection waits, build queues and details, with up to 6 seconds per generation read. Pagination never silently switches versions. Responses retain the actual snapshot time. Search CDN caching is 30 seconds plus a 60-second stale revalidation window. These fallbacks require the database to be reachable; there is no separate replicated database or third-party index.

Null placeholders in term discovery are counted and ignored. Other malformed term/facet entries fail as classified data errors before ingestion. JSON diagnostics include retry number, endpoint, HTTP status, bounded term/campus/subject/page scope, publication differences and fallback run IDs. Query text, source response bodies and database credentials are omitted. Final errors name the failed stage and redact connection credentials.

The workflow summary reports catalog, RMP mapping, history, indexes and calendar outcomes separately, with the last 40 lines of each captured maintenance log, bounded to 1,000 characters per line. Structured failures also show operation, source request, JSON field, expected/actual values, record IDs and validator file/line. Verified parent/section differences have a separate table. Index repair still checks accepted publications when catalog sync fails. Change-history budget/statement timeouts roll back the unfinished term and report deferred work; unexpected failures still fail the job. Piped logs preserve exit codes.

## Enrollment freshness in the browser

Only the official per-section `/classes/availability` endpoint supplies counts;
`/classes/search` enrollment fields are placeholders. List entries query gradually
as they become visible, and normal details query each section once on open. A
successful result remains visible while idle. A failed refresh retains and labels
the last verified read. Counts are not stored in favorites or database snapshots.

Seat Watch requires selected sections and an explicit start. Choices persist per
course/term/campus, but running state does not survive a reload. More than eight
selected sections requires confirmation. Each completed round waits at least the
configured interval or one second per selected section (minimum ten seconds).
Details pause other courses' unfinished list queries. Hidden tabs cancel the watch
round, then resume on visibility restoration. Cancelling a subscriber cannot cancel
another subscriber's shared read; obsolete responses are ignored.

Browser seat admission is bounded to two concurrent requests, one start per 500 ms
and 80 queued jobs. Metadata admission is bounded to two concurrent requests, one
start per 250 ms and 48 queued jobs. A 429 backs off the affected browser queue.
Existing catalog endpoints serve cacheable endpoint discovery; after discovery,
all live catalog/seat traffic goes straight from the browser to OSU. This backend
keeps cached evaluation/directory access and explicit database-only backup reads.
No proxy retry is used when a direct request fails. See
[the API contract](api.md#discovery-and-browser-transport).

## Sync lifecycle

See [retention and recovery](lifecycle.md) for term archives, current-catalog changes and saved-course recovery. Run `pnpm catalog:migrate` after upgrading to install version 4 term heads and official discovery observations.

## Course update history

Catalog migration 5 adds append-only change history. After publication, comparisons run per term and may be retried independently; a failed comparison cannot invalidate the complete catalog. See [course updates](changes.md) for backfill budgets, API bounds and detection-time semantics.

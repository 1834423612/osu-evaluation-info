# Catalog operations

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

Mirror pagination pins a published run ID, so publishing a new version does not invalidate existing cursors. RMP identity mapping also reads published generations. Resume only selects unpublished runs created by the versioned synchronizer; old in-place checkpoints are never resumed into the new storage.

An actual database integration test uses a unique, disposable schema:

```sh
CATALOG_DATABASE_TEST=1 node --test tests/catalog/snapshots.integration.test.mjs
```

The test bootstraps legacy data, holds a concurrent read transaction through publication, checks old cursors, rejects incomplete publication, and drops all fixture tables.

## Bounded retention

`pnpm catalog:prune` uses the same advisory lock and timeouts as synchronization. It preserves at least the latest three published generations for every term and all generations published less than 24 hours ago. One eligible old generation is unpublished, then reclaimed in 500-row transactions with pauses and a 60-second budget. An interrupted cleanup resumes in a later invocation; current generations, original legacy tables, and sync-run audit records are preserved. Pruning never touches an unpublished running or failed build. Review abandoned failed builds separately instead of deleting resumable checkpoints automatically.

## Scheduled automation

The GitHub workflow accepts only `schedule`, with an additional job guard for `github.event_name == 'schedule'`. Pushes, pull requests, manual dispatch, reusable-workflow calls, and repository dispatch do not trigger it. It runs at 00:17, 04:17, 08:17, 12:17, 16:17, and 20:17 in `America/New_York`; GitHub may delay scheduled starts. Synchronization runs first, followed by bounded retention only on success. Schema migrations never run in the scheduled job. The database referenced by the Actions `DATABASE_URL` secret must have been explicitly migrated before the schedule is enabled.

## Enrollment freshness in the browser

Opening or reopening details performs a new official read. Visible section details refresh every 30 seconds and on window focus or visibility restoration. Hidden/closed details cancel their request and stop background polling. Only one read can be in flight, and cancelled/late responses cannot restore older enrollment values. A failed read clears availability immediately; values also expire after 30 seconds even if a refresh hangs. Lists and favorites hide expired/archived availability. The shared freshness clock only rerenders a card when freshness changes. Users can refresh manually and see the last official fetch time.

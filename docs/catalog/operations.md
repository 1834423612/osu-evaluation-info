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

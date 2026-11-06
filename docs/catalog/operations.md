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

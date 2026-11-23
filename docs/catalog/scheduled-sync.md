# Scheduled source synchronization

English · [简体中文](../zh-CN/catalog/scheduled-sync.md)

All three jobs use the existing `DATABASE_URL` Actions secret. Migrate the catalog, syllabus and RMP schemas before scheduled runs. Schedules use America/New_York; GitHub can delay their start.

| Job            | Schedule                | Source work per run                                                                        | Job limit  |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------ | ---------- |
| Course catalog | Every four hours at :17 | Resumable catalog pages; change-history backfill gets 120 seconds, at most 12 term batches | 30 minutes |
| Syllabi        | Daily at 03:43          | At most 1,500 seconds or 1,800 document checks, whichever comes first                      | 30 minutes |
| RMP            | Saturday at 03:30       | At most 1,200 seconds or 120 source requests; at least 10 seconds between requests         | 30 minutes |

These are work ceilings, not expected durations or freshness guarantees. Setup, database commits and reconciliation also take time. Request/runtime exhaustion is a normal checkpointed pause; source, protocol and database errors still fail visibly. Do not lower source pacing to spend the budget faster.

## Course catalog

A complete verified term snapshot is published before update-history maintenance. History comparisons process 200 course identities per statement instead of expanding an entire term in one SQL statement. Each term's events and completion marker commit in one transaction; an interrupted comparison leaves neither partial events nor a false completion marker. Budgeted backfill resumes the oldest pending term.

The catalog workflow remains schedule-only. A bounded maintenance retry is available locally:

```sh
node scripts/catalog/backfill_changes.mjs --max-batches 1 --max-seconds 60
```

This writes pending change history; it does not refetch or delete course snapshots. See [retention and term lifecycle](lifecycle.md) for source removals, current heads and archived terms.

### Diagnose a failed run

Open the run's **Summarize catalog maintenance** output. Its summary lists configuration, checkout, runtime, dependencies, catalog, RMP evidence, change history, search indexes and calendar outcomes separately, with a link to the complete step logs. Expand a stage for its last 40 captured lines, bounded to 1,000 characters per line. Setup failures have a fallback summary when the Node reporter cannot start. Captured summaries redact database URLs, credentials and token fields and keep log content separate from workflow commands and Markdown.

Structured catalog failures retain their stage and error code. GitHub error annotations surface the reason directly. A `CATALOG_COVERAGE_REGRESSION` rejection also produces a term/campus/subject table comparing accepted and candidate section counts, plus the total number of affected comparisons. This rejection deliberately leaves the run failed: incomplete official data must not be published or disguised as a successful refresh. The last accepted catalog and its accepted indexes remain available. When dependencies were installed and the run was not cancelled, search-index repair and academic-calendar refresh still run independently; inspect their own outcomes rather than inferring them from the catalog failure.

## Syllabus refresh

Migration 5 adds `osu_syllabus.document_checks`, separate from permanent index observations and document versions. It records the last conclusive network check and the exact index metadata checked. Cache reuse never advances that timestamp; transient failures never count as successful checks.

The scheduled job refreshes the official index first. It then prioritizes documents never checked, newer terms and the oldest checks. An unfinished index resumes its page checkpoint. Once an index is complete, the next invocation starts a fresh index and uses the shared document checkpoints, so a document backlog cannot freeze course discovery.

Scheduled freshness intervals are 168 hours for readable active-term documents, 720 hours for ended terms and 72 hours for missing/restricted documents. Changed index metadata bypasses reuse. The closing week limits readable-document reuse to 24 hours; readable documents in a still-available term are checked again after term end. Date-only end dates receive a 36-hour grace period. Unavailable terms retain their last complete archive.

The official index does not expose document modification times. Silent body edits therefore require rotating network checks; they are not guaranteed to appear in the background immediately. Opening a syllabus still checks the official source through the existing direct/relay flow.

```sh
pnpm syllabus:migrate
pnpm syllabus:sync --max-runtime-seconds 240 --max-documents 5 --refresh-hours 168 --archive-refresh-hours 720 --missing-refresh-hours 72
```

Without explicit flags, local sync has no runtime/document ceiling and uses 24-hour active and missing-document intervals, with 720 hours for ended terms. A zero refresh interval forces a network check for that class. See [syllabus operations](../syllabus/operations.md) for remaining flags and document states.

## RMP collection

The collector resumes saved cursors and pending review pages. Profiles whose source signature changes remain eligible immediately; otherwise full review refresh uses a 30-day interval. Page writes are pipelined to reduce database round trips, then flushed before completeness checks and cursor commits. A failed page cannot advance its cursor or finalize review removal.

The runtime clock is monotonic. Pacing, retry waits and HTTP timeouts obey the remaining budget. A cooldown that cannot fit pauses collection; it does not shorten the source's wait. Normal budget exhaustion still permits the mapping step to run against the source rows already saved.

Manual Actions runs default to two requests and accept 1–120. Use that small budget to validate configuration before a normal scheduled run. Source identity/course reconciliation does not invent confirmed faculty bindings or discard unconfirmed profiles.

## Observed verification

On November 15, 2026, a two-request RMP Actions run completed collection and reconciliation in about three minutes. A bounded syllabus run reused all 7,851 current index checks and fetched no document bodies. A 200-course catalog comparison completed in about one second; disposable-schema checks also matched the previous SQL results and verified rollback after interruption. These are dated observations, not performance guarantees.

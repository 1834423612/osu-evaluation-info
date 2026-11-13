# Catalog sync reliability audit — November 7, 2026

## Evidence

The repository had 15 Actions runs at inspection time. All 9 jobs with logs were downloaded, including the 2 successful automated PR review jobs. The other 6 runs created no jobs and have no job logs or check-run output available through the API. Full retrieved logs and run/job metadata are kept outside Git in `/tmp/osu-actions-audit/`.

| Runs                                                                                                                                                                                                                                                                                                                                                                       | Observed result                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [41729414889](https://github.com/1834423612/osu-evaluation-info/actions/runs/41729414889), [41760312909](https://github.com/1834423612/osu-evaluation-info/actions/runs/41760312909)                                                                                                                                                                                       | `DATABASE_URL is required`                                                                                    |
| [41760635083](https://github.com/1834423612/osu-evaluation-info/actions/runs/41760635083), [41995037558](https://github.com/1834423612/osu-evaluation-info/actions/runs/41995037558), [42141556528](https://github.com/1834423612/osu-evaluation-info/actions/runs/42141556528), [42144865252](https://github.com/1834423612/osu-evaluation-info/actions/runs/42144865252) | Workflow failed without creating jobs; no execution logs available                                            |
| [42221433954](https://github.com/1834423612/osu-evaluation-info/actions/runs/42221433954), [42284068119](https://github.com/1834423612/osu-evaluation-info/actions/runs/42284068119)                                                                                                                                                                                       | Startup failure without jobs; the existing operations guide records the owner-only Actions policy restriction |
| [42321119986](https://github.com/1834423612/osu-evaluation-info/actions/runs/42321119986)                                                                                                                                                                                                                                                                                  | All pages fetched; snapshot publication rejected                                                              |
| [42349949008](https://github.com/1834423612/osu-evaluation-info/actions/runs/42349949008), [42387419700](https://github.com/1834423612/osu-evaluation-info/actions/runs/42387419700), [42413074442](https://github.com/1834423612/osu-evaluation-info/actions/runs/42413074442), [42430277378](https://github.com/1834423612/osu-evaluation-info/actions/runs/42430277378) | Same failed run resumed: current coverage 70,508, saved/fetched coverage 70,499                               |
| [42350546425](https://github.com/1834423612/osu-evaluation-info/actions/runs/42350546425), [42415427953](https://github.com/1834423612/osu-evaluation-info/actions/runs/42415427953)                                                                                                                                                                                       | Automated PR review succeeded                                                                                 |

[PR #2](https://github.com/1834423612/osu-evaluation-info/pull/2), inspected at `2606b4e`, compares only the overall partition total, after existing partitions have already been inserted with `ON CONFLICT DO NOTHING`. This misses equal-total redistribution and additions/removals that preserve the total. Its separate rebuilding helper also omits the original discovery reconciliation check. The refactor uses one discovery implementation for initial creation, replacement, and final validation.

## Database findings

Read-only transactions confirmed schema versions 1 and 2, one published legacy generation, and one failed generation. Business tables were not modified during diagnosis or validation.

The failed generation `c687c4c8-3abc-49a8-b3c5-0ec0536d97a3` had 713 complete partitions: 70,499 fetched hits and 70,493 distinct sections. Later invocations changed its run-level expectation to 70,508 without changing the saved partition plan.

Its original publication failure had another cause: Spring 2027 section `37846` references course `166319`, offering `1`, campus `COL`, but the upstream course-shaped object lacks `offeringNumber` and `campusCode`. The old writer stored the parent with offering `"undefined"` and campus `""`. The publication guard correctly rejected the orphan section. The published legacy generation also has two such broken parent links; rewriting a published version in place would invalidate its immutability. Fresh validated generations replace it safely.

## Implementation boundaries

- `upstream.mjs`: response/count validation, bounded transport/HTTP retries, and request cancellation.
- `plan.mjs`: reconciled subject discovery, recursive cap-safe partitioning, and per-query plan comparison, without database mutation.
- `rows.mjs`: required identity validation, section-derived parent identities, duplicate consistency, and static JSON normalization.
- `checkpoints.mjs`: six-hour checkpoint limit, structural/integrity checks, and atomic replacement with a full plan.
- `writer.mjs`: conflict-safe bulk page writes and compare-and-set checkpoints in one retried transaction.
- `snapshots.mjs`: atomic publication only after coverage and full parent identity validation.
- `prune_snapshots.mjs`: compatibility no-op; all saved generations are permanent archives.

Schema version 3 adds database protection for permanent catalog archives. Install it explicitly with `pnpm catalog:migrate`. Existing published versions and historical evaluation/RMP tables stay intact. See [operations](operations.md) for retention, retry limits, upstream consistency limits, and verification commands.

## Verification

The live end-to-end test traversed all 713 partitions across Summer 2026, Autumn 2026, and Spring 2027. It reconciled 70,508 official hits to 70,505 distinct sections (3 identical duplicate hits), then published successfully in its disposable schema. Run `ef7ac3b8-a3b2-45c8-922d-2fb5c2af6d7a` completed in approximately 429 seconds. The previous orphan section `37846` joined its correct parent with offering `1` and campus `COL`. The test schema was dropped afterward; no production generation was published or modified.

Deterministic database tests also cover unchanged resume, equal-total count/key changes, corrupt legacy staging rows, checkpoint expiry, atomic replacement rollback, cross-page identity conflicts, invalid/incomplete page rollback, bounded index-drift rebuilds, campus/subject publication guards, and resumable failed-generation cleanup. The explicit live test is skipped during ordinary test runs; opt in using the command in [operations](operations.md).

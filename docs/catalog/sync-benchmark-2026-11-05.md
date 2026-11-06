# Catalog sync dry-run benchmark — November 5, 2026

This report records the behavior before the snapshot and enrollment optimizations. For the implemented publication, locking, retention, and schedule behavior, see the [operations guide](operations.md).

The isolated benchmark preserved application availability at the tested write rates, but it showed latency spikes. The current refresh logic also intentionally makes the previous snapshot ineligible while a newer refresh is running or failed. Startup DDL can wait for an exclusive lock. These findings prevent a claim that an hourly refresh has no application impact.

## Scope and isolation

- Test window: 2026-11-05 23:06:04–23:07:53 America/New_York.
- Connected to the configured PostgreSQL 18.0 database from the developer machine. This did not run on a GitHub-hosted Actions runner.
- Production catalog before and after: 17,726 courses, 70,435 sections, one completed sync, and 713 partitions. No production course, evaluation, partition, or sync-run rows were written by the test.
- Fixture: 7,998 sampled sections and 2,497 courses from all three stored terms, split into 40 batches of up to 200 sections. Rows were sampled in class-number order within each term, not uniformly across subjects.
- Created a uniquely named schema with regular WAL-logged tables and the production DDL/indexes. This was real isolated database writing, not a mocked client, rolled-back-only run, temporary table, or unlogged table.
- Replayed the production JSON-recordset upsert shapes, a partition checkpoint, BEGIN, and COMMIT on one writer connection. A fresh run ID for each sample pass changed the indexed `last_seen_run`, as a real refresh does.
- Fixture size: 18.26 MiB including table indexes and TOAST. Sampled write payloads totaled 20.79 MiB.
- Four approximately 20-second phases: no writes, 100 ms between write transactions, no artificial write delay, then no writes again. Baseline measurements began after fixture creation and initial loading.
- Probed the running application on localhost:3000, the actual uncached application evaluation SQL for a fixed 12-course batch, a production catalog grouping query, and an ordinary SELECT against the same isolated table being updated. The catalog SQL probe measures its grouping query, not the entire mirror endpoint.
- The application HTTP probes exercised warmed evaluation and official-catalog endpoints. Application caches remained enabled; the direct SQL probes bypassed those caches. The monitor saw no application-labelled database sessions in the corrected run, so HTTP success primarily demonstrates the cached user path; the separate direct SQL probes provide the uncached database-contention measurements.
- Added query/lock timeouts and a stop condition for repeated database reads over two seconds. No global database settings or statistics counters were reset.

## Timing and write rate

The original completed production run took **11 minutes 3.54 seconds**, covering 70,454 official hits and 70,435 distinct sections. This is a historical full-run measurement, not a new full-refresh benchmark.

The current partition distribution contains 713 partitions and implies approximately 893 fetch/write pages; 610 partitions fit within one page. Estimating duration from `70,435 / 200` alone would undercount the requests.

First insertion of the 7,998-section fixture took **14.60 seconds** across 40 transactions. Initial page-transaction P50/P95 were 352.61/472.21 ms.

During sustained indexed refresh updates, 52 unpaced transactions wrote 10,398 section rows in 20.79 seconds: **2.50 transactions/s and 500 section upserts/s**. Each transaction also upserted its course rows and advanced a checkpoint. These are batched writes, not a separate transaction per section.

Across both sustained-write phases, the harness committed 18,996 section upserts and 6,626 course upserts, in addition to fixture initialization. Replaying 893 transactions at the measured unpaced mean of 389.45 ms gives roughly **5.8 minutes for page transactions alone**. This is a component projection, not a prediction of complete sync time: real partitions have different batch sizes and the full run includes discovery, official HTTP requests, retries, JSON processing, and delays.

Seven current read-only official API page samples took 67.45–157.40 ms, with a median of 105.12 ms. They were separate from the write phases. For scheduling, the historical approximately 11-minute full run is a better initial reference than multiplying the fixture's row throughput; the GitHub-to-database route may differ.

## Application response measurements

All latency columns are milliseconds; P95 is descriptive for this small sample, not a confidence interval or service guarantee. The corrected run is summarized below. The preliminary pass also completed without request errors, but did not change the indexed run ID and is not used for write-capacity conclusions.

| Phase          | Write transactions/s | Section upserts/s | Uncached evaluation SQL P95 | Catalog grouping SQL P95 | Cached evaluation HTTP P95 | Official-catalog HTTP P95 | Errors |
| -------------- | -------------------: | ----------------: | --------------------------: | -----------------------: | -------------------------: | ------------------------: | -----: |
| baseline       |                 0.00 |                 0 |                      139.16 |                    79.20 |                      12.38 |                    318.33 |      0 |
| paced-writes   |                 2.08 |               417 |                      152.36 |                    90.17 |                       9.75 |                    388.60 |      0 |
| unpaced-writes |                 2.50 |               500 |                      121.14 |                    60.80 |                       9.13 |                    219.44 |      0 |
| recovery       |                 0.00 |                 0 |                      140.94 |                    68.17 |                       9.40 |                    755.32 |      0 |

| Phase          | Uncached evaluation SQL maximum | Official-catalog HTTP maximum | Same-table SELECT P95 | Global WAL delta (MiB) |
| -------------- | ------------------------------: | ----------------------------: | --------------------: | ---------------------: |
| baseline       |                          145.92 |                        349.52 |                 51.96 |                   0.87 |
| paced-writes   |                          866.61 |                        463.98 |                 51.04 |                  20.65 |
| unpaced-writes |                          173.09 |                        242.13 |                 47.37 |                  23.01 |
| recovery       |                          147.48 |                       1290.36 |                 72.83 |                   1.86 |

All **275 application HTTP probes returned 200**. All **420 direct SQL probes completed successfully**. Database monitoring recorded **79 samples** with no observed application lock waiters, blocked application sessions, or benchmark lock waiters during the four measurement phases; the database deadlock counter did not increase. One-second sampling cannot exclude shorter lock waits.

Uncached evaluation SQL P95 changed by -12.9% between baseline and the unpaced write phase. Catalog HTTP tail latency also fluctuated, including during recovery. These requests include upstream/remote-database latency and development-server overhead, so the test does not establish that every slow response was caused by the writer. Median, P95, and maximum values should be considered together.

PostgreSQL ordinary SELECTs and row updates generally use compatible MVCC behavior; this does not eliminate competition for CPU, cache, network, or storage. See [PostgreSQL MVCC](https://www.postgresql.org/docs/18/mvcc-intro.html). Global WAL counters above include any concurrent database activity, not only the harness. [Checkpoint I/O](https://www.postgresql.org/docs/18/wal-configuration.html) can add later load that a short test misses.

## Confirmed application behavior and lock risk

### Refreshing disables the previous fallback snapshot

The isolated reproduction used the same eligibility predicate as `src/lib/catalog/mirror.ts`:

| State                            | Eligible completed snapshots for the tested term |
| -------------------------------- | -----------------------------------------------: |
| Before inserting a new run       |                                                1 |
| A newer run is running           |                                                0 |
| That newer run is marked failed  |                                                0 |
| After removing the test-only run |                                                1 |

The production updater changes the current rows in place, and the eligibility guard avoids presenting a mixture of snapshot versions. Consequently, broad browsing can lose its database fallback throughout a refresh, and a failed refresh can keep that fallback unavailable until recovery. Existing mirror cursors can also become unavailable. Official-first browsing can still work while the OSU service is healthy. The benchmark did not disable the real fallback; this behavior was reproduced only in the isolated schema.

Relevant code: `src/lib/catalog/mirror.ts` (`latestEligibleTerm`, `findSnapshot`), `scripts/catalog/sync_osu_catalog.mjs` (new run insertion and in-place upserts), and `src/app/api/catalog/route.ts` (fallback and mirror-cursor handling).

### Startup DDL can wait even when the column already exists

The synchronizer executes `db/schemas/catalog.sql` on each run. That file contains `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for existing columns. In the isolated schema, holding an ordinary read transaction on `sync_runs` caused the no-op ALTER to hit the configured one-second lock timeout after **1034.11 ms**, PostgreSQL code `55P03`.

This was an intentional isolated lock demonstration, not an observed production outage. It confirms that the startup migration needs stronger locking than the page upserts; long-running readers can make it wait, and a queued exclusive request can delay new readers. The production sync connection currently has a connection timeout but no explicit query or lock timeout. See [PostgreSQL lock compatibility](https://www.postgresql.org/docs/18/explicit-locking.html).

## Limits and recommended next steps

- This was a bounded sample benchmark, not a full 893-page refresh or a long-duration/high-concurrency user test. The fixture is smaller than the production catalog and fits within the configured 128 MiB shared buffers; a full refresh can produce more cache churn and WAL/checkpoint pressure.
- Only two application endpoints and fixed SQL workloads were sampled. The test does not certify all RMP, directory, translation, or browser interactions under peak traffic.
- The evaluation HTTP endpoint benefited from its normal cache. Its small latency does not measure an uncached database round trip.
- Server OS CPU, disk utilization, and network telemetry were unavailable. `track_io_timing` was off. Database-wide counters are context, not isolated causal attribution.
- Keep one writer and page-sized transactions. Avoid adding parallel writers based on this sample alone.
- Move schema migrations out of recurring synchronization and add bounded lock/query timeouts to the sync connection.
- To keep fallback available during refreshes, load into a separate snapshot generation or staging tables, validate coverage, then publish the new generation atomically. Keep the previous generation readable until publication succeeds. Simply removing the eligibility guard would permit mixed snapshot data and is not sufficient.
- Recheck a full refresh and peak read traffic after that publication design is implemented, before treating hourly synchronization as having no user-visible effect.

## Cleanup and artifacts

The isolated schema was dropped successfully. A separate post-run check confirmed no remaining test namespace, no benchmark connections, no running production sync, and unchanged production catalog counts. The recorded production counts, latest fetched timestamps, and sync-run status fingerprint were unchanged. No real schema migration, full sync, or workflow dispatch was run.

The [machine-readable results](sync-benchmark-2026-11-05.json) are retained with this report.

One-off local artifacts:

- `/tmp/osu-eval-catalog-benchmark/run.mjs`: the bounded test harness.
- `/tmp/osu-eval-catalog-benchmark/results.json`: measurements for the corrected indexed-run-ID test.
- `/tmp/osu-eval-catalog-benchmark/results-first-pass.json`: preliminary same-run-ID measurements, superseded because they understated index changes during refresh.

The results file contains metrics and schema metadata only; sampled course rows and database credentials were not written to the report artifacts. Application and synchronization code were not changed by this test.

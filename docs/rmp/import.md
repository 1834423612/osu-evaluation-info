# Rate My Professors OSU Collection

Rate My Professors records live in the separate `osu_rmp` PostgreSQL schema. They are third-party student reviews and must not be merged into the official OSU SEI/SSLE tables or score policy.

The collector covers the six OSU campus school records found through RMP search: Columbus (724), Mansfield (726), Lima (725), Marion (723), Newark (2610), and Wooster/ATI (5207). School IDs and search totals can change; the collector stores returned names, IDs, and counts with the run.

## Authorization and request pace

Only run the collector when prior authorization from Rate My Professors is in place. It sends one sequential GraphQL request at a time with a minimum 10-second interval, uses no parallel workers, persists the last request time, and honors `Retry-After` on throttling. A PostgreSQL advisory lock prevents two local runs from collecting concurrently.

## Run

The supported collector is `scripts/rmp/collect_rmp_osu.py`. The obsolete SQLite collector has been retired; keep `db/osu_rmp.sqlite` as a local source archive and `db/osu_rmp.sql` as the existing dump. The collector reads `DATABASE_URL` from the environment or `.env.local`, records each successful page, and resumes a compatible paused run by default. Python requires `psycopg[binary]`.

```sh
pnpm rmp:collect --confirm-authorization
```

For a bounded connectivity check, collect one page and resume later:

```sh
pnpm rmp:collect --confirm-authorization --max-requests 1
pnpm rmp:collect --confirm-authorization
```

After a completed run, another invocation starts a new incremental run automatically. `--new-run` abandons a paused cursor and starts fresh. Do not lower `--min-interval` below 10 seconds. `--batch-size` controls how many professor review connections share one GraphQL request (default 10, maximum 20); `--page-size` is capped at 100.

Every run scans school search summaries to discover profiles and changes. Review pages are fetched only for changed summaries, missing local reviews, or profiles whose verified refresh is older than `--refresh-days` (default 30). This bounded recheck also detects review edits/deletions that leave summary counts unchanged. RMP has no reliable change feed, so local comparison cannot eliminate the school search scan. Use a periodic full refresh for a complete review audit:

```sh
pnpm rmp:collect --confirm-authorization --new-run --full-refresh
```

Do not add `--full-refresh` when resuming an incremental run; start a new run for that mode. The saved run retains its original mode across interruptions. Cursor history detects repeated, stalled, empty intermediate, or duplicate review pages. Review completeness uses `ratingsDistribution.total`, since `numRatings` can differ from the published connection. Source search count drift is recorded and suppresses deletion synchronization. Only a verified professor page scan may mark missing reviews inactive; global review reconciliation requires a complete full refresh. Deletion is soft (`active=false`), with source IDs and audit history retained.

The collector uses a nonblocking session advisory lock, connection/statement/lock timeouts, and short page transactions. Network waits happen outside page writes. Installed schema versions skip repeated DDL. An interrupted transaction rolls back before progress is marked paused; rerun the same command to resume.

## Identity mapping and application queries

Run the mapping refresh after a successful catalog or RMP update:

```sh
pnpm rmp:mappings --dry-run
pnpm rmp:mappings
```

`osu_rmp.instructor_identity` uses the official OSU `name.number` as its key. `instructor_course` retains term, campus, course, and source evidence. `professor_identity_map` links stable RMP IDs to OSU identities without changing collector source tables. Automatic acceptance requires a unique exact normalized name plus campus, academic subject/department, and overlapping course evidence. Ambiguous candidates remain unaccepted; a matching name alone is insufficient. Complete official snapshots update evidence, while incomplete catalog imports cannot erase prior evidence.

Manual decisions are retained across refreshes and recorded in `mapping_decision_log`:

```sh
pnpm rmp:mappings --accept RMP_ID:lastname.123 --reason 'Verified public course and department evidence'
pnpm rmp:mappings --reject RMP_ID:lastname.123 --reason 'Different instructor'
```

Review the evidence before accepting. The mapping installer applies additive migrations and builds the large course/recent-review index concurrently. Recurring collection does not require reimporting or migrating all reviews.

The course detail API queries accepted profiles for the selected campus and a verified canonical course. Course pages explicitly include official course-history teachers; individual teacher scores retain the selected-teacher scope. Accepted subject aliases are resolved through the derived course mapping, and catalog numbers are never fuzzy-matched. It returns independent recent quality/difficulty sample sizes over two years and at most three dated comments per profile. Historical totals remain visible. RMP samples never enter the official SEI/SSLE scores. Catalog result lists do not load RMP comments. Query inputs, database pool size, statement duration, response caches, and concurrent photo requests are bounded.

## Maintenance order

For an authorized recurring job, run collection, mapping, and optional SQLite supplement reconciliation sequentially. A nonzero exit must stop the dependent steps. Refresh the official catalog before mapping when current teaching facts are needed. Existing commands are ready for a scheduler; this change does not install a recurring automation.

```sh
pnpm rmp:collect --confirm-authorization && pnpm rmp:mappings
# Optional while retaining the legacy source archive:
pnpm rmp:supplement
```

The [SQLite supplement importer](supplement.md) preserves unmatched records with provenance and reconciles real source review IDs on subsequent runs. It never invents RMP IDs or double counts uncertain legacy comments in displayed ratings.

The serving tables are `osu_rmp.school`, `osu_rmp.professor`, `osu_rmp.professor_school`, and `osu_rmp.review`. `osu_rmp.collection_run`, `osu_rmp.run_school`, and `osu_rmp.run_professor` retain run state and cursors so interrupted runs can continue. Collector schema v2 also stores hash-deduplicated source versions in `osu_rmp.professor_observation` and `osu_rmp.review_observation`; search summaries and detailed profile responses remain distinct, and changed upstream payloads are retained without duplicating unchanged comments on every run. Existing latest-state rows are not backfilled as historical versions, so this preserves changes collected after the migration rather than reconstructing overwritten history. Reviewer device identifiers are not requested or stored.

Inspect progress with:

```sql
SELECT id, status, started_at, completed_at, validation_status,
       expected_reviews, observed_reviews, deletion_check_status, last_error
FROM osu_rmp.collection_run
ORDER BY id DESC
LIMIT 5;

SELECT s.campus_code, s.name, s.search_result_count,
       count(DISTINCT ps.professor_id) AS professors
FROM osu_rmp.school s
LEFT JOIN osu_rmp.professor_school ps ON ps.school_id = s.legacy_id
GROUP BY s.legacy_id
ORDER BY s.campus_code;

SELECT count(*) FILTER (WHERE active) AS active_reviews,
       count(*) FILTER (WHERE NOT active) AS inactive_reviews
FROM osu_rmp.review;

SELECT state, count(*) FROM osu_rmp.professor_identity_map GROUP BY state;
SELECT kind, count(*) FROM osu_rmp.legacy_supplement GROUP BY kind;
```

The stored review text is licensed third-party content. Keep it inside the authorized project/database scope and do not publish, redistribute, or expose it through a public endpoint unless the authorization allows that use.

Database files, dumps, SQLite sidecars, detailed comparison reports, and locally derived RMP datasets are ignored by Git. Only schema SQL, application code, tests with synthetic fixtures, and documentation belong in commits. Preserve PostgreSQL source fields (`legacy_id`, professor, raw course/date, separate scores, tags, comment, provenance) for traceability; use normalized course/date and accepted identity views for queries. Broad professor averages describe all their courses and must not replace course-specific recent evidence.

Collector unit tests:

```sh
python3 -m unittest discover -s tests -p 'test_rmp_*.py'
```

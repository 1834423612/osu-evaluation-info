# Official class catalog

Each browser catalog request is served from the official OSU content service first. Course information is never fabricated and evaluation availability does not determine whether a course is shown. A complete PostgreSQL snapshot is used only when the official service fails, and only for broad browsing without text or extended-facet filters; its `snapshotAt` value makes the backup age visible. Live results remain authoritative even when the upstream endpoint reports its 10,000-section cap.

- `https://content.osu.edu/v2/classes/searchableTermsV2` returns currently searchable terms. The newest numerical term is the default; terms are not hardcoded.
- `https://content.osu.edu/v2/classes/search` takes `q`, `term`, `campus`, `subject`, `p`, `sort` and dynamic facet slugs.
- Empty `q` is supported. Sort keys: `subject` (default), `-subject`, `catalogNumber`, `-catalogNumber`.
- The official search counts **sections**, groups them into courses, fixes pages at **200 sections** and caps broad queries at **10,000 sections**. Its facets expose uncapped filtered section counts. A course can straddle pages.
- `catalog-number` means catalog **level**, such as `2xxx`. It is not an exact catalog number. Exact course expansion therefore filters by subject/level, searches the catalog number, then checks the returned subject and number strictly.

## Application endpoints

`GET /api/catalog?q=&term=1272&campus=col&subject=cse&limit=12`

Returns `CatalogResponse` from `src/lib/catalog/types.ts`. A course-code query such as `CSE 2221` is parsed into subject `CSE` plus numeric search `2221`, avoiding the official search's broad OR matching of both tokens. The default sort is subject ascending. Default campus is Columbus (`col`); `campus=all` searches every campus. `filters` preserves every official facet, value and count, including general education, instruction mode, academic career, program, component, session, level and attributes. Add facet parameters by their official slug, such as `instruction-mode=dl`.

For more results, send the returned `nextCursor` in `cursor`. A live cursor comprises the official page and the offset inside its grouped courses; a backup cursor is bound to its snapshot. Limit defaults to 12 and is capped at 24. `totalItems`, `matchedSections` and `totalPages` describe upstream sections/pages for live results, not unique course counts. `capped` warns when the live official query reaches its 10,000-hit ceiling. Text search and extended facets continue using the live official endpoint and return an error if it is unavailable, since the backup does not contain equivalent search indexes. Course identity is term + subject + catalog number + campus. Internal offering-number variants are combined before pagination; merge same-ID course sections when accumulating multiple result windows. The UI should bound its mounted result window.

When `sourceMode="mirror"`, pagination uses a bound `m:` keyset cursor, `snapshotAt` is the completed sync time, and every returned course has its complete snapshot sections (`sectionsPartial=false`). `totalItems` and `matchedSections` are distinct mirrored section counts. If official facets were unavailable, the backup returns subject and campus facets derived from its snapshot. Use `nextCursor` instead of arithmetic on `page`/`totalPages`.

Only published, complete generations covering the selected term are eligible. New and failed builds write separate rows and never disable an existing publication. Mirror queries run in one repeatable-read transaction. Existing cursors stay pinned to their published generation until retention retires it; expired/mismatched cursors return 400 and require restarting the search. If no eligible database snapshot exists, the endpoint returns the original official API error; it never claims full coverage. Snapshot data is grouped in PostgreSQL and only a 12–24 course window is serialized to Node, using indexed predicates and keyset pagination.

`sectionsPartial=true` means the list entry contains only the current official page's matching sections. To expand all sections in place:

`GET /api/catalog/course?subject=CSE&catalog=2221&term=1272&campus=col`

Returns `{course,fetchedAt,complete,source}`; missing exact courses return `course:null`. The endpoint follows up to 12 official pages and a 15-second between-page budget. Any cap, incomplete traversal or later-page error produces `complete:false`, never a claim of completeness. If the official service fails, a complete matching snapshot may supply the course and sections. `sectionsPartial` reflects completeness. Exact OSU email identities connect instructor scores to sections. Enrollment capacity is not inferred from room capacity or enrollment totals.

`GET /api/catalog/facets` accepts the same filters and returns official facets and terms.

The server keeps at most 48 in-flight requests for deduplication; completed official responses have zero cache lifetime. Upstream and API requests use `no-store`. Each upstream request times out after 20 seconds. `fetchedAt` is the original fetch time, including cached responses. Unsupported backup searches and missing snapshots produce explicit 502 responses; malformed inputs produce 400. Evaluation queries are batched per window and return unavailable status on a database failure without removing official courses.

## Complete PostgreSQL mirror

```sh
node scripts/catalog/sync_osu_catalog.mjs
```

Requires Node 24+ and `DATABASE_URL` (reads `.env.local` / `.env`). Provision the separate `osu_catalog` schema explicitly with `pnpm catalog:migrate`; the synchronizer checks its version without executing DDL. Original SEI/SSLE scripts and `osu_eval` data remain intact.

All currently searchable terms and all campuses are included. The script discovers subjects across all searchable terms, reconciles each term's subject counts against the official term hit count, and repairs term facets that omit valid subjects. For example, the Summer 2026 facet omitted ART and GENED even though those courses were searchable. Each term/subject partition is fetched separately. Oversized partitions are subdivided by campus, component, level and career; any remaining cap is an explicit failure. Pages are written using bulk JSON recordsets; only one 200-section page is in memory at a time. Original course and section JSON is retained alongside queryable identity fields. Exact run/term/class-number keys upsert the unpublished generation without changing older publications.

Page writes and checkpoints commit in one transaction. HTTP requests retry up to five times. An advisory lock prevents simultaneous syncs. Interrupted and failed runs resume automatically; `--new-run` starts a new snapshot. Historical snapshot membership is recorded via `last_seen_run` as part of the primary key. Successful validation atomically publishes the completed generation; bounded retention preserves recent versions before reclaiming old rows. Only fully traversed runs whose fetched hit counts match every partition and the complete official term counts exactly are marked complete. Official duplicate hits are deduplicated by term/class-number; both `fetched_hits` and `distinct_sections` are stored and printed. A live index change causes at most one automatic rebuild from a fresh plan; persistent mismatches fail without publishing. Resume compares individual partition queries and counts, rejects invalid/expired checkpoints, and never overwrites a published generation. See the validation limits in [catalog operations](operations.md).

Useful flags:

```sh
node scripts/catalog/sync_osu_catalog.mjs --discover-only
node scripts/catalog/sync_osu_catalog.mjs --term 1272
node scripts/catalog/sync_osu_catalog.mjs --max-pages 5
node scripts/catalog/sync_osu_catalog.mjs --new-run
```

`--max-pages` deliberately leaves the run checkpointed and incomplete. Omit it to resume to completion. The repository workflow runs every four hours in America/New_York, exclusively on scheduled events; it then performs bounded snapshot cleanup. See [catalog operations](operations.md).

## Live-only enrollment

Search and detail endpoints return **metadata only**. Their raw enrollment fields
are placeholders; normalization always clears them, even for a successful official
search. Snapshots and saved courses also exclude volatile counts and provenance.
`courseId` is the official numeric catalog identifier, separate from the composite
application ID and the enrollment `classNumber`. Credits preserve min/max units.

`GET /api/catalog/availability?courseId=151332&courseOfferingNumber=1&classSection=0040&sessionCode=1&termCode=1268`

The server validates all five identifiers and queries only the fixed official
`https://content.osu.edu/v2/classes/availability` endpoint. Section codes preserve
leading zeros. Returns `{availability}` with `source:"official-availability"`,
`fetchedAt`, `isOpen`, `enrollmentStatus`, `enrollmentCapacity`, `enrollmentTotal`,
`availableSeats`, `waitlistCapacity`, and `waitlistTotal`. Missing numeric fields
remain null; zero is meaningful. Remaining seats come from `availableSeats`, never
from room capacity. Waitlist remaining is explicitly capacity minus total.

A shared queue within each server process allows at most two upstream reads with
at least 500 ms between starts, 120 queued jobs, a 15-second request timeout, shared
in-flight reads and a two-second result coalescing window. It backs off on upstream
429 responses. This is a per-process bound, not a distributed account-wide quota.
The browser adds its own two-read limit, 400 ms start spacing, 80-job bound and
20-second timeout. Saturation returns 429 with Retry-After; failed upstream reads
return 502. API/browser responses use no-store. Counts exist only in session memory.

Visible list entries receive gradual one-time section checks. Opening/reopening
normal details performs a fresh one-time check per section. Successful results
remain visible while idle or hidden, until another query or refresh replaces them.
Failed refreshes retain the last verified counts with an explicit failure and
last-read label; unqueried rows never display search placeholders. Each row has a
manual retry and fetch timestamp. Closing/unmounting cancels unneeded work; shared
readers do not cancel each other and late responses cannot overwrite newer reads.

Seat Watch remembers **selected class numbers only**, scoped to course, term and
campus. It requires an explicit start, refreshes selected sections only, and pauses
when choices change. Selecting more than eight sections requires a second
confirmation before starting. The next round begins after the previous round
finishes, waiting at least max(10 seconds, configured interval, selected count in
seconds); queued starts are still spaced. The UI displays progress and a countdown.
Hiding the tab cancels the current watch round; visibility restoration resumes it.
Entering course details while Seat Watch is enabled pauses other list queries,
retaining their previous results. Closing details resumes unfinished visible list
checks. No background courses are polled. Reloading remembers choices but requires
starting the watch again.

Course and section attributes preserve fee descriptions. Campus-qualified `CRSF`
fees are filtered by section campus, with ATI mapped to Wooster; `ALX` digital
textbook fees are shown on applicable sections. Course lists summarize published
fees, while details show the original descriptions. The UI never sums alternative
campus or section fees into a total.

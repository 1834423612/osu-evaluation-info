# Official class catalog

Text queries default to `GET /api/catalog/search`, a typo-tolerant index over the
complete published PostgreSQL catalog. It returns `sourceMode: "index"`, its sync
time, matched totals, per-course evidence and version-pinned `s:` cursors. See
[the search engine](search.md) for retrieval, filters, lifecycle and evaluation.
It never proxies OSU. The direct transport below still supplies broad browsing,
live verification, course-detail refreshes, official facets and enrollment.

Browser requests first discover public OSU endpoint configuration from the existing
application routes. These discovery handlers return static configuration and never
request official course data. The browser then builds the official query, fetches
it directly with CORS and credentials omitted, normalizes the response, and batches
local historical evaluation summaries separately. Only complete PostgreSQL backup
snapshots and cached directory/evaluation data are served by this backend.

## Discovery and browser transport

The existing `GET /api/catalog`, `/api/catalog/course`, `/api/catalog/facets`, and
`/api/catalog/availability` paths return an `OfficialEndpointPlan`:

```json
{
  "delivery": "osu-direct",
  "version": 1,
  "resource": "catalog",
  "endpoints": {
    "search": "https://content.osu.edu/v2/classes/search",
    "terms": "https://content.osu.edu/v2/classes/searchableTermsV2",
    "availability": "https://content.osu.edu/v2/classes/availability"
  }
}
```

`resource` matches the requested category. Responses use public max-age 3600 and
stale-while-revalidate 86400. Each browser caches discovery for one hour and shares
an in-flight discovery between subscribers. Closing one view cannot cancel another
subscriber's configuration read. The client validates the configured URLs against
the approved public OSU endpoints. No session cookies, API credentials or arbitrary
third-party destinations are forwarded. OSU returned `Access-Control-Allow-Origin:
*` during the November 8 check; direct requests use simple GET/Accept headers.

`src/lib/catalog/browser-transport.ts` retains the normalized `CatalogResponse` and
course-detail response shapes for UI callers. `official-client.ts` shares exact
matching, grouping, normalization and cursor parsing with database snapshot reads.
Public term metadata is retained for 30 minutes in browser memory. Search/detail
metadata reads share a two-request browser queue with at least 250 ms between
starts, at most 48 queued jobs and 20-second upstream timeouts. Live seat checks use
a separate queue described below. Failed reads never silently become server-side
proxies.

The official search accepts `q`, `term`, `campus`, `subject`, `p`, `sort` and dynamic
facet slugs. It counts sections, fixes pages at 200 sections, caps broad queries at
10,000 hits and can split a course across pages. The browser preserves all official
facets. Exact queries such as `CSE 2221` parse into subject and catalog number, check
both returned fields strictly, combine offering variants per campus, and traverse
at most 12 pages with a 15-second between-page budget. Incomplete reads remain
marked partial. `catalog-number` facets represent levels such as `2xxx`, not exact
catalog numbers. Sort values remain `subject`, `-subject`, `catalogNumber`, and
`-catalogNumber`. Text searches additionally support local `relevance` sorting.
The newest published searchable term is the default. Subject-name recognition,
keyword ranking and explicit suggestions are described in [course search](search.md).

A browsing cursor is `page:offset` within grouped courses; ranked text searches use
`r:upstream-page:offset` within a bounded candidate window. Browser pages are bounded
to 12–24 courses; mounted results remain bounded. Mirror `m:` cursors stay bound to
their published snapshot and filters. Official `totalItems` counts sections;
`totalCourses` is exact only for exact searches, complete uncapped ranked scans,
or complete mirror snapshots.

## Local evaluation enrichment and database fallback

`POST /api/evaluations` accepts `{courses:[{id,subject,catalogNumber,campusCode,
instructors:[{name,email}]}]}` and returns `{summaries:{[courseId]:summary}}`.
At most 24 courses, 30 instructors per course and a 64 KiB body are accepted.
Queries batch by campus to avoid mixing histories for identical course codes at
different campuses. The repository's row cache still applies. The existing single
course evaluation GET is unchanged. Evaluation failure leaves official courses
visible with unavailable evaluation status.

For an official failure, broad browsing without text or extended facets may read
`/api/catalog?mode=snapshot&...` or `/api/catalog/facets?mode=snapshot&...`.
Exact details can read `/api/catalog/course?mode=snapshot&subject=CSE&catalog=2221&...`.
These explicit fallback handlers read the database only and never call OSU. A
missing backup returns 503; malformed/unsupported snapshot inputs return 400.
Complete, published snapshots retain their timestamp, campus identity and bound
keyset cursor. Expired or mismatched cursors require restarting the search. Failed
or unpublished sync generations never replace the last successful publication.
Snapshots do not pretend to support full-text or extended-facet searches.

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

Search enrollment fields are placeholders. Normalization clears them even for
successful official searches. Snapshots and saved courses exclude volatile counts
and provenance. Official numeric `courseId` is displayed as Course code / 课程代码,
separate from the application composite identity and enrollment class number.
Credits preserve the min/max unit range.

After one discovery request to `/api/catalog/availability`, the browser constructs
queries directly against the returned official availability URL using all five
identifiers: `courseId=151332`, `courseOfferingNumber=1`, `classSection=0040`,
`sessionCode=1`, `termCode=1268`. Section codes preserve leading zeros. It validates
`data.availability` and adds `source:"official-availability"` and a fetch timestamp.
Counts include enrollment total/capacity, available seats and waitlist total/capacity.
Missing counts remain null; known zeroes remain visible. Waitlist capacity missing
from the API does not hide a known waitlist total. Remaining seats are never inferred
from room capacity. Waitlist remaining is explicitly capacity minus total.

The per-browser seat queue allows at most two concurrent reads, one start per
500 ms, 80 queued jobs, 20-second timeouts and shared in-flight reads. Upstream 429
responses back off this queue using Retry-After. There is no server live-seat queue
or per-refresh proxy request. Limits are per browser, so users' upstream connections
originate from their own networks. Counts exist in session memory only.

Visible results receive gradual one-time section checks. Normal details perform a
fresh one-time check on open/reopen. Successes remain while idle or hidden; a failed
refresh retains and labels the last verified result. Closing a view cancels unneeded
work, and cancelled/late reads cannot overwrite newer data. The filter result row
contains a right-aligned refresh button and completed/target count. Narrow phones
place the small progress caption below the button.

Seat Watch remembers selected class numbers per course/term/campus and requires an
explicit start. Only selected sections repeat; changed choices pause the watch.
More than eight selected sections requires confirmation. Each completed round waits
at least max(10 seconds, configured interval, selected count in seconds). The UI
shows a countdown. Hiding a tab cancels its watch round and visibility restoration
resumes it. Opening details while Seat Watch is enabled pauses other result courses,
retaining their data. Closing details resumes unfinished visible checks. Reloading
remembers choices but requires starting again.

Campus-qualified `CRSF` fees are filtered to the section campus (ATI maps to Wooster).
`ALX` textbook charges stay associated with their sections. Course headers use a
compact fee summary, while section-specific fee chips sit with schedule information.
Common course fees are not repeated on every row. Expanding a section retains the
original fee descriptions. Charges from different campuses or sections are never
summed. Role badges show one short primary position and an additional-role count;
the identity popover retains all appointments and their organizations.

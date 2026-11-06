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

Only the newest complete sync covering the selected term is eligible. A newer unfinished sync disables older snapshots because the current tables are updated incrementally. Mirror queries run in one repeatable-read transaction and select rows seen in that complete run. Cursor filters, ordering and snapshot identity are checked; expired/mismatched cursors return 400 and require restarting the search. If no eligible database snapshot exists, the endpoint returns the original official API error; it never claims full coverage. Snapshot data is grouped in PostgreSQL and only a 12–24 course window is serialized to Node, using indexed predicates and keyset pagination.

`sectionsPartial=true` means the list entry contains only the current official page's matching sections. To expand all sections in place:

`GET /api/catalog/course?subject=CSE&catalog=2221&term=1272&campus=col`

Returns `{course,fetchedAt,complete,source}`; missing exact courses return `course:null`. The endpoint follows up to 12 official pages and a 15-second between-page budget. Any cap, incomplete traversal or later-page error produces `complete:false`, never a claim of completeness. If the official service fails, a complete matching snapshot may supply the course and sections. `sectionsPartial` reflects completeness. Exact OSU email identities connect instructor scores to sections. Enrollment capacity is not inferred from room capacity or enrollment totals.

`GET /api/catalog/facets` accepts the same filters and returns official facets and terms.

The server keeps at most 48 in-flight requests for deduplication; completed official responses have zero cache lifetime. Upstream and API requests use `no-store`. Each upstream request times out after 20 seconds. `fetchedAt` is the original fetch time, including cached responses. Unsupported backup searches and missing snapshots produce explicit 502 responses; malformed inputs produce 400. Evaluation queries are batched per window and return unavailable status on a database failure without removing official courses.

## Complete PostgreSQL mirror

```sh
node scripts/catalog/sync_osu_catalog.mjs
```

Requires Node 20.12+ and `DATABASE_URL` (reads `.env.local` / `.env`). The script creates only the separate `osu_catalog` schema using `db/schemas/catalog.sql`. Original SEI/SSLE scripts and `osu_eval` data remain intact.

All currently searchable terms and all campuses are included. The script discovers subjects across all searchable terms, reconciles each term's subject counts against the official term hit count, and repairs term facets that omit valid subjects. For example, the Summer 2026 facet omitted ART and GENED even though those courses were searchable. Each term/subject partition is fetched separately. Oversized partitions are subdivided by campus, component, level and career; any remaining cap is an explicit failure. Pages are written using bulk JSON recordsets; only one 200-section page is in memory at a time. Original course and section JSON is retained alongside queryable identity fields. Exact term/class-number keys upsert current records.

Page writes and checkpoints commit in one transaction. HTTP requests retry up to five times. An advisory lock prevents simultaneous syncs. Interrupted and failed runs resume automatically; `--new-run` starts a new snapshot. Historical snapshot membership is recorded via `last_seen_run`; old rows are not silently deleted. Only fully traversed runs whose fetched hit counts match every partition and the complete official term counts exactly are marked complete. Official duplicate hits are deduplicated by term/class-number; both `fetched_hits` and `distinct_sections` are stored and printed. A live index change causing mismatches requires investigation or a new run rather than being reported as complete.

Useful flags:

```sh
node scripts/catalog/sync_osu_catalog.mjs --discover-only
node scripts/catalog/sync_osu_catalog.mjs --term 1272
node scripts/catalog/sync_osu_catalog.mjs --max-pages 5
node scripts/catalog/sync_osu_catalog.mjs --new-run
```

`--max-pages` deliberately leaves the run checkpointed and incomplete. Omit it to resume to completion. To keep the outage backup close to current, run this sync on an hourly scheduler in the deployment environment; no external schedule is created by the application itself.

## Live-only enrollment

Course responses include `availability: { source: "official" | "unavailable", fetchedAt: string | null }`. Only successful official reads populate enrollment status, enrollment totals, and waitlist totals. Mirror normalization always clears these fields, even if an old archived JSON row still contains them. New snapshot pages exclude volatile enrollment fields before writing to PostgreSQL.

Saved courses and sections retain static metadata but clear enrollment values. An idempotent browser-storage migration also scrubs existing favorites without losing their identities. Clients must expire live availability after 30 seconds and must not infer remaining seats from enrollment totals or room capacity.

Visible course details request official data again on open/reopen, window focus, visibility restoration, and every 30 seconds. A shared freshness clock hides enrollment as soon as the 30-second window expires; failures clear it immediately. Closed/hidden details stop polling and abort their request, and request generations prevent late responses from restoring older values. The UI provides a manual refresh control and the official fetch timestamp.

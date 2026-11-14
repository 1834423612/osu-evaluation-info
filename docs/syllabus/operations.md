# Simple Syllabus: protocol, matching and operations

English · [简体中文](../zh-CN/syllabus/operations.md)

See [catalog and syllabus retention](../catalog/lifecycle.md) for term heads, current removals and recovery. Migration 4 adds complete index heads and term-discovery evidence; rechecking an old document does not replace a newer retained version.

Course cards and details expose section-level syllabi, teacher/section choices, textbooks, assessment and schedules. The reader supports official layout, semantic reading, search, outline, progress, zoom and supported fullscreen. Course lists do not prefetch every document or load PDF libraries.

## Verified protocol

Anonymous checks on 2026-11-10 established that PNGs are thumbnails and published HTML components are document content. Protocol samples did not import accounts, cookies, authentication or reading statistics.

| Endpoint                                       | Purpose                                                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api2/app-state?locale=en-US`                 | `items[0].state.terms`: term UUIDs, labels, status, publication and dates; only term fields are extracted                                                   |
| `/api2/doc-library-search?term_id=UUID&page=0` | Zero-based pagination checked against total/returned/page/page_size; records include code/entity/term/title/visibility; supports subject_name/course_number |
| `/api2/doc-full-page-get?code=CODE`            | Published document, term, snapshot, modification and ordered public components                                                                              |
| `/api2/doc-png/CODE/...`                       | Thumbnail, never body content                                                                                                                               |
| `/api2/doc-version-check?...`                  | Sample versioning flags cannot prove content unchanged; not an archive-skip signal                                                                          |

Accept only published, nonworking documents and public English components from the published snapshot. Reject unknown envelopes, invalid IDs, repeated/drifting pages, cross-term results and oversized responses. Preserve nondigit section identifiers. Term UUIDs and availability come from discovery, never fixed current-term assumptions. The 2026-11-10 sample published AU2026 but did not establish readable documents for SU2026, SP2026, Demo or future terms.

## Retrieval and failure states

The browser tries the fixed official origin anonymously with `credentials: omit`. On CORS/network/official failure, `/api/syllabus` tries the same source anonymously before database backup. Responses distinguish `official-direct`, `official-relay` and `backup` with retrieval/backup times.

The observed JSON service lacked CORS. A public browser User-Agent resolved a Node-default CDN 403 without credentials or version headers. HTML 403 is service/CDN failure; JSON 401/403 is access restriction. Failures do not mean no syllabus exists. The official HTML shell has no document body; no server browser process is used.

The relay accepts fixed resources and validated IDs, never arbitrary URLs or visitor authorization. It bounds time, bytes, concurrency and queue size, with short successful-response caches. If protocol or access changes, retain source links and backups while updating the adapter.

## Rendering and PDF

`officialHtml` retains sanitized source DOM, layout classes, images, table widths and permitted inline styles. The isolated iframe uses `public/syllabus/official.css`; scripts and forms are blocked. Its constrained scroll region keeps tools, outline and progress available. Mobile outlines start collapsed and close after a jump.

BUX fonts use the [official webfont CDN](https://bux.osu.edu/typography/fonts/): `https://assets.bux.osu.edu/bux-webfonts2/`. On 2026-11-13 it returned `Access-Control-Allow-Origin: *`; the older S3 host did not. CSS, iframe CSP, PDF font URLs and the asset allowlist use the same CDN. Font declarations retain the checked syllabus weights and styles. No local font copies are required while this public source remains usable.

Semantic reading and `extractSyllabusSections`, `extractSyllabusHighlights`, `extractSyllabusSchedule` support other views. Week paragraphs, ranges, tables, dates, line breaks and reading lists preserve order, repeated/overlapping weeks and full source text. Unknown structures remain source content. Extraction never invents difficulty, workload or missing assessment weights.

PDF code, pdfmake and WOFF2 decoding load on download. Export runs entirely in the browser against an independent 816px official layout, unaffected by current filters, zoom or reading mode. Computed fonts, weight, colors, line/paragraph spacing, padding and flex columns are retained. WOFF2 is decoded to SFNT and subset-embedded; images are converted to PNG while text stays selectable.

US Letter is 612 × 792 pt. The 816px preview's 48px margins map to 36pt, with a 720px/540pt content width. Adjacent margins collapse; links decorate visible text only. Table captions are handled separately. Footer source links and page numbers remain. Uploaded attachments stay available through OSU rather than being presented as merged PDF content.

Where supported, `showSaveFilePicker` runs within the click event. Success requires writing and closing; cancellation stops export. Explicit `SecurityError`/`NotAllowedError` can show a save-window warning. Ordinary Blob downloads cannot reveal whether a browser displayed a dialog, so timers, blur and visibility are not used to guess. Failed writes retain a manual save link.

Images/fonts first use anonymous browser reads. `/api/syllabus/assets` relays only known public account-image UUID paths and BUX font paths, rejecting other URLs, credentials, redirects and bad signatures. It bounds concurrency, queue, time and bytes and never receives user documents or builds PDFs. Unreadable images fail export explicitly. External assets remain source-dependent; database retention does not archive their binary files.

## Database and matching

```sh
pnpm syllabus:migrate
pnpm syllabus:discover
pnpm syllabus:sync
```

Use `DATABASE_URL` from the environment or `.env.local`. Migrations are explicit; scheduled sync performs no DDL or changes to evaluation tables. Migration 3 permanently protects document/index history; later discovery observations and head selection are described in the lifecycle guide. Previously deleted history cannot be recovered by installing protection.

| Object                         | Purpose                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `osu_syllabus.terms`           | Term UUID, OSU code, label and publication metadata                                        |
| `sync_runs`, `sync_partitions` | Term sets, checkpoints, index publication and source unavailability                        |
| `entry_observations`           | Page staging, deduplication and document checkpoints                                       |
| `entries`                      | Persistent raw section identity and term/course/class keys                                 |
| `document_versions`            | Code, published snapshot and SHA-256 versions; identical content only refreshes check time |
| `catalog_links`                | Links to published catalog identity, offering, campus and match method                     |

Matching requires term, subject, full course number and actual class number. Decimal/Honors suffixes stay distinct. An imported alias such as `s_10356` is accepted only with independent same-term/course section evidence; raw identifiers remain unchanged. Title similarity is insufficient.

If syllabus is installed before the versioned catalog, rerun `syllabus:migrate` to create `catalog_links`. No cross-schema cascade can delete syllabi when course snapshots change.

```sql
SELECT match_method,count(*) FROM osu_syllabus.catalog_links GROUP BY match_method;
SELECT status,started_at,completed_at,error FROM osu_syllabus.sync_runs ORDER BY started_at DESC LIMIT 5;
SELECT document_status,count(*) FROM osu_syllabus.entry_observations WHERE run_id=$1 GROUP BY document_status;
```

## Schedule and recovery

`.github/workflows/osu-syllabus-sync.yml` targets 03:43 America/New_York daily, using the `DATABASE_URL` Actions secret. Migrate before enabling the schedule. Requests are serial and anonymous, spaced by 350 ms, with bounded retry/backoff for 429/recoverable 5xx. Pages and checkpoints commit together. Index publication follows full term count verification; an advisory lock prevents overlap. Five consecutive document failures stop the run without losing history or resume state.

Historical terms remain retained. Explicit source removal/restriction skips invalid old work and continues other terms. Repeated pages or count drift reject publication; a failed generation is rescanned. Unknown structures require adapter inspection and sometimes an explicit new run.

```sh
pnpm syllabus:sync --index-only
pnpm syllabus:sync --max-documents 20
pnpm syllabus:sync --new-run
```

`partial` does not mean all documents are archived. `missing` includes unreadable empty shells and removed/unpublished records; `uploaded` requires the official attachment. Index totals alone do not establish body coverage. The first 2026-11-10 index had 8,972 entries, with 8,420 numeric links and 66 verified imported aliases; these are historical observations.

## Choices, updates and scroll gestures

Default selection checks documents in source order and skips unpublished, failed and empty entries. At most two document checks run per course. An earlier slow result cannot cause a default-selection race; manual choices remain selected. Unavailable entries stay below readable choices. Staff/score filters keep nonmatches below, never invent zero scores or mix instruments. Official modification times use the browser timezone with a zone label.

Saved syllabi open directly, retain course/section destinations and check for newer official versions. Opening does not acknowledge an update: clearing the notification is explicit, so an accidental open does not discard it.

Speed never implies outer-panel browsing. One shared controller covers trends, RMP comments and syllabi. A wheel burst/swipe initially belongs to its scroller; no single event applies its leftover to both. At an edge, pausing/restarting or sustained wheel pressure (two events, at least 60 ms and 80px accumulated) can hand off to the panel. A new swipe from the edge can move the panel; reversing an already handed-off touch can read inward again. Short nonoverflowing regions do not trap scrolling. Iframe handoff uses screen coordinates. Fullscreen stays local; choice lists retain their own native scrolling.

## Validation

```sh
pnpm test
SYLLABUS_DATABASE_TEST=1 node --env-file-if-exists=.env.local --test tests/syllabus/*.test.mjs
node tests/syllabus/experience.browser.mjs
node tests/syllabus/source-layout.browser.mjs
node tests/syllabus/fonts.browser.mjs
node --env-file=.env.local scripts/syllabus/audit-schedules.mjs .cache/syllabus-schedule-audit.json
```

Database checks use temporary schemas, not cleared business tables. Browser checks cover responsive source/semantic reading, nested help drawers, PDF download, touch/wheel gestures, saved notifications and Dev Tools focus. Native save-dialog branches have unit coverage; do not infer full native-dialog automation from download tests.

Browser settings: `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, `SYLLABUS_TEST_BASE_URL`, `SYLLABUS_TEST_OUTPUT`. `SYLLABUS_DOCUMENT_FILE` supplies a saved official response for real-layout checks. The font check can accept a pre-rendered `FONT_TEST_DOCUMENT_FILE` when the browser runner cannot resolve Linux package symlinks.

The read-only structure audit visits all retained versions in batches of 100. Its 2026-11-13 run covered 9,578 versions: 8,285 structured and 1,293 source fallbacks, including independent study, internships and flexible schedules. It never fetches, remaps or deletes data.

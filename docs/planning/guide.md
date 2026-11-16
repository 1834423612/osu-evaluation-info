# Schedule planning

English · [简体中文](../zh-CN/planning/guide.md)

Open **Your space → Schedule planning** at /planning. Five views cover Import & review, Semester board, Requirement map, Next semester, and Official curricula.

## Private import and review

Select up to 12 PDF/JSON files together, at most 60 MB total. Each text PDF is limited to 20 MB, 100 pages, 30,000 extracted lines and 60 seconds; JSON backups are limited to 4 MB. Scans and encrypted PDFs are unsupported. Layout detection uses content and transient filename hints. A failed/cancelled batch does not partially replace the draft.

Start with Student Plan, then append Official and Planned audits. Each document retains its own layout, report mode and browser-print origin. Official/Planned is the report mode; declared/undeclared describes each program. Neither proves registration or degree eligibility. Program code, Applied Version, Catalog Term, publication year and GE system are separate. Applied Version reflects the SIS plan/subplan requirement term; see the [Registrar's guide](https://registrar.osu.edu/buckeye-degree-planner/advisor-guide/requirement-terms-in-bdp/).

Review every extracted field. Audit alternatives are options, not attendance evidence. Student Plan observations, transfer/exam credits, placeholders, semester totals and unknown credits stay distinct. A blank/dash never becomes zero or an inferred share of a semester total. Conflicts retain source references. Grades, exception prose, GPA conditions and personal notes are excluded.

The source editor supports program/version correction, requirement hierarchy, all/any/numeric conditions and confirmed allocations. Inferred hierarchies begin unreviewed. Confirm workspace review before saving locally or exporting private JSON; edits invalidate review. Loading/replacing a nonempty draft requires confirmation. Unsaved input uses the shared navigation guard. One saved workspace holds multiple sources. Restoring JSON uses the same whitelist and requires renewed workspace review.

## Board and requirement map

Desktop drag/drop and native move selectors support pointer, keyboard and touch. Add Autumn, Spring or Summer semesters; filter by source or prefix. Placement overrides preserve original imported terms/pages. Completed courses, audit options and transfer/exam groups are not draggable. Totals are lower bounds for distinct course observations, with unknowns separate, never degree totals.

The map groups collapsible rules by source/program/version. Reviewed numeric checks distinguish completed coverage, planned coverage, insufficient coverage and unresolved evidence. Planned coursework never becomes completed credit. Conflicting observations and unreviewed hierarchy stay unresolved. Numeric matches do not prove minimum grades, substitutions, residency, GPA or all graduation conditions. Course links reuse existing catalog/evaluation/session views.

## Next-semester suggestions

Choose a program snapshot, current and later target semester, credit ceiling, optional official sample/year, and a maximum count from editable prefixes such as MATH STAT PHYSICS CHEM CSE. These controls reflect preferences, not inferred mathematical ability or disability.

Candidates come from requirement options, planned observations and the selected public sample. Consistent completed/in-progress observations suppress duplicates; conflicts remain visible.

| Evidence                                | Points |
| --------------------------------------- | -----: |
| Reviewed unsatisfied requirement option |     45 |
| Unreviewed requirement option           |     15 |
| Matching sample year/season             |     25 |
| Another sample semester                 |      8 |
| Existing planned observation            |     10 |
| Evaluation component                    |   0–15 |
| Conflicting observations                |    −20 |

The evaluation component uses (score × responses + 3.6 × 20) / (responses + 20), then maps 1–5 to 0–15. Missing ratings retain a neutral ranking baseline and stay labelled unknown. The existing evaluation service supplies one instrument; SEI and SSLE are never pooled.

A 128-state beam search over at most 60 candidates proposes a combination within credit/prefix ceilings and reduces duplicate requirement-option rewards. This heuristic guarantees neither an optimum nor degree applicability. Courses supported only by other sample semesters stay out of automatic combinations. Unknown/conflicting credits are excluded from automatic combinations. Individual courses can still enter reviewable drafts. Adding suggestions preserves original sources and creates/reuses manual observations. Pending samples may omit coursework or use another requirement term.

Ratings load only after **Load ratings for top 24**. The request includes those course codes, campus and empty instructor arrays; it excludes private IDs, program/version, terms, grades and status. Course links send the selected query through the catalog. Prerequisites, actual session offerings, seats and meeting conflicts require catalog/advisor checks. No registration is performed.

## Privacy and seeds

Parsing uses a bundled local PDF.js worker. Raw files/text, filenames, names, student IDs, contacts, advisors and grades are not persisted/exported. The worker is destroyed, line references cleared, and the input buffer wiped when not transferred/detached. JavaScript strings, garbage collection and browser-internal copies prevent guaranteed secure memory erasure; no such guarantee is made.

The version-2 whitelist stores enumerated provenance, local IDs, program codes/versions, terms, course codes, credits, numeric rule candidates, confirmed allocations and placement overrides. Version-1 backups upgrade on read. Storage key course-atlas:private-planning:v1 is separate from favorites/account sync/public exchange. Browser storage is unencrypted and can fail or be cleared. Course combinations remain potentially identifying. Exported JSON remains private; downloaded copies require separate deletion.

Planning suppresses first-party analytics/replay content and disposes of previously loaded recorders at its navigation entry. Normal account/session/resource requests can still occur. No private-plan upload, cloud sync or public contribution endpoint exists. Future cloud backup requires an explicit account-scoped design; favorites sync does not upload plans.

**Export requirement template** requires explicit per-program selection, workspace review, program code/Applied Version and reviewed hierarchy. Only remapped numeric rules/course options are downloaded: no actual student courses, semesters, allocations, declaration, remaining credits or source IDs. The operator seed archive marks these user-supplied templates pending; they never become official sources or automatically publish.

## Public coverage and adapters

The [official majors-by-college index](https://undergrad.osu.edu/majors-and-academics/majors-by-college) supplies 151 discovery rows across 14 undergraduate index groups. These are not a complete universe of degree variants, campuses or historical versions.

Checkpoint, 2026-11-16: **3,920 downloaded source versions; 1,494 with course references; 134/151 index rows associated with references; 449 blocked/failed URLs; 0 unvisited links; 12 eight-semester candidates; zero human-approved plans.** Coverage remains partial. A reference/match is not a complete extracted curriculum.

Filters include college/program, document kind, academic year, explicit requirement term and GE system. Details show official URL, hash, dates, version evidence, references and supported semester previews. Unknown applicability remains unknown. Responses are paged; detailed course lists load on demand.

The archive retains original public HTML/PDF bytes and hashes. Course references use 242 official subjects/names observed from the anonymous catalog. Strict adapters handle explicit eight-semester HTML captions/grids and supported PDF columns. Mathematics supports centered year labels and paired totals. Alternatives retain public source evidence. Unsupported layouts, three-year combined programs, ambiguous credits and footnotes are not forced into eight semesters. Extraction is not approval. Budget-exceeding files retain their original bytes and explicit extraction status without blocking other sources.

## Operations and database

Use Node 24+, Python 3 and installed dependencies from the repository root:

```sh
# Preview only: no network/database operations without --apply.
pnpm planning:refresh --limit 100 --delay 2
# Crawl → PDF text → inventory → pending candidates.
pnpm planning:refresh --limit 100 --delay 2 --apply
# Revisit oldest checked sources, retaining prior versions.
pnpm planning:refresh --refresh --limit 100 --apply
# Explicitly retry failures.
pnpm planning:refresh --retry --limit 100 --apply
# Refresh public subject vocabulary for an explicitly selected term.
pnpm planning:subjects --term 1272

# Isolated embedded PostgreSQL; omit --apply to preview.
pnpm planning:archive init --local .planning-cache/public-db --apply
pnpm planning:archive archive data/planning/directory.json --local .planning-cache/public-db --apply
pnpm planning:archive curricula data/planning/curricula.json --local .planning-cache/public-db --apply
pnpm planning:archive status --local .planning-cache/public-db --apply
pnpm planning:archive backup .planning-cache/new-backup.tar.gz --local .planning-cache/public-db --apply
pnpm planning:archive seed program-requirements.json --local .planning-cache/public-db --apply
```

Use --cache <public-cache> for another cache location. The refresh command also accepts --archive-local <directory> --apply to initialize/archive after transformation. No scheduled job is installed. A reviewed task runner can invoke the bounded pipeline and retain its checkpoints; inspect the coverage/pending ledger after each run.

Only public HTTPS osu.edu and ohio-state.edu URLs are allowed. Credentials, identity/login hosts and arbitrary queries are rejected; a bounded public PDF VersionId is the sole query exception. Robots and every redirect are checked, DNS must resolve publicly, downloads cap at 8 MB, timeouts/redirects are bounded, and each origin is rate-limited (default two seconds, minimum one). Denials/failures remain pending. Never reuse HAR headers, student cookies, personal sessions or partner tokens.

Namespaces are osu_planning_dev in development and osu_planning in production; PLANNING_SCHEMA permits isolated names under that domain. All table access uses the dedicated helper.

| Table              | Retained data                                                                      |
| ------------------ | ---------------------------------------------------------------------------------- |
| source_document    | Immutable public URL/hash/fetch identity                                           |
| source_asset       | Hash-verified raw public bytes, extraction, classified metadata                    |
| source_extraction  | Immutable parser revisions, coordinate text and extraction dates for a public file |
| directory_snapshot | Dated discovery/coverage snapshots                                                 |
| curriculum_version | Distinct program/sample versions, applicability/review metadata                    |
| template_seed      | Strict requirements-only templates pending operator review                         |

For PostgreSQL omit --local and supply only dedicated PLANNING_DATABASE_URL; never infer it from course/account configuration. Initialize before importing. Transactions roll back failures; identical IDs are immutable no-ops; a different ID colliding on source/program/version fails. Changed evidence/review needs a new ID and version. Approval requires reviewer/date/source-validation date. Draft requirements cannot become authoritative approvals. Retention keeps all versions without automatic deletion.

Embedded backups are exclusive new files with restricted permissions; restore through PGlite loadDataDir in a disposable database. Native PostgreSQL backup uses node scripts/planning/database.mjs backup <new-file> --apply and pg_restore. Account backups exclude this domain. Native PostgreSQL connectivity/deployment/restore remain unvalidated here.

## Verification and limits

See [testing](../testing.md). Research covered 11 private text PDFs (71 pages), ten screenshots and offline HAR response JSON only. No HAR requests/cookies/headers were used; no private fixtures are checked in.

| Layout       | Documents | Course candidates | Known / unknown credits | Attendance semesters |
| ------------ | --------: | ----------------: | ----------------------: | -------------------: |
| Student Plan |         1 |                19 |                  15 / 4 |                    2 |
| Standard     |         4 |               158 |                 94 / 64 |                    0 |
| Compact      |         4 |                72 |                  0 / 72 |                    0 |
| Expanded     |         2 |               168 |                46 / 122 |                    0 |

Standard produced 372 rule/238 allocation candidates; Expanded 78/162. These are extraction counts, not semantic accuracy, degree totals or general recall. The HAR had 74 JSON responses; seven unambiguous overlapping observations agreed on credits/calendar years and one on explicitly planned status. Registration stayed unknown. Nine rule-tree/nine audit snapshots lacked reliable semantic node mapping; requirement precision/recall remain unmeasured.

All supplied pages had text layers. No OCR fallback is installed; local page rasterization, bounded worker/WASM assets, accuracy and mobile-memory evaluation remain prerequisites for one.

The 2026-11-16 automated run passed 575 Node tests (546 passed, 29 skipped), 99 main Python tests (two skipped) and 14 planning Python tests. Isolated PGlite verification covers original bytes, idempotence, unique versions, rollback and backup restore. Browser acceptance is recorded after final UI checks; the standalone browser script is a reproducible scenario, not evidence it ran.

### Browser acceptance — 2026-11-16

An isolated loopback production build preserved synthetic PDF/JSON sources and restored the saved workspace after reload. A moved course retained its original semester. The recommender combined CSE 2111 with the selected sample semester's CHEM 1220 into an 8-credit draft under a separate manual source. The downloaded version-2 JSON was inspected with three sources, five course rows and separate placement overrides. Missing evaluation configuration displayed unknown ratings. The observed evaluation POST contained only course codes, campus and empty instructor arrays, without program, term or personal source fields.

All five views were checked at 320/390/768/1440 widths, plus Chinese dark mode at 390, without document-level horizontal overflow. Requirement navigation defaulted to a program with rules and distinguished planned/completed coverage. The source dialog, official links, keyboard tab navigation, native desktop drag/drop and mobile course move menus were exercised. This connected-browser acceptance does not imply the standalone Playwright script ran, or establish audit semantic accuracy, prerequisites or meeting-conflict solving.

Public PDF text containing PostgreSQL jsonb-incompatible NUL/lone UTF-16 values uses U+FFFD with an explicit text-storage policy; original bytes/hashes remain unchanged. Public extraction caches are reused by content hash/parser revision, and unsupported documents retain reasons. Actual archive/restore counts are reported by the directory and database status.

The final real backup restored into an isolated database with 3,920 original sources, 641 extraction revisions, 19 curriculum versions including retained older candidates, and two directory snapshots. The current UI exposes 12 pending sample previews. Ten sampled restored source hashes matched.

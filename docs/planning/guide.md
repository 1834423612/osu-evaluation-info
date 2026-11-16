# Schedule planning

English · [简体中文](../zh-CN/planning/guide.md)

Open **Your space → Schedule planning** at /planning. The workspace opens on My plan, with Import & sources, Requirement map, Next semester, and Four-year examples available in the top navigation. A saved local workspace is restored on entry.

## Private import and review

Select up to 12 PDF/JSON files together, at most 60 MB total. Each text PDF is limited to 20 MB, 100 pages, 30,000 extracted lines and 60 seconds; JSON backups are limited to 4 MB. Scans and encrypted PDFs are unsupported. Layout detection uses content and transient filename hints. A failed/cancelled batch does not partially replace the draft.

### Recommended PDFs

Usually import two reports.

- **Student Plan** from Plan your Path supplies course placement, semesters and transfer/exam groups.
- **Official · Expanded (Beta)** from Track Progress supplies the detailed current-program audit. Expand the relevant programs and details, then print without browser headers and footers.
- Add **Planned · Expanded** when exploring another major or including future planned coursework. Select the matching report view in the import guide.

The 11 supplied PDFs were re-read on 2026-11-16. The supplied Expanded pair contains the Official audit. Intended majors are labelled “Only available in Planned View” in that report. The supplied Planned Standard report contributes an outline, while a Planned Expanded export is still needed for those majors' detailed conditions. The existing files therefore support Student Plan + Official Expanded + Planned Standard as an interim three-file import. Standard and Compact copies from the two navigation paths repeat academic content. The second Expanded print adds browser headers/footers. These duplicate copies add no necessary academic detail to the recommended import set.

Official/Planned describes the report view. Declared/undeclared describes each program. Program code, Applied Version, Catalog Term, publication year and GE system remain separate. Applied Version reflects the SIS plan/subplan requirement term. [Registrar guidance](https://registrar.osu.edu/buckeye-degree-planner/advisor-guide/requirement-terms-in-bdp/)

Review every extracted field. Audit alternatives are options, not attendance evidence. Student Plan observations, transfer/exam credits, placeholders, semester totals and unknown credits stay distinct. A blank/dash never becomes zero or an inferred share of a semester total. Conflicts retain source references. Grades, exception prose, GPA conditions and personal notes are excluded.

The source editor supports program/version correction, requirement hierarchy, all/any/numeric conditions and confirmed allocations. Inferred hierarchies begin unreviewed. Confirm workspace review before saving locally or exporting private JSON; edits invalidate review. Loading/replacing a nonempty draft requires confirmation. Unsaved input uses the shared navigation guard. One saved workspace holds multiple sources. Restoring JSON uses the same whitelist and requires renewed workspace review.

## Board and requirement map

Desktop drag/drop and native move selectors support pointer, keyboard and touch. Add semesters in Semester settings and filter planned courses by code. Search, recommendations, requirement branches and course inspection share the board's side panel. Small screens use a drawer/dialog with a selected target semester. Course additions reuse existing planned observations and placement overrides preserve original imported terms/pages. Completed, in-progress and transfer/exam observations protect matching planned rows in other documents from being moved.

Course titles, credit ranges and prerequisite wording use the existing anonymous catalog transport, scoped to campus and catalog term. Only public course identifiers are sent. The shared queue caches duplicate reads, limits concurrency and supports retry. A failed lookup keeps the source credit or an explicit pending state. Variable-credit courses show a range and remain outside automatic bundles until a fixed value is established. Original earned/imported credits remain in source review. Semester totals are planning estimates, with unresolved or conflicting entries shown separately.

The course inspector preserves full prerequisite wording and offers navigable course references, including inherited prefixes. This navigation does not evaluate the full prerequisite logic. Course details and section/evaluation links remain accessible from the same panel.

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

A 128-state beam search over at most 60 candidates counts the target semester’s existing courses before proposing additions within credit/prefix ceilings and reduces duplicate requirement-option rewards. This heuristic guarantees neither an optimum nor degree applicability. Courses supported only by other sample semesters stay out of automatic combinations. Unknown/conflicting credits are excluded from automatic combinations. Unresolved credits already in the target semester must be clarified before an additional bounded combination can be calculated. Individual courses can still enter reviewable drafts. Adding suggestions preserves original sources, reuses existing planned observations and creates manual rows only for new courses. Pending samples may omit coursework or use another requirement term.

The recommendation score loads ratings after **Load ratings for top 24**. Catalog metadata requests may also return evaluations through the existing catalog transport. The request includes those course codes, campus and empty instructor arrays; it excludes private IDs, program/version, terms, grades and status. Course links send the selected query through the catalog. Prerequisites, actual session offerings, seats and meeting conflicts require catalog/advisor checks. No registration is performed.

## Privacy and seeds

Parsing uses a bundled local PDF.js worker. Raw files/text, filenames, names, student IDs, contacts, advisors and grades are not persisted/exported. The worker is destroyed, line references cleared, and the input buffer wiped when not transferred/detached. JavaScript strings, garbage collection and browser-internal copies prevent guaranteed secure memory erasure; no such guarantee is made.

The version-2 whitelist stores enumerated provenance, local IDs, program codes/versions, terms, course codes, credits, numeric rule candidates, confirmed allocations and placement overrides. Version-1 backups upgrade on read. Storage key course-atlas:private-planning:v1 is separate from favorites/account sync/public exchange. Browser storage is unencrypted and can fail or be cleared. Course combinations remain potentially identifying. Exported JSON remains private; downloaded copies require separate deletion.

Planning suppresses first-party analytics/replay content and disposes of previously loaded recorders at its navigation entry. Normal account/session/resource requests can still occur. No private-plan upload, cloud sync or public contribution endpoint exists. Future cloud backup requires an explicit account-scoped design; favorites sync does not upload plans.

**Export requirement template** requires explicit per-program selection, workspace review, program code/Applied Version and reviewed hierarchy. Only remapped numeric rules/course options are downloaded: no actual student courses, semesters, allocations, declaration, remaining credits or source IDs. The operator seed archive marks these user-supplied templates pending; they never become official sources or automatically publish.

## Public sample coverage and adapters

The current gallery has **8 examples for 7 program tracks, covering 64 semesters**, checked on 2026-11-16. It includes CIS BA, CIS BS, CSE BS, two Molecular Genetics examples, Earth Sciences Geophysics, Earth Sciences Climate/Water/Environment, and Actuarial Science. Coverage remains partial. The historical discovery archive remains available through the directory API and explicit discovery tooling.

`data/planning/sample-sources.json` records the inspected URLs, linked downloads, structure and exclusion reasons before adapter development. The default refresh follows this registry. It downloads seven HTML/PDF sources and three linked Word originals. HTML/PDF originals and structured versions are archived in the planning database. Word originals and hashes stay in the public download cache. Each adapter requires eight nonempty semester assignments and stops on layout drift.

CIS BA uses captioned Course/Hours tables. CIS BS and CSE BS use paired Autumn/Spring columns with merged Year headings. Molecular Genetics uses year/season headings and lists. Earth Sciences uses a Year/Autumn/Spring grid, with bullet alternatives kept in one choice group. Actuarial Science uses the PDF's second-page year/column structure. Electives, incomplete course codes, conditional credits and source totals remain visible. Conditional exclusions produce no course-add buttons. Fisher Information Systems requirement lists are excluded from the sample gallery because they lack eight-semester assignments.

The CIS BS and CSE BS Word downloads show STAT 3470 as 4 credits, while their HTML schedules show 3. The gallery explicitly identifies its HTML source and the difference. Course cards use catalog credits. The Actuarial PDF footer says revised 2/11/2025 despite its 2024 filename. Unknown Applied Version and applicability remain unset. Extraction review status remains pending.

## Operations and database

Use Node 24+, Python 3, curl and installed repository dependencies.

```sh
# Preview the inspected-source pipeline.
pnpm planning:refresh
# Download registered sources, extract PDFs and generate semester samples.
pnpm planning:refresh --apply
# Re-fetch registered sources and retain changed versions.
pnpm planning:refresh --refresh --apply
# Refresh and archive to an isolated embedded PostgreSQL database.
pnpm planning:refresh --apply --archive-local .planning-cache/public-db
# Explicit broad discovery remains available for research.
pnpm planning:refresh --discovery --limit 100 --delay 2 --apply
# Refresh public subject vocabulary for a selected catalog term.
pnpm planning:subjects --term 1272

pnpm planning:archive status --local .planning-cache/public-db --apply
pnpm planning:archive backup .planning-cache/new-backup.tar.gz --local .planning-cache/public-db --apply
pnpm planning:archive seed program-requirements.json --local .planning-cache/public-db --apply
```

The inspected-source default cache is `.planning-cache/samples`. `--cache <directory>` selects another public cache. Failed refreshes retain the previous generated outputs. The targeted source ledger is `data/planning/sample-directory.json`. Broad discovery uses `.planning-cache` by default and retains its existing directory format. Broad discovery writes experimental candidates to `<cache>/discovery-curricula.json`, keeping the curated gallery separate. No scheduled job is installed.

Only public HTTPS osu.edu and ohio-state.edu URLs are allowed. Credentials, identity/login hosts and arbitrary queries are rejected; a bounded public PDF VersionId is the sole query exception. Robots and every redirect are checked, DNS must resolve publicly, downloads cap at 8 MB, timeouts/redirects are bounded, and each origin is rate-limited (default two seconds, minimum one). Some public Drupal pages reject urllib transport, so a bounded anonymous curl retry uses its default client, ignores curl configuration and follows no redirects. Denials/failures remain pending. Never reuse HAR headers, student cookies, personal sessions or partner tokens.

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

Standard produced 368 rule/238 allocation candidates; Expanded 78/162. These are extraction counts, not semantic accuracy, degree totals or general recall. The HAR had 74 JSON responses; seven unambiguous overlapping observations agreed on credits/calendar years and one on explicitly planned status. Registration stayed unknown. Nine rule-tree/nine audit snapshots lacked reliable semantic node mapping; requirement precision/recall remain unmeasured.

All supplied pages had text layers. No OCR fallback is installed; local page rasterization, bounded worker/WASM assets, accuracy and mobile-memory evaluation remain prerequisites for one.

On 2026-11-16, the full Node suite reported 588 tests, with 559 passing, 29 skipped and no failures. Production build, TypeScript, ESLint, CSS and bilingual-document checks passed. Focused coverage includes parser/import privacy, catalog request allowlists, source preservation, protected records, recommendation limits, sample alternatives, database transactions and backup restoration.

Browser acceptance used synthetic data in an isolated loopback production build. All five views had no horizontal overflow at Chinese widths 320/390/768/1440 and English widths 390/1440. Verified flows included public catalog search, course addition and inspection, touch-friendly semester movement, requirement drawers, saving and automatic restoration. A recommendation with 11 existing credits added one 4-credit course and retained the 15-credit ceiling. The eight-example gallery exposed source differences and eight-term layouts. The updated standalone browser script was syntax-checked but was not executed during this acceptance run.

Public PDF text containing PostgreSQL jsonb-incompatible NUL/lone UTF-16 values uses U+FFFD with an explicit text-storage policy. Original bytes/hashes remain unchanged. Extraction caches are reused by content hash/parser revision and unsupported documents retain reasons.

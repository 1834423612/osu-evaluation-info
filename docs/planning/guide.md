# Schedule planning

English · [简体中文](../zh-CN/planning/guide.md)

Open **Your space → Schedule planning** (`/planning`). Choose Student Plan, Standard Audit, Expanded Audit (Beta), or Compact Audit, and specify BDP export or browser print. Start with Student Plan and compare a Planned Standard audit separately; Expanded can supply additional constraint context. The default import action appends a separate source snapshot to the workspace. Matching course codes never silently replace another observation. Choose Replace only when you intend to discard the draft; export it first if needed.

## Local workflow

1. Choose a text PDF, at most 20 MB and 100 pages. Password-protected and scanned PDFs are unsupported. Extraction runs through a bundled local PDF.js worker; no external PDF service receives the file.
2. Check each candidate against the original document. Edit subject, number, credits, type and source status; remove incorrect rows and add missing courses or semesters. Empty credits mean unknown. Semester labels use `Autumn2026`, `Spring2027`, or `Summer2027`.
3. Keep Applied Version (for example `AU2017`) separate from Catalog Term. Applied Version reflects SIS plan/sub-plan requirement terms, not the PDF publication date or admission year. Different requirements may use different versions; conflicting versions remain unknown.
4. Confirm review, then save in this browser or export structured JSON. Editing invalidates review. The current browser holds one saved workspace containing multiple source snapshots; loading or explicitly replacing a nonempty draft requires confirmation. Deleting the local plan removes that workspace and clears the draft. Editing, loading, deleting or cancelling invalidates pending import generations so late extraction cannot overwrite the new state. Exported files must be deleted separately.

The page reuses course search links for catalog details and evaluations. Opening a course sends that selected course query through the existing search workflow; the PDF and the rest of the plan are not included.

## Interpretation limits

This is a candidate extractor and planning editor, not a graduation audit, prerequisite solver, registration system or timetable conflict checker. Coverage has not been validated across all BDP exports. Research used one student's family of layouts; no private attachments or their text are checked in. Automated fixtures are synthetic.

Standard and Expanded audits can repeat a course across requirement nodes. Candidates are deduplicated within the same extracted group; there is no summed audit-credit total or merged remaining-credit calculation. Audit terms remain unassigned. Compact's two-column layout has limited support. Browser-print order is also untrusted and remains unassigned. Transfer and examination credits must not be assigned a normal attendance semester without review. Unsupported formatting may yield no candidates; manually enter the missing items. Expanded numeric credit/course minimums and all/any group markers can become requirement candidates. Indentation-derived hierarchy, rules and allocations each require explicit verification. Unsupported clauses, exceptions, GPA rules and prerequisite logic are not solved; raw prose and grades are not stored. Standard and Compact requirement trees still need manual reconstruction.

A course number does not establish that an item is an actual course: a placeholder may have one. “Planned” in the PDF does not prove that a course is unregistered. A reported semester total of 13 credits does not determine the credits of placeholders marked `-`; they stay unknown. Course candidates and reported totals are separate facts. Verify degree requirements and registration with an advisor.

## Privacy boundary

Raw files, filenames, names, student IDs, contacts, advisor fields, grades, free-text notes and raw extracted text are not persisted or exported. Extraction memory is released after processing and worker teardown. The version-2 private schema permits enumerated source information, local reference IDs, program codes, separate program versions, terms, course codes, credit provenance, numeric rule candidates, allocations, page references and review state. Version-1 snapshots are upgraded on read. Program and requirement fields must contain academic codes, never personal names. Unknown fields are stripped at the save boundary. Browser storage can fail or be cleared; export a copy when needed. Local storage is not encrypted and is accessible to people or scripts with access to this browser profile.

Course combinations remain potentially identifying even after names are removed. JSON is private information, not an anonymous public dataset. No contribution or public sharing endpoint is implemented. A future shared library must use a separate explicit opt-in workflow and server-side whitelist; private snapshots must never become public curriculum seeds.

Planning suppresses first-party events and analytics payloads. Its content is blocked from replay, and the navigation entry performs a full document navigation to dispose of previously loaded recorders. No original PDF, extracted text or identity is sent in diagnostics. Existing account/session and site-resource requests can still occur independently of planning; “local PDF” does not mean the entire website makes no network requests.

## Official curriculum directory

The checked-in directory contains twelve source entrances, one structured Molecular Genetics example pending human review, and zero human-approved structured plans. It does not cover all OSU majors. The university majors-by-college index is a discovery baseline, not a curriculum API. Programs, departments and paginated search results are different populations. History can be incomplete or advisor-only.

Source records and curriculum versions are distinct from private plans. A version retains source URL, SHA-256, fetch/validation dates, source kind, program, specialization, campus, GEN/GEL, applicability, evidence, credit ranges and review state. Unknown applicability remains null. A sample plan is never promoted to formal requirements. Adapters support the Molecular Genetics page and strict public HTML tables with eight explicit semester captions and Course/Credits columns. Unknown alternatives or table layouts remain pending rather than being flattened. The Molecular Genetics preview preserves course alternatives in public source evidence; consult the original footnotes. Official PDFs remain unsupported for automatic structuring. Publication state (including draft), single/multiple-program scope and academic year are separate from source version, Applied Version and Catalog Term. Drafts cannot be approved as authoritative requirements. The directory includes a double-major sample, a composition draft, a mathematics substitution reference and a geology sample with variable offerings; none establishes universal requirements.

Official references:

- [University majors by college](https://undergrad.osu.edu/majors-and-academics/majors-by-college)
- [Molecular Genetics sample curriculum](https://molgen.osu.edu/sample-curriculum)
- [Registrar: requirement terms in BDP](https://registrar.osu.edu/buckeye-degree-planner/advisor-guide/requirement-terms-in-bdp/)

## Operations and architecture

The browser imports `src/lib/planning/model.ts`, `parser.ts` and lazily loads PDF.js through `pdf.ts`. Private storage uses `course-atlas:private-planning:v1`, separate from favorites, account sync and public exchange. No private-plan backend exists. `snapshots.ts` remaps references when appending sources and retains per-program remaining credits without summing them. Deleting a source removes its dependent rules and allocations. `SourceReview` exposes program-specific versions, nested all/any/minimum rules, credit origin correction and explicit allocation review. Course observations with the same code are counted once per reviewed rule; conflicting credit observations stay unresolved. Root-level version fields are compatibility summaries; document/program records carry the detailed provenance.

Public curriculum data uses `osu_planning` in production and `osu_planning_dev` in development. `PLANNING_SCHEMA` permits isolated names starting with `osu_planning_`. `source_document` stores immutable source identities; `curriculum_version` stores explicit sample/requirement versions and review metadata. All SQL resolves the dedicated namespace helper. This unrelated domain has its own initialization, backup and retain-all policy; account backups do not include it.

Run from the repository root:

```sh
# Public network requests, bounded and credential-free. Writes only the local cache.
python3 scripts/planning/sync.py --delay 2 --limit 8
# Resume remaining discovery; --refresh explicitly revisits downloaded sources.
python3 scripts/planning/sync.py --delay 2 --limit 20
# Local transformation only; all candidates remain pending.
python3 scripts/planning/structure.py
# Print operation plans; these do not connect to PostgreSQL.
node scripts/planning/database.mjs init
node scripts/planning/database.mjs retention
# With an isolated PLANNING_DATABASE_URL, explicitly apply:
node scripts/planning/database.mjs init --apply
node scripts/planning/database.mjs import <candidate.json> --apply
node scripts/planning/database.mjs backup <new-backup.dump> --apply
```

Use a disposable PostgreSQL database and test credentials first. Only `PLANNING_DATABASE_URL` is required for planning database commands; no production credentials are needed for local editing, parser tests, lint, typecheck or build. The app's existing optional services remain governed by `.env.example`. Never reuse student cookies, HAR credentials, partner API tokens, or login sessions for discovery. Do not commit private attachments, HARs or extracted student text.

The crawler permits public HTTPS `osu.edu` domains, rejects credentials/query strings and automatic redirects, checks robots, waits at least one second between requests (default two), caps downloads at 8 MB and checkpoints atomically. Request failures, disallowed robots and unknown formats remain pending. The cache preserves previous fetched versions on refresh. It does not publish or infer requirements. Inspect `state.json` counts for discovered/downloaded/pending and generated candidates separately. A cron runner may call these idempotent tools after review; no scheduled production job is installed by this feature.

Review source content and footnotes, applicability and substitutions before approving any candidate. Approval requires reviewer, review date and source-validation date. Imports use transactions and immutable insert semantics: reimporting an ID is a no-op. Corrections or changed review decisions require a new ID **and** version. Backups are explicit `pg_dump` custom archives; verify restoration in a disposable database. Retention keeps all source and curriculum versions; there is no automatic delete command or production retention job.

## Verification

See [testing](../testing.md) for individual scripts. The browser scenario creates its PDF in memory and checks import, correction, review gating, storage/export, sources, Chinese/English and 320/390/768/1440-pixel light/dark layouts. It also inspects outgoing POST bodies for synthetic private content. Live PostgreSQL and full browser validation require a reachable isolated server and a browser-capable environment. A blocked run is not a pass.

### Verification record — 2026-11-15

The initial release passed lint/typecheck/build and 474 Node tests, with 27 skipped. Subsequent local regression found and repaired missing table credits/term headings, honors-code suffixes misread as credit counts, and stale asynchronous imports. Private PDF processing stayed local; no originals, filenames, text, credentials or student fields were committed or logged. A subsequent explicitly authorized comparison used HAR response JSON offline only; no credentials or requests were used.

| PDF type       | Documents | Import failures after repair | Course candidates | Known / unknown course credits | Assigned attendance semesters |
| -------------- | --------: | ---------------------------: | ----------------: | -----------------------------: | ----------------------------: |
| Student Plan   |         1 |                            0 |                19 |                         15 / 4 |                             2 |
| Standard Audit |         4 |                            0 |               158 |                        0 / 158 |                             0 |
| Compact Audit  |         4 |                            0 |                72 |                         0 / 72 |                             0 |
| Expanded Audit |         2 |                            0 |               168 |                        0 / 168 |                             0 |

These are type-level extraction counts, not independent accuracy/recall scores or degree totals. Transfer/examination groups remain separate from attendance semesters. Expanded produced 78 rule candidates and 162 allocation candidates across two documents; all inferred hierarchies and allocations start unverified. Standard/Compact rule trees, arbitrary programs and unsupported constraints still require manual review. Audit course credits remain unknown rather than guessed. A single student's export family does not establish support for all BDP outputs.

The isolated in-memory PostgreSQL integration test executes the real schema, repeated initialization, approval checks, foreign keys and rollback. It uses PGlite, not a networked PostgreSQL service. Native `pg` connectivity and `pg_dump` backup/restore remain untested. Synthetic PDF.js integration passes with a standard-font-data-path warning.

The bounded official crawl downloaded eight initial entrances and discovered 146 links; the expanded twelve-entry registry does not claim twelve fully structured curricula. Two Molecular Genetics candidates were generated, one pending preview is checked in and zero plans are human-approved. The generic table adapter is verified with synthetic fixtures only.

Browser execution remains environment-blocked: Chromium previously failed with `socket() failed: Operation not permitted`; the cloud browser returned `ERR_CONNECTION_REFUSED`. The final production-build retry reached the local server successfully, but Chromium again failed at socket creation before browser assertions could run. No public port or user-local service is used. Actual mobile/tablet/desktop interactions, screenshots and network assertions are not passes until the browser scenario completes.

Final regression checks: `pnpm lint`, `pnpm typecheck` and `pnpm build` passed. `pnpm test` ran 514 tests: 487 passed, 27 skipped, zero failures. `pnpm test:python` ran 99 tests with two skipped; the separate planning Python suite passed four tests.

## Offline HAR comparison and OCR decision

The opt-in private regression accepts `PLANNING_PRIVATE_HAR_COMPARE=1` alongside `PLANNING_PRIVATE_PDF_DIR`. It reads only response bodies, handles the JSON anti-XSSI prefix and base64 encoding, and emits aggregate counts. It never sends requests or persists extracted records. Keep the archive and all attachments outside Git and public CI. This is a developer regression tool, not a browser HAR upload feature.

The supplied archive yielded 74 JSON responses. Its identifiable plan-shaped response contained two semester groups, seven course observations and four placeholders. All seven unambiguous course observations matched the Student Plan candidate credits and calendar years; both semester groups were internally consistent and the placeholder counts agreed. One explicitly planned observation agreed. All seven registration statuses were unknown in the comparison schema; no enrollment claim follows. These are agreement counts for a single student's overlapping snapshots, not general parser accuracy, recall or complete audit verification. Nine requirement-tree and nine audit snapshots were detected, but no reliable semantic node mapping to the PDF was established; requirement precision and recall remain unmeasured. The 78 Expanded rule candidates and 162 allocation candidates still require review.

All 71 pages across the 11 private PDFs had a text layer. Coordinate extraction therefore remains the preferred path; the observed failures involved layout and token interpretation. No OCR dependency or fallback was added, and image-only scans remain unsupported. Browser OCR is technically feasible using a worker and WebAssembly, but [Tesseract.js does not directly accept PDF files](https://github.com/naptha/tesseract.js/blob/master/README.md); pages would first need local rasterization. An eventual optional fallback must bundle and pin its worker, WASM and language assets, avoid remote inference and CDN requests during document processing, bound resolution/page count/memory, support cancellation, and require preview. OCR can confuse course codes, suffixes and decimal credits and does not solve two-column order or requirement semantics. Mobile memory and latency, scanned-page accuracy and offline asset loading have not been benchmarked. A text-bearing corpus supplies no evidence that OCR would improve this task.

### Local browser acceptance — 2026-11-16

A production build was exercised in desktop Chrome against an isolated loopback service without production configuration. Three private documents were imported locally: Student Plan produced 19 course candidates, Planned Standard added 65, and Expanded browser print added 84. All 168 observations remained separate; selecting the first source showed its 19 rows. These counts are not semantic accuracy scores or graduation totals. No real document was marked reviewed or saved during this acceptance run.

A separate synthetic manual course verified the review gate, local save, JSON download, edit-triggered review invalidation, and loading the saved value after refresh. The source directory displayed twelve links and zero human-approved plans. Both languages and light/dark layouts were inspected at 320, 390, 768 and 1440 pixels without horizontal overflow after repair. Planning form styles no longer override shared navigation buttons; narrow navigation wraps into two rows and dark navigation receives a readable foreground token.

The complete observed request window covering the three production-build imports contained no POST request; PDF.js and its worker were loaded from the local app. An installed browser extension made its own resource request. This verifies the observed application flow, not third-party extension behavior or all possible future requests. Development-mode CSS hot replacement and extension-injected attributes caused transient development errors; the production import run did not produce new application errors. The standalone Playwright script was not executed in this pass; equivalent flows were exercised through the connected browser, and its width matrix now includes 320 pixels.

Final code checks passed lint, typecheck and build. The Node suite reported 514 tests, 487 passed and 27 skipped, with no failures; all 27 planning-specific tests passed. Native PostgreSQL, backup/restore, Compact browser import, semantic rule accuracy and university-wide curriculum coverage remain outside this acceptance result.

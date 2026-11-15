# Schedule planning

English · [简体中文](../zh-CN/planning/guide.md)

Open **Your space → Schedule planning** (`/planning`). Choose Student Plan, Standard Audit, Expanded Audit (Beta), or Compact Audit, and specify BDP export or browser print. Start with Student Plan and compare a Planned Standard audit separately; Expanded can supply additional constraint context. Imports are separate snapshots, not an automatic merge. Export the current draft before replacing it.

## Local workflow

1. Choose a text PDF, at most 20 MB and 100 pages. Password-protected and scanned PDFs are unsupported. Extraction runs through a bundled local PDF.js worker; no external PDF service receives the file.
2. Check each candidate against the original document. Edit subject, number, credits, type and source status; remove incorrect rows and add missing courses or semesters. Empty credits mean unknown. Semester labels use `Autumn2026`, `Spring2027`, or `Summer2027`.
3. Keep Applied Version (for example `AU2017`) separate from Catalog Term. Applied Version reflects SIS plan/sub-plan requirement terms, not the PDF publication date or admission year. Different requirements may use different versions; conflicting versions remain unknown.
4. Confirm review, then save in this browser or export structured JSON. Editing invalidates review. The current browser holds one saved snapshot; explicitly loading or importing over a nonempty draft requires confirmation. Deleting the local plan removes that snapshot and clears the draft. Exported files must be deleted separately.

The page reuses course search links for catalog details and evaluations. Opening a course sends that selected course query through the existing search workflow; the PDF and the rest of the plan are not included.

## Interpretation limits

This is a candidate extractor and planning editor, not a graduation audit, prerequisite solver, registration system or timetable conflict checker. Coverage has not been validated across all BDP exports. Research used one student's family of layouts; no private attachments or their text are checked in. Automated fixtures are synthetic.

Standard and Expanded audits can repeat a course across requirement nodes. Candidates are deduplicated within the same extracted group; there is no summed audit-credit total or merged remaining-credit calculation. Audit terms remain unassigned. Compact's two-column layout has limited support. Browser-print order is also untrusted and remains unassigned. Transfer and examination credits must not be assigned a normal attendance semester without review. Unsupported formatting may yield no candidates; manually enter the missing items. Raw requirements, detailed constraints, exceptions and grades are not imported.

A course number does not establish that an item is an actual course: a placeholder may have one. “Planned” in the PDF does not prove that a course is unregistered. A reported semester total of 13 credits does not determine the credits of placeholders marked `-`; they stay unknown. Course candidates and reported totals are separate facts. Verify degree requirements and registration with an advisor.

## Privacy boundary

Raw files, filenames, names, student IDs, contacts, advisor fields, grades, free-text notes and raw extracted text are not persisted or exported. Extraction memory is released after processing and worker teardown. The private schema permits only enumerated source information, terms, course codes, credit values, page references and review state. Unknown fields are stripped at the save boundary. Browser storage can fail or be cleared; export a copy when needed. Local storage is not encrypted and is accessible to people or scripts with access to this browser profile.

Course combinations remain potentially identifying even after names are removed. JSON is private information, not an anonymous public dataset. No contribution or public sharing endpoint is implemented. A future shared library must use a separate explicit opt-in workflow and server-side whitelist; private snapshots must never become public curriculum seeds.

Planning suppresses first-party events and analytics payloads. Its content is blocked from replay, and the navigation entry performs a full document navigation to dispose of previously loaded recorders. No original PDF, extracted text or identity is sent in diagnostics. Existing account/session and site-resource requests can still occur independently of planning; “local PDF” does not mean the entire website makes no network requests.

## Official curriculum directory

The checked-in directory contains eight source entrances, one structured Molecular Genetics example pending human review, and zero human-approved structured plans. It does not cover all OSU majors. The university majors-by-college index is a discovery baseline, not a curriculum API. Programs, departments and paginated search results are different populations. History can be incomplete or advisor-only.

Source records and curriculum versions are distinct from private plans. A version retains source URL, SHA-256, fetch/validation dates, source kind, program, specialization, campus, GEN/GEL, applicability, evidence, credit ranges and review state. Unknown applicability remains null. A sample plan is never promoted to formal requirements. The source adapter supports Molecular Genetics HTML only, preserves alternatives as evidence for review, and rejects layouts without eight recognized semesters. The checked-in preview compresses prose into course-code facts and does not reproduce all footnotes; consult its linked source before using it. Other formats remain pending.

Official references:

- [University majors by college](https://undergrad.osu.edu/majors-and-academics/majors-by-college)
- [Molecular Genetics sample curriculum](https://molgen.osu.edu/sample-curriculum)
- [Registrar: requirement terms in BDP](https://registrar.osu.edu/buckeye-degree-planner/advisor-guide/requirement-terms-in-bdp/)

## Operations and architecture

The browser imports `src/lib/planning/model.ts`, `parser.ts` and lazily loads PDF.js through `pdf.ts`. Private storage uses `course-atlas:private-planning:v1`, separate from favorites, account sync and public exchange. No private-plan backend exists.

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

See [testing](../testing.md) for individual scripts. The browser scenario creates its PDF in memory and checks import, correction, review gating, storage/export, sources, Chinese/English and 390/768/1440-pixel light/dark layouts. It also inspects outgoing POST bodies for synthetic private content. Live PostgreSQL and full browser validation require a reachable isolated server and a browser-capable environment. A blocked run is not a pass.

### Verification record — 2026-11-15

- `pnpm lint`, `pnpm typecheck` and `pnpm build` passed.
- `pnpm test`: 501 tests, 474 passed, 27 skipped, zero failures. Skipped cases require their optional services or test flags and are not passes.
- `pnpm test:python`: 99 tests, two skipped; the separate planning Python suite passed three tests.
- PDF.js integration passed with a synthetic PDF. A standard-font-data-path warning was emitted; extraction assertions passed. No parser regression was run against the user's real attachments.
- Bounded official crawl: eight entrances downloaded, 146 links discovered, two pending structured candidates; one pending preview is checked in, zero human-approved plans.
- Database command dry-runs passed; no isolated PostgreSQL was available, so actual migration, import and backup/restore were not run.
- Browser testing was environment-blocked: Chromium failed at startup with `socket() failed: Operation not permitted`; the cloud browser returned `ERR_CONNECTION_REFUSED` for the local development port. Import UI and actual 390/768/1440-pixel interaction, visual and network assertions remain unverified. No public port was exposed.

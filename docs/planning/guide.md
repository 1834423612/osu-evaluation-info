# Schedule planning

English · [简体中文](../zh-CN/planning/guide.md)

Open **Your space → Schedule planning** at `/planning`. The workspace has Plans, Progress, Four-year examples and Reports. Import creates a usable plan immediately and saves changes automatically on this device. There is no mandatory row-by-row review or save approval.

## Bring two reports

1. **Student Plan**: in BDP **Plan your Path**, print/export the plan. This supplies semester placement, actual courses, transfer credits and exam credits.
2. **Official · Expanded**: in **Track Progress**, select Official, open the audit print menu, choose Expanded (Beta), and enable **Include all constraints**. Include the relevant programs and save the print preview as PDF without browser headers/footers.
3. Add **Planned · Expanded** when exploring undeclared majors or future-course requirements. Switch the view and intended plan before exporting. Standard is an outline fallback when Expanded is unavailable; Compact and duplicate exports are unnecessary.

The supplied 11 PDFs were compared on 2026-11-16. Their Expanded pair contains the Official audit; intended majors marked “Only available in Planned View” need another report. For this attachment set, Student Plan + Official Expanded + Planned Standard is the useful interim combination. Planned Expanded is preferable for the intended majors' full conditions.

Choose several files with the main import button. Content and transient filename hints identify layouts and report views. The Reports page also has three report-specific import buttons for unlabelled files. Unknown views remain separate instead of being silently treated as Official or Planned. Declaration, report view, Applied Version, Catalog Term and publication year are separate fields.

Up to 12 files and 60 MB per batch are supported. Each text PDF is limited to 20 MB, 100 pages, 30,000 lines and 60 seconds; JSON backups to 4 MB. Encrypted PDFs and scans are unsupported. A failed file is reported without discarding successfully parsed files; cancellation or a late result cannot overwrite a newer edit.

## Plan and inspect in one workspace

The board groups Autumn/Spring and optional Summer by academic year. Drag courses on desktop or use the move selector with touch/keyboard. Add years, search within the board, select a dashed requirement placeholder to find matching courses, and replace it with a concrete course. The side panel contains Remaining, Search and Recommend; mobile uses a drawer. Transfer and exam credits have separate groups.

Positive completed/current attendance evidence protects courses across reports. An audit option is not proof of attendance. Student Plan determines semester placement; later edits use separate placement overrides. The Progress tree shows full academic titles, nested requirements, alternatives, numeric constraints and the BDP status reported at export. Course details and prerequisite references open beside the plan or in a dialog. Changes here do not recompute the official BDP audit.

Course cards query the existing anonymous catalog for titles, credits and prerequisites in the selected campus/term. Only public course identifiers and catalog context are sent. Duplicate reads share a bounded queue/cache. Imported historical credits remain unchanged. Variable ranges stay ranges; unresolved credits use a pending label. Original BDP semester totals are labelled separately from current planning estimates. GE placeholders use exact catalog attributes; an ambiguous course family offers actual catalog variants instead of inventing a course number.

## Recommendations

Recommendations exclude completed/current courses even when another report calls them planned, and exclude courses already placed in the target semester. They draw from remaining requirement options, existing future plans and an optional public sample. The default program prefers an intended major with course options. Advanced semester, workload, sample and evaluation controls are collapsed; users can choose a credit ceiling and a maximum count of courses from selected prefixes.

The local score combines requirement evidence (45 points for structurally verified rules, 15 for other imported options), matching sample year/season (25), another sample term (8), planned observations (10), evaluation (0–15) and conflicting observations (−20). Summer terms retain their explicit year/season. Ratings use `(score × responses + 3.6 × 20) / (responses + 20)`; missing ratings stay unknown and use a neutral baseline. SEI and SSLE are not pooled. Loading ratings is an explicit action and sends course codes/campus only.

A 128-state beam search over at most 60 candidates includes courses already in the target semester when enforcing credit/prefix ceilings. It reduces repeated rewards for alternatives to the same requirement. Unknown/variable/conflicting credits cannot enter an automatic bounded combination. Unknown credits already in that semester prevent claiming a valid total; individual additions remain available. This is a planning heuristic, not a prerequisite/seat/time-conflict solver or an official degree audit. It does not infer mathematical ability from personal data.

## Privacy and storage

PDF.js runs in a bundled local worker. Names, student identifiers, email addresses, advisor fields, grades, original filenames and raw PDF/text are excluded from saved/exported plans. The whitelist retains academic titles/codes, status evidence, program/version context, numeric requirements, provenance references and placement overrides. Academic combinations can still be identifying; a backup is private data.

The worker is destroyed, line references cleared and any still-owned input buffer wiped. JavaScript strings, garbage collection and browser-internal copies prevent a guarantee of secure memory erasure. Original files in Downloads are not deleted.

The version-2 model upgrades version-1 backups on read. Local key `course-atlas:private-planning:v1` is separate from favorites, account sync and public exchanges. Browser storage is unencrypted and may fail or be cleared; save failures are shown. Use **Backup** to download `course-atlas-plan.json`. Raw PDFs are never uploaded. Planning suppresses first-party replay/analytics content, though normal resource/account requests can occur. There is no private-plan cloud sync or public contribution endpoint. Requirements-only seed utilities remain operator tools, with an explicit review gate; they do not publish private plans.

## Public sample coverage

The 2026-11-16 dataset contains **63 samples, 514 semester assignments and 49 program/track labels across six colleges**. These are not 63 independent majors. Coverage remains partial.

| College                     | Program/track source entries |
| --------------------------- | ---------------------------: |
| Arts and Sciences           |                           29 |
| Engineering                 |                           16 |
| Social Work                 |                            1 |
| Education and Human Ecology |                            1 |
| Nursing                     |                            1 |
| Public Health               |                            1 |

The inspected registry is `data/planning/sample-sources.json`: 49 source pages/PDFs plus three linked Word originals. Each entry records its URL, layout, version evidence and adapter before automated refresh. Adapters preserve explicit semesters, optional summers, placement variants, alternatives and placeholders. Mathematics major-only sequences and legacy GEL plans are labelled. Four-year examples may include five-year placement routes; term count is shown. Requirements-only and annual-only lists stay outside this gallery. Broad discovery metadata is not evidence of an available sample.

Source discrepancies are retained: CIS BS/CSE Word and HTML disagree on STAT 3470 credits; the Materials Science filename and printed academic year differ; Public Health Environmental Health Autumn 2 prints 14 credits while its five entries sum to 17. Original totals and course values remain distinct. Unknown Applied Version is not invented. Extracted samples remain pending certification of academic applicability.

## Refresh and archive

Use Node 24+, Python 3, curl and installed repository dependencies.

```sh
pnpm planning:refresh
pnpm planning:refresh --apply
pnpm planning:refresh --refresh --apply
pnpm planning:refresh --apply --archive-local .planning-cache/public-db
pnpm planning:archive status --local .planning-cache/public-db --apply
pnpm planning:archive backup .planning-cache/new-backup.tar.gz --local .planning-cache/public-db --apply
pnpm planning:refresh --discovery --limit 100 --delay 2 --apply
pnpm planning:subjects --term 1272
```

Without `--apply`, refresh prints its intended commands. The default public cache is `.planning-cache/samples`; `--cache` selects another. Sources are hash-verified, changed versions retained and layout drift stops generation. Generated files are `curricula.json` and `sample-directory.json` under `data/planning`. Broad discovery writes experimental candidates to its cache rather than replacing the gallery. No scheduled job is installed.

Only public HTTPS OSU domains are accepted. Credentials, identity/login hosts and arbitrary queries are rejected; a bounded public PDF VersionId is the sole query exception. Robots, redirects and public DNS are checked. Downloads cap at 8 MB with bounded timeouts/redirects and per-origin delay (default two seconds, minimum one). A bounded anonymous curl retry handles some public Drupal transport rejections; it ignores curl configuration and follows no redirects. Never reuse HAR headers, cookies, student sessions or partner tokens.

The dedicated schemas are `osu_planning_dev` and `osu_planning`; `PLANNING_SCHEMA` permits isolated names in that domain. Native PostgreSQL requires explicit `PLANNING_DATABASE_URL`; course/account database settings are never inferred.

| Table              | Retained data                                                         |
| ------------------ | --------------------------------------------------------------------- |
| source_document    | Immutable public URL/hash/fetch identity                              |
| source_asset       | Hash-verified original public bytes, extraction and metadata          |
| source_extraction  | Immutable parser revisions and coordinate text                        |
| directory_snapshot | Dated coverage snapshots                                              |
| curriculum_version | Separate source/parser/variant versions and applicability metadata    |
| template_seed      | Reviewed requirements-only input, pending operator publication review |

Archive operations are transactional and repeatable; unique identities cannot silently overwrite another variant. Changed parsing uses a new version. Backups are exclusive new files with restricted permissions. PGlite restoration is tested in a disposable database. Native PostgreSQL deployment/connectivity/restore is not validated by those tests. No cloud database was modified for this update. Public PDF NUL/lone-surrogate text is stored as U+FFFD with an explicit policy; original bytes/hash remain unchanged.

## Verification and limits

See [testing](../testing.md). Local private regression covers 11 PDFs/71 pages and offline HAR **response JSON only**; requests, cookies and headers are never replayed. No private attachment fixtures are committed.

| Layout       | Documents | Course candidates | Known / unknown credits |
| ------------ | --------: | ----------------: | ----------------------: |
| Student Plan |         1 |                19 |                  15 / 4 |
| Standard     |         4 |               158 |                 98 / 60 |
| Compact      |         4 |                72 |                  0 / 72 |
| Expanded     |         2 |               168 |                46 / 122 |

The merged roster has eight completed, six current and five planned entries. Fifteen unambiguous roster overlaps agree with HAR on status and credits; seven semester overlaps agree on placement and credits. Comparable requirement edges match for Expanded (28/28), Planned Standard (65/65) and Official Standard (8/8). These are overlap checks, not total audit recall; HAR contains requirements absent from the supplied PDF views. Minimum-grade, GPA, residency, substitutions and all logical constraints are not fully evaluated. Source academic headings may retain a required GPA threshold, but no student's GPA is retained.

Browser acceptance exercises real-file automatic import, catalog-backed credits, placeholder replacement, same-page details, movement persistence and responsive layouts. Automated suites cover whitelist/privacy, status reconciliation, requirement ancestry, recommendation exclusions, public layouts, immutable archive transactions and backup restore. The standalone Playwright script is maintained separately from interactive browser acceptance; its prerequisites and execution status belong in the test report.

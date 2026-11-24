# Schedule planning

English · [简体中文](../zh-CN/planning/guide.md)

Open **Your space → Schedule planning** at `/planning`. The workspace has Plans, Progress, Four-year examples and Reports. Import creates a usable plan immediately and saves changes automatically on this device. There is no mandatory row-by-row review or save approval.

## Bring two reports

1. **Student Plan**: in BDP **Plan your Path**, print/export the plan. This supplies semester placement, actual courses, transfer credits and exam credits.
2. **Official · Expanded**: in **Track Progress**, select Official, open the audit print menu, choose Expanded (Beta), and enable **Include all constraints**. Include the relevant programs and save the print preview as PDF without browser headers/footers.
3. Add **Planned · Expanded** when exploring undeclared majors or future-course requirements. Switch the view and intended plan before exporting. Standard is an outline fallback when Expanded is unavailable; Compact and duplicate exports are unnecessary.

The supplied 11 PDFs were compared on 2026-11-16. Their Expanded pair contains the Official audit; intended majors marked “Only available in Planned View” need another report. For this attachment set, Student Plan + Official Expanded + Planned Standard is the useful interim combination. Planned Expanded is preferable for the intended majors' full conditions.

Choose several files with the main import button. Document content identifies PDF type and Official/Planned view. Filenames and the selected upload card do not override that evidence. Each report card includes its export and print instructions. An unlabelled audit containing full requirements for an explicitly undeclared target is classified as Planned. Other unidentified views stay separate. Declaration, report view, Applied Version and Catalog Term retain independent fields.

Up to 12 files and 60 MB per batch are supported. Each text PDF is limited to 20 MB, 100 pages, 30,000 lines and 60 seconds; JSON backups to 4 MB. Encrypted PDFs and scans are unsupported. A failed file is reported without discarding successfully parsed files; cancellation or a late result cannot overwrite a newer edit.

## Plan and inspect in one workspace

The board groups Autumn/Spring and optional Summer by academic year. Drag courses on desktop or use the move selector with touch/keyboard. Add years, search within the board, select a dashed requirement placeholder to find matching courses, and replace it with a concrete course. The side panel contains Remaining, Search and Recommend; mobile uses a drawer. Transfer and exam credits have separate groups.

Positive completed/current attendance evidence protects courses across reports. An audit option is not proof of attendance. Student Plan determines semester placement; later edits use separate placement overrides. The Progress tree shows full academic titles, nested requirements, alternatives, numeric constraints and the BDP status reported at export. Course details and prerequisite references open beside the plan or in a dialog. Changes here do not recompute the official BDP audit.

Course cards query the existing anonymous catalog for titles, credits and prerequisites in the selected campus/term. Only public course identifiers and catalog context are sent. Duplicate reads share a bounded queue/cache. Imported historical credits remain unchanged. Variable ranges stay ranges; unresolved credits use a pending label. Original BDP semester totals are labelled separately from current planning estimates. GE placeholders use exact catalog attributes; an ambiguous course family offers actual catalog variants instead of inventing a course number.

Program headers label undeclared targets and support hiding and restoring them. Each semester has a custom campus selector with imported defaults and saved overrides. Empty summer terms can be removed. Movement supports pointer and keyboard dragging, reduced motion and a custom move selector. Progress, planned courses, placeholders, withdrawals, drops, failures and retakes have distinct icons and colors. Withdrawn, dropped and failed attempts do not contribute to semester credit totals.

## Independent plans and favorites

The plan selector keeps **Personal plan** and up to 20 named independent plans in the same account workspace. Give another course combination an independent plan name, then switch or rename it from the toolbar. Existing personal plans and alternative course groups remain available. Independent plans have their own courses, semester campuses, groups and simulation choices; account calendars are shared across them. Clearing one plan does not clear those personal calendars or the other plans.

The centered toolbar stays visible while scrolling. While it remains in normal page flow it has no shadow; the emphasized border and shadow appear after it sticks to the viewport. On phones the compact left plan name opens a single-selection plan menu, the adjacent **+** creates a plan, and the right **Tools** button opens the action menu. Dismissing a menu does not activate the page underneath. Menus remain within the viewport width and have a bounded height. Each semester offers **Import favorites**, **Save to favorites** and **Share semester** using that semester's term and campus. Import selected saved courses, sections or syllabi, or choose a whole folder; teacher-only favorites do not become courses. Reimporting skips an existing active course without moving it or replacing protected academic records. Export a semester's courses into a new or existing favorites folder. Favorite writes re-read the current saved workspace and commit items and folder membership together through one atomic saved-workspace transaction, preserving other favorite kinds and folder metadata. Success is shown after the commit.

Course cards also have optional personal labels: **Registered** (`registered`), **Dropped without W** (`dropped-no-w`) and **Withdrawn with W** (`withdrawn-w`). These are separate from the status imported from an official report. They do not change the original status, audit estimates or earned credits, and remain attached when the report is refreshed. Remove the label to return to the source-only display.

## Share a planning arrangement

Share all semesters or a single semester from the active plan. The recipient opens a read-only semester-column board with course titles, credits, campus, placeholders and selected class numbers. The complete capability link can be opened without signing in; possession of that link grants access. A signed-in recipient can copy the arrangement into a new independent plan without replacing their personal plan. A published arrangement is a snapshot, so later edits require a new share.

Publishing requires a verified account and institutional-email verification; access to a school mailbox does not prove enrollment. Shares have no public owner identity. Their explicit allowlist contains only the arrangement's title, semester/campus, course codes and titles, credits, placeholders and section/class-number choices. Documents, identity fields, original academic statuses and personal course labels are excluded. Course combinations can still identify someone; share only an arrangement intended for recipients.

Choose one day, one week, 30 days or until revoked. Each account may have 20 active links, up to 512 KiB per share and 4 MiB across active shares. Revocation prevents future reads through the link; it cannot recall recipient copies. These planning links are separate from mixed favorites shares, which group course/section/syllabus items by course, term and campus and list teachers with their related-course context.

## Recommendations

Recommendations exclude completed/current courses even when another report calls them planned, and exclude courses already placed in the target semester. They draw from remaining requirement options, existing future plans and an optional public sample. The default program prefers an intended major with course options. Advanced semester, workload, sample and evaluation controls are collapsed; users can choose a credit ceiling and a maximum count of courses from selected prefixes.

The local score combines requirement evidence (45 points for structurally verified rules, 15 for other imported options), matching sample year/season (25), another sample term (8), planned observations (10), evaluation (0–15) and conflicting observations (−20). Summer terms retain their explicit year/season. Ratings use `(score × responses + 3.6 × 20) / (responses + 20)`; missing ratings stay unknown and use a neutral baseline. SEI and SSLE are not pooled. Loading ratings is an explicit action and sends course codes/campus only.

A 128-state beam search over at most 60 candidates includes courses already in the target semester when enforcing credit/prefix ceilings. It reduces repeated rewards for alternatives to the same requirement. Unknown/variable/conflicting credits cannot enter an automatic bounded combination. Unknown credits already in that semester prevent claiming a valid total; individual additions remain available. This is a planning heuristic, not a prerequisite/seat/time-conflict solver or an official degree audit. It does not infer mathematical ability from personal data.

## Privacy and storage

PDF.js runs in a bundled local worker. Names, student identifiers, email addresses, advisor fields, grades, original filenames and raw PDF/text are excluded from saved/exported plans. The whitelist retains academic titles/codes, status evidence, program/version context, numeric requirements, provenance references and placement overrides. Academic combinations can still be identifying; a backup is private data.

The worker is destroyed, line references cleared and any still-owned input buffer wiped. JavaScript strings, garbage collection and browser-internal copies prevent a guarantee of secure memory erasure. Original files in Downloads are not deleted.

The version-3 model upgrades version-1 and version-2 backups on read/import. Cloud `PUT /api/planning/backup` accepts only schema version 3 so an older page cannot discard independent plans, reminders or personal course labels. Refresh older open tabs before saving to the cloud. Local key `course-atlas:private-planning:v1` is separate from favorites. Browser storage is unencrypted and save failures are shown. **Export backup** downloads the complete account planning workspace as `course-atlas-plan.json`, including all independent plans and shared account calendars. Verified accounts synchronize private plans automatically through the shared sync setting. Institutional-email-verified accounts also submit de-identified requirement templates automatically. Public templates include only course options with explicit option provenance. Older unclassified alternatives stay in private backups and require a fresh report import to establish public option provenance. Raw PDFs are processed locally. Umami collects pageviews and allowlisted interaction metadata, while academic content is masked from replay and omitted from events.

`GET/PUT /api/planning/backup` isolates records by account. Row locks and monotonic revision checks protect competing devices. Identical retries are idempotent. Refresh and merge conflicting cloud data before saving. Deleting a cloud backup clears that stored snapshot and retains its revision while the account exists to prevent stale-device restoration. Local edits remain available independently.

`POST /api/planning/templates` retains program/version metadata, requirement hierarchy, numeric constraints and course alternatives. It removes student observations, source IDs, progress, placements and unmatched-course lists. Hashes deduplicate submissions. Records are marked `user-submitted-bdp` for future reference, separate from reviewed official samples.

Run `pnpm user-data:migrate --apply` against the configured account-data database to install `20261116_planning.sql`. Private records use `osu_identity(_dev).planning_backup` and generic trees use `osu_planning(_dev).requirement_template`. Existing user-data backups include both schemas. Account maintenance removes orphaned private backups. Generic templates are retained independently.

Planning links also require `20261123_planning_shares.sql`. For production, run `pnpm user-data:migrate --production --apply` with the production database configuration. The account-domain `planning_share` table belongs to `osu_identity` / `osu_identity_dev`; existing domain backups include it, and maintenance handles expired/revoked links and orphaned owners. Migration preview is available by omitting `--apply`.

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

The dedicated schemas are `osu_planning_dev` and `osu_planning`; `PLANNING_SCHEMA` permits isolated names in that domain. PostgreSQL uses `PLANNING_DATABASE_URL` when set and otherwise `DATABASE_URL`, always with fully qualified planning tables.

| Table              | Retained data                                                         |
| ------------------ | --------------------------------------------------------------------- |
| source_document    | Immutable public URL/hash/fetch identity                              |
| source_asset       | Hash-verified original public bytes, extraction and metadata          |
| source_extraction  | Immutable parser revisions and coordinate text                        |
| directory_snapshot | Dated coverage snapshots                                              |
| curriculum_version | Separate source/parser/variant versions and applicability metadata    |
| template_seed      | Reviewed requirements-only input, pending operator publication review |

Archive operations are transactional and repeatable; unique identities cannot silently overwrite another variant. Changed parsing uses a new version. Backups are exclusive new files with restricted permissions. PGlite restoration is tested in a disposable database. Native PostgreSQL deployment/connectivity/restore is not validated by those tests. Public PDF NUL/lone-surrogate text is stored as U+FFFD with an explicit policy; original bytes/hash remain unchanged.

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

## Database publication and portable backups

The runtime `/api/planning/curricula` reads the latest immutable `catalog_release` from PostgreSQL. Each release contains full semester templates, directory evidence, subject vocabulary and source metadata. Repository JSON is an operator publication input. An unavailable database returns 503. Development defaults to `osu_planning_dev` and production to `osu_planning`.

```sh
node --env-file-if-exists=.env.local scripts/planning/database.mjs init --apply
node --env-file-if-exists=.env.local scripts/planning/database.mjs publish --apply
NODE_ENV=production node --env-file-if-exists=.env.local scripts/planning/database.mjs init --apply
NODE_ENV=production node --env-file-if-exists=.env.local scripts/planning/database.mjs publish --apply
```

Publishing validates all inputs before one atomic insert, deduplicates identical releases and preserves older releases. Schema backups include the release table. Run publication again after reviewing refreshed templates. Successful reads have a one-minute process cache and a five-minute HTTP cache.

Choose **Export backup** to save the complete sanitized planning workspace as JSON. **Import backup** previews a validated file and **Restore this backup** replaces the whole workspace through the regular local-save and account-sync path, including personal and independent plans and shared account calendars. It preserves IDs, campuses, groups, section choices, simulation preferences, reminders and personal course labels across database environments. Reimporting the same backup preserves its identities. The restore dialog also offers an export of the current workspace. Files are limited to 4 MB; legacy schema versions 1 and 2 are upgraded automatically to version 3.

# Releases and versioning

English · [简体中文](zh-CN/releases.md)

[GitHub Releases](https://github.com/1834423612/osu-evaluation-info/releases) identifies product milestones. Website build information identifies the exact deployed commit separately. Creating a Release does not prove that its code or database migrations have been deployed.

## Version rules

Use `vMAJOR.MINOR.PATCH` tags following [Semantic Versioning](https://semver.org/). Compatible feature milestones increase MINOR and reset PATCH to zero; compatible corrections increase PATCH. An incompatible change to documented HTTP contracts or saved-data/import-export formats requires a MAJOR release and upgrade instructions. Internal refactoring, commit counts and dates do not determine version numbers. Required database migrations must be documented even for compatible product upgrades.

## Display and publication

The GitHub Release name equals its tag exactly, for example `v1.7.1`. Numeric components have no fixed width or leading zeroes. The first line of the description is the feature title as a Markdown level-one heading (`# Semester planning`); bilingual update notes, source dates, migration notes and comparison links follow it.

Publishing is part of completing a feature or bugfix unless the task explicitly sets another release boundary:

1. Run `pnpm test`, `pnpm lint` and the relevant type, build, integration or browser checks on the release result. Required failures block publication; identify deliberately skipped external-service checks.
2. Compare with the previous release, choose the next SemVer and align `package.json` and both language histories. Include operator actions when a migration is required.
3. Write the feature heading and user-facing changes in the description, with the version-only Release name.
4. Commit and push the verified result to the main branch, then publish its exact commit under the version tag. Check the remote tag target, name, body and Latest selection.

Documentation or Release-display-only edits can update the relevant text without issuing a new software version. Published tags retain their original commit targets. See [contributor release requirements](../AGENTS.md#releases).

## Historical reconstruction

The existing `v1.0.0` and `v1.1.5` tags and release records are retained. Missing labels `v1.1.0`–`v1.1.4` are not evidence of published releases. Subsequent milestones follow main-branch integration order, including merged feature branches. Historical commits retain their original package metadata.

Eight subsequent Release records were reconstructed on November 26, 2026. Code dates below use `America/New_York`; GitHub publication timestamps record the actual time the records were created. These entries summarize source changes, without claiming that every historical checkout was retested or deployed on its code date. The prepared `package.json` version is `1.8.0`; the published baseline remains `v1.7.1`; build SHA and build time remain the deployment identifiers.

## Timeline

| Version                                                                         | Code date  | Code boundary | Milestone                                           |
| ------------------------------------------------------------------------------- | ---------- | ------------- | --------------------------------------------------- |
| [v1.0.0](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.0.0) | 2026-11-05 | `d9b53ca`     | Existing initial release                            |
| [v1.1.5](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.1.5) | 2026-11-10 | `357c0c6`     | Existing catalog, translation and interface release |
| [v1.2.0](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.2.0) | 2026-11-12 | `fb76773`     | Syllabi and reference guides                        |
| [v1.3.0](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.3.0) | 2026-11-13 | `db4fa24`     | Search, faculty library and archives                |
| [v1.4.0](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.4.0) | 2026-11-15 | `53f9ea8`     | Accounts, collections and device sync               |
| [v1.5.0](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.5.0) | 2026-11-17 | `4dd9956`     | Curriculum planning                                 |
| [v1.6.0](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.6.0) | 2026-11-19 | `1f9c5ae`     | Calendars, subscriptions and sharing                |
| [v1.6.1](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.6.1) | 2026-11-22 | `246fe50`     | Catalog coverage and search recovery                |
| [v1.7.0](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.7.0) | 2026-11-23 | `31f380a`     | Independent plans and timetable controls            |
| [v1.7.1](https://github.com/1834423612/osu-evaluation-info/releases/tag/v1.7.1) | 2026-11-26 | `v1.7.1`      | November 25 catalog fixes and release metadata      |

## v1.8.0 — Workspace clarity and RMP administration (unreleased)

Prepared version: production schema installation, reviewed course reconciliation and publication are still required before this version is released. Published tags remain unchanged.

- Rendered syllabus comparisons and explicit source/format change categories, with safe folding of duplicate archived copies.
- Shared search inputs and catalog pipeline, exact prerequisite/title/instructor filters, complete decimal-course families and return-to-search breadcrumbs.
- Live section/seat progress, prominent full-course indicators and event details sized to the actual available rectangle.
- Official no-class day stripes, shared native scroll chaining, registered swipe tabs and more visible official/RMP evaluation choices.
- Conservative verified-subject numeric RMP reconciliation, durable manual overlays/audit, compact responsive review tools and database-backed account administrator roles.
- Operator prerequisites: install administrator/identity schemas, review both course-plan fingerprints before applying, and explicitly grant the first existing account through the controlled role CLI. No account receives automatic production authority.
- Batch course binding with editable reason templates, scoped local/remote AI review jobs, immutable pending suggestions and explicit human subset approval.


## v1.7.1 — Catalog synchronization diagnostics

### Fixes and improvements

- Retain a section's verified subject and course number when official parent metadata disagrees. Explicit checks and original-parent provenance prevent uncertain identities from being accepted silently.
- Pinpoint sync errors by operation, request, page, JSON field, expected/actual values, record IDs and validator file/line. Actions summaries retain verified differences and redact connection credentials.
- Compare an official subject with accepted archives using a read-only inspection command, including changes of campus.
- Align package metadata with `1.7.1` and document release history in both languages.

### Operator notes

Catalog fixes were committed November 25; release history and package metadata were aligned November 26. No schema migration is introduced. See [sync diagnostics](catalog/scheduled-sync.md#diagnose-a-failed-run). Re-running an older Actions run uses its original commit; see [GitHub rerun behavior](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

## v1.7.0 — Independent plans and timetable controls

### New features

- Keep multiple independent planning workspaces and share selected semester plans through scoped links.
- Compare flexible timetable alternatives in complete week views, with personal enrollment labels alongside official records.
- Read clearer calendar timetables and configure multiple device reminders.

### Improvements and fixes

- Refresh official seats during simulation, restore automatic/fixed choices and retain calendar source previews on narrow screens.
- Group shared saved content by course, term and campus, with simpler copied-link feedback.

### Operator notes

Plan links require `20261123_planning_shares.sql`. Preview production migrations with `pnpm user-data:migrate --production`; review and back up the intended database before applying. See [planning operations](planning/guide.md).

## v1.6.1 — Catalog coverage and search recovery

### Fixes

- Refuse severely degraded official refreshes and keep the last accepted catalog available for search.
- Prepare redundant accepted search indexes and bound recovery from earlier accepted generations.
- Ignore null term placeholders while validating searchable identities.
- Maintain accepted indexes after sync failures and report maintenance outcomes separately.

### Operator notes

Install catalog migration 7 with `pnpm catalog:migrate`; scheduled synchronization does not migrate schemas. Recovery and quarantine need explicit investigation. See [catalog operations](catalog/operations.md#coverage-guard-and-recovery).

## v1.6.0 — Calendars, subscriptions and sharing

### New features

- Save schedule groups, combine calendars and subscribe to supported feeds with official-source context.
- Share calendars with publication/revocation controls and preview saved content selected by folder.
- Control sync per feature and review planning conflicts explicitly.
- Compare archived syllabus revisions with line-level content differences.

### Improvements and fixes

- Preserve drafts, isolate stale dialog results and keep subscribed events read-only.
- Retain assignment categories in feed imports/exports, use Eastern date boundaries and improve mobile event controls.

### Operator notes

Calendar and development-account records require this tag's user-data migrations. Preview with `pnpm user-data:migrate`, then follow [calendar operations](planning/calendars.md) for the intended environment.

## v1.5.0 — Curriculum planning

### New features

- Build private semester plans from locally processed PDF candidates, with reviewed extraction and source context.
- Browse archived official curricula, requirement branches, alternatives and inspected semester examples.
- Move courses between terms, inspect catalog details and compare workload-limited course combinations.
- Simulate section timetables with conflict checks, restore portable backups and synchronize account-backed plans.

### Improvements and fixes

- Preserve repeated requirements, unsuccessful attempts and alternative pathways; improve mobile dialogs and timetable controls.
- Require the patched Next.js dependency version shipped with this milestone.

### Operator notes

Apply [planning migrations](planning/guide.md) before enabling account storage and publish reviewed templates before serving them. Imported candidates and recommendations require review; they are not official degree audits or a guarantee of complete source coverage.

## v1.4.0 — Accounts, collections and device sync

### New features

- Sign in with email codes, passkeys or an optional password, with single-use recovery codes.
- Organize favorites into collections/tags, selectively import/export items and restore private backups.
- Synchronize devices with queued operations and explicit conflicts; transfer selected content using approved pairing and revocable links.
- Search/export local activity and translate full syllabi with bilingual Chinese PDF export.

### Improvements and fixes

- Preserve content through concurrent edits, capacity limits and partial account outages; protect unfinished forms.
- Add opt-in diagnostic reports and administrator statistics with separate storage/retention controls.

### Operator notes

Self-hosting needs the account/user-data schemas and authentication/email configuration in [account operations](user-data.md). Back up data and review migrations before applying them. Source archives and private user data have separate retention rules.

## v1.3.0 — Search, faculty library and permanent archives

### New features

- Search catalogs with intent recognition and typo tolerance, with exact course-code requests routed to OSU.
- Browse faculty source profiles and course-labeled reviews with verified/unconfirmed identity distinctions.
- Permanently retain catalog/syllabus history, preserve term archive heads and recover removed-course details.
- View a filtered course-update feed derived from complete snapshots.

### Improvements and fixes

- Reconcile course labels across campuses while retaining distinct source profiles; improve panel scrolling and navigation.

### Operator notes

Apply this tag's catalog, syllabus and RMP library migrations. Permanent archives increase storage use and need independent backups. Source labels alone do not confirm instructor identity. See [catalog lifecycle](catalog/lifecycle.md) and [RMP library](rmp/library.md).

## v1.2.0 — Syllabi and reference guides

### New features

- Read published official syllabi with outlines, zoom, section selection and browser-local Letter PDF export.
- Bookmark versions and retain update alerts until changes are explicitly reviewed.
- View staff roles and separate RMP, SEI and SSLE ratings while filtering available/unpublished documents.
- Open bilingual methodology articles and OSU reference guides in contextual panels.

### Improvements and fixes

- Improve scrolling, PDF typography/images/margins, browser-local source times and preservation of manual translations.

### Operator notes

Initialize archives with `pnpm syllabus:migrate` before scheduled archival. Official access restrictions still apply; PDF fidelity depends on the source document.

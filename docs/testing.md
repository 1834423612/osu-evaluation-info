# Testing

English · [简体中文](zh-CN/testing.md)

A unit test exercises one rule with controlled inputs and checks its output, usually without a browser or external service. Here that includes course-code parsing, score weighting, identity evidence and scroll ownership. These checks catch regressions when implementation changes; passing them does not prove that a remote source, database or layout works.

Integration tests check components together, including SQL, transactions and recovery. Browser scripts check rendering, keyboard/touch input, navigation and API-to-UI behavior. They complement unit tests rather than replacing them.

## Run the default checks

Run commands from the repository root with Node.js 24+ and installed dependencies:

```sh
pnpm test
pnpm test:python
pnpm typecheck
pnpm lint
pnpm lint:docs
pnpm build
```

`pnpm test` runs `tests/**/*.test.mjs` using Node's test runner. Database/live cases skip unless explicitly enabled. `pnpm test:python` uses unittest discovery; Python requires the dependencies used by the collector/research modules. TypeScript, lint, CSS, documentation and build checks are separate from unit tests.

Run one file while developing:

```sh
node --test tests/search/exact-route.test.mjs
python3 -m unittest tests.rmp.test_course_matching
```

## Database and external-service opt-ins

Use a dedicated test database or a backed-up development database. The schema integration checks create random temporary schemas and remove or roll them back; they need schema privileges. RMP integration tests read the existing dataset in read-only transactions. Never assume that an arbitrary maintenance/import command has the same isolation as a test.

| Environment flag               | Scope and effects                                                                         |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `CATALOG_DATABASE_TEST=1`      | Catalog snapshot, term-head and CLI recovery tests in disposable schemas                  |
| `SYLLABUS_DATABASE_TEST=1`     | Syllabus index/document retention and historical-reference matching in disposable schemas |
| `TRANSLATION_DATABASE_TEST=1`  | Provider coordination and usage aggregation in disposable schemas                         |
| `RMP_INTEGRATION_TESTS=1`      | Read-only queries against existing RMP/catalog/evaluation data                            |
| `RMP_RESEARCH_DATABASE_TEST=1` | Python identity evidence database tests in temporary schemas                              |
| `CATALOG_LIVE_TEST=1`          | Real OSU requests and publication into disposable storage; not a default check            |

```sh
RMP_INTEGRATION_TESTS=1 CATALOG_DATABASE_TEST=1 SYLLABUS_DATABASE_TEST=1 TRANSLATION_DATABASE_TEST=1 \
  node --env-file-if-exists=.env.local --test tests/**/*.test.mjs
RMP_RESEARCH_DATABASE_TEST=1 python3 -m unittest tests.test_identity_research_db
```

Keep `DATABASE_URL` in the environment or `.env.local`, never copied into a command/report. Python database checks need that variable loaded into the shell. A skipped test is unexecuted, not passed. Live checks depend on source availability and should be reported separately.

## Browser scripts

Course-update scripts use `CHANGES_TEST_BASE_URL` / `CHANGES_TEST_OUTPUT`; `CATALOG_CHANGES_REAL_TEST=1` adds read-only pagination checks against the configured database.

Start `pnpm dev`, or `pnpm build` followed by `pnpm start`. Browser scripts are standalone `.browser.mjs` files and are not run by `pnpm test`. Install Playwright and its Chromium/runtime dependencies in the testing environment. The scripts accept `PLAYWRIGHT_MODULE` as an absolute module file URL when it is not resolvable from the project, plus optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

| Area       | Base URL / output variables                      | Data and network                                                                       |
| ---------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Navigation | `NAV_TEST_BASE_URL`, `NAV_TEST_OUTPUT`           | Mocked unavailable data; real navigation, forms and keyboard                           |
| RMP        | `RMP_TEST_BASE_URL`, `RMP_TEST_OUTPUT`           | Library/course-lead checks read real local APIs; period-layout uses fixtures           |
| Syllabus   | `SYLLABUS_TEST_BASE_URL`, `SYLLABUS_TEST_OUTPUT` | Experience uses fixtures; source-layout uses source content; fonts uses the public CDN |
| Search     | `SEARCH_TEST_BASE_URL`, `SEARCH_TEST_OUTPUT`     | Deterministic direct/index routing and rendering fixtures                              |

Other browser files declare their own variables at the top. Defaults generally target localhost:3000 and temporary artifact directories. Check that declaration before choosing another server. Use a separate browser context: tests change local favorites/preferences, mock requests and may trigger downloads. They do not publish reviews or vote. Translation/onboarding checks use controlled browser/model responses; model-download tests should run in an isolated browser profile.

```sh
node tests/layout/navigation.browser.mjs
node tests/rmp/library.browser.mjs
node tests/syllabus/experience.browser.mjs
node tests/syllabus/fonts.browser.mjs
```

`FONT_TEST_DOCUMENT_FILE` can provide output of `officialSyllabusFrame` when a Windows browser runner cannot resolve Linux package symlinks. `SYLLABUS_DOCUMENT_FILE` provides a saved official document response for source-layout/PDF checks. Keep screenshots, downloaded PDFs, benchmark JSON and source captures outside tracked documentation.

## Script inventory

Each row identifies the script's primary check. Open the file for fixtures, exact assertions and opt-in conditions. `.integration.test.mjs` files may include both deterministic unit checks and gated database checks.

### Account and syllabus additions

| Script                                                                                            | Type | Purpose                                                                                                                                |
| ------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [tests/user-data/draft-guard.test.mjs](../tests/user-data/draft-guard.test.mjs)                   | Unit | Dirty-editor registry, link/refresh prompts and back/forward restoration; simulated history, no network or writes                      |
| [tests/user-data/institutional-policy.test.mjs](../tests/user-data/institutional-policy.test.mjs) | Unit | Exact school-mail domains and opt-in public-author fields; no services or writes                                                       |
| [tests/user-data/network-fallback.test.mjs](../tests/user-data/network-fallback.test.mjs)         | Unit | Mocked failover, bounded cancellation, no coordinates/credentials and private-address exclusion; no external requests                  |
| [tests/user-data/share-scope.test.mjs](../tests/user-data/share-scope.test.mjs)                   | Unit | In-memory capability-cache isolation across account and guest changes                                                                  |
| [tests/syllabus/translation.test.mjs](../tests/syllabus/translation.test.mjs)                     | Unit | Unicode, replace/bilingual HTML, safe provider text, source preservation and cancellation; injected translation, no services or writes |
| [tests/syllabus/cjk-font.test.mjs](../tests/syllabus/cjk-font.test.mjs)                           | Unit | Local WOFF2 decoding, real Chinese glyphs and OFL attribution; no writes                                                               |

### analytics

| Script                                                                                  | Type | Purpose                                                                                               |
| --------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| [tests/analytics/audit.test.mjs](../tests/analytics/audit.test.mjs)                     | Unit | the audit paginates submissions and outcomes, isolates production and omits private event identifiers |
| [tests/analytics/search-outcomes.test.mjs](../tests/analytics/search-outcomes.test.mjs) | Unit | distinguishes confirmed empties, incomplete windows, conflicts and request errors                     |
| [tests/analytics/umami.test.mjs](../tests/analytics/umami.test.mjs)                     | Unit | Umami course search labels                                                                            |

### catalog

| Script                                                                                                  | Type        | Purpose                                                                                                         |
| ------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| [tests/catalog/availability.test.mjs](../tests/catalog/availability.test.mjs)                           | Unit        | live-only enrollment availability                                                                               |
| [tests/catalog/browser-transport.test.mjs](../tests/catalog/browser-transport.test.mjs)                 | Unit        | normalizes direct search data and enriches it only from the local evaluation database                           |
| [tests/catalog/detail-refresh.test.mjs](../tests/catalog/detail-refresh.test.mjs)                       | Unit        | course metadata loads once, retains identifiers and never validates search placeholders                         |
| [tests/catalog/empty-card.browser.mjs](../tests/catalog/empty-card.browser.mjs)                         | Browser     | Empty card checks                                                                                               |
| [tests/catalog/exact-search.test.mjs](../tests/catalog/exact-search.test.mjs)                           | Unit        | exact course code parsing                                                                                       |
| [tests/catalog/experience.browser.mjs](../tests/catalog/experience.browser.mjs)                         | Browser     | Responsive interaction and feature flow                                                                         |
| [tests/catalog/filters.browser.mjs](../tests/catalog/filters.browser.mjs)                               | Browser     | Filters checks                                                                                                  |
| [tests/catalog/floating-controls.test.mjs](../tests/catalog/floating-controls.test.mjs)                 | Unit        | corner control stays within the visual viewport and clears stacked floating widgets                             |
| [tests/catalog/live-sync.integration.test.mjs](../tests/catalog/live-sync.integration.test.mjs)         | Integration | publishes the complete live official catalog in disposable storage                                              |
| [tests/catalog/official-availability.test.mjs](../tests/catalog/official-availability.test.mjs)         | Unit        | discovers once, then requests each live read directly from OSU without credentials                              |
| [tests/catalog/official-exact.test.mjs](../tests/catalog/official-exact.test.mjs)                       | Unit        | exact course upstream reconciliation                                                                            |
| [tests/catalog/permanent-archive.test.mjs](../tests/catalog/permanent-archive.test.mjs)                 | Unit        | legacy cleanup options cannot delete or retire any archived generation                                          |
| [tests/catalog/presentation.test.mjs](../tests/catalog/presentation.test.mjs)                           | Unit        | combined student levels remain complete in both languages and old saved records                                 |
| [tests/catalog/ranked-search.test.mjs](../tests/catalog/ranked-search.test.mjs)                         | Unit        | uses AND and keeps direct title matches ahead of description-only hits                                          |
| [tests/catalog/related-search.test.mjs](../tests/catalog/related-search.test.mjs)                       | Unit        | corrects abbreviated and mistyped subjects while preserving exact course numbers                                |
| [tests/catalog/request-pool.test.mjs](../tests/catalog/request-pool.test.mjs)                           | Unit        | spaces requests and never exceeds the shared concurrency limit                                                  |
| [tests/catalog/search-debug.browser.mjs](../tests/catalog/search-debug.browser.mjs)                     | Browser     | Search debug checks                                                                                             |
| [tests/catalog/search-query.test.mjs](../tests/catalog/search-query.test.mjs)                           | Unit        | recognizes real subject names, abbreviations and the observed spelling variants                                 |
| [tests/catalog/search.browser.mjs](../tests/catalog/search.browser.mjs)                                 | Browser     | american experiment                                                                                             |
| [tests/catalog/section-availability.test.mjs](../tests/catalog/section-availability.test.mjs)           | Unit        | uses the exact availability identifiers, retaining leading zeroes and offering/session identity                 |
| [tests/catalog/active-filters.test.mjs](../tests/catalog/active-filters.test.mjs)                       | Unit        | Effective default campus, clearing campus scope and counting actual filters; no services or writes              |
| [tests/catalog/section-filters.test.mjs](../tests/catalog/section-filters.test.mjs)                     | Unit        | section filter choices                                                                                          |
| [tests/catalog/smart-search.test.mjs](../tests/catalog/smart-search.test.mjs)                           | Unit        | normalizes subject names before querying, keeping every user filter and the original query                      |
| [tests/catalog/snapshots.integration.test.mjs](../tests/catalog/snapshots.integration.test.mjs)         | Integration | isolates staged generations, publishes atomically, preserves old cursors, and rolls back incomplete publication |
| [tests/catalog/sync-cli.integration.test.mjs](../tests/catalog/sync-cli.integration.test.mjs)           | Integration | executes checkpoint recovery and rejects corrupt data through the real CLI                                      |
| [tests/catalog/sync-safety.test.mjs](../tests/catalog/sync-safety.test.mjs)                             | Unit        | derives missing course offering/campus from official sections and strips volatile metadata                      |
| [tests/catalog/term-archives.integration.test.mjs](../tests/catalog/term-archives.integration.test.mjs) | Integration | term rollover preserves one complete archive head while current corrections keep updating                       |
| [tests/catalog/transactions.test.mjs](../tests/catalog/transactions.test.mjs)                           | Unit        | catalog page transaction recovery                                                                               |
| [tests/catalog/watch-selection.test.mjs](../tests/catalog/watch-selection.test.mjs)                     | Unit        | remembers only selected identities, scoped to course/term/campus, with stable snapshots                         |
| [tests/catalog/workflow.test.mjs](../tests/catalog/workflow.test.mjs)                                   | Unit        | catalog automation only accepts the four-hour scheduled event                                                   |

| [tests/catalog/changes.test.mjs](../tests/catalog/changes.test.mjs) | Unit | Update-filter and pinned-cursor validation |
| [tests/catalog/changes.integration.test.mjs](../tests/catalog/changes.integration.test.mjs) | Integration | Published snapshot diffs, baselines, noise and append-only history |
| [tests/catalog/changes.browser.mjs](../tests/catalog/changes.browser.mjs) | Browser | Responsive update feed, forms, links and optional real API pagination |

### evaluations

| Script                                                                              | Type | Purpose                                                                                        |
| ----------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| [tests/evaluations/batch-input.test.mjs](../tests/evaluations/batch-input.test.mjs) | Unit | accepts bounded evaluation identities without carrying official course payloads or seat counts |
| [tests/evaluations/scoring.test.mjs](../tests/evaluations/scoring.test.mjs)         | Unit | evaluation aggregation                                                                         |

### gestures

| Script                                                                              | Type | Purpose                                                |
| ----------------------------------------------------------------------------------- | ---- | ------------------------------------------------------ |
| [tests/gestures/drawer-dismiss.test.mjs](../tests/gestures/drawer-dismiss.test.mjs) | Unit | accepts a deliberate downward pull or short fast flick |

### layout

| Script                                                                        | Type    | Purpose                                                                |
| ----------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------- |
| [tests/layout/navigation.browser.mjs](../tests/layout/navigation.browser.mjs) | Browser | Route selection, nested menus, mobile bounds, keyboard and form values |

### people

| Script                                                                                | Type | Purpose                                                                        |
| ------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| [tests/people/identity-research.test.mjs](../tests/people/identity-research.test.mjs) | Unit | upgrades old official links and follows only bounded official redirects        |
| [tests/people/people-cache.test.mjs](../tests/people/people-cache.test.mjs)           | Unit | verified directory cache                                                       |
| [tests/people/people-directory.test.mjs](../tests/people/people-directory.test.mjs)   | Unit | compact badges preserve academic ranks, research jobs and qualified assistants |
| [tests/people/photo.test.mjs](../tests/people/photo.test.mjs)                         | Unit | direct official instructor photos                                              |

### preferences

| Script                                                                                            | Type | Purpose                                                                                        |
| ------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------- |
| [tests/preferences/build-info.test.mjs](../tests/preferences/build-info.test.mjs)                 | Unit | version metadata validates complete SHAs, zoned dates, environment and a single commit subject |
| [tests/preferences/debug-services.test.mjs](../tests/preferences/debug-services.test.mjs)         | Unit | pauses survive reload with exact-key snapshots; uncaptured requests never load                 |
| [tests/preferences/debug-ui-state.test.mjs](../tests/preferences/debug-ui-state.test.mjs)         | Unit | late authorization cannot reopen a panel the user has just collapsed or hidden                 |
| [tests/preferences/debug.test.mjs](../tests/preferences/debug.test.mjs)                           | Unit | logo taps require seven quick presses and reset after an accidental pause                      |
| [tests/preferences/locale.test.mjs](../tests/preferences/locale.test.mjs)                         | Unit | first-visit language detection                                                                 |
| [tests/preferences/logo-clicks.test.mjs](../tests/preferences/logo-clicks.test.mjs)               | Unit | a single logo click navigates only after the double-click window                               |
| [tests/preferences/release-time.test.mjs](../tests/preferences/release-time.test.mjs)             | Unit | release dates follow browser zones across date boundaries and daylight-saving offsets          |
| [tests/preferences/storage-migrations.test.mjs](../tests/preferences/storage-migrations.test.mjs) | Unit | migrations merge identities and nested instructor-course links before removing old keys        |
| [tests/preferences/update-notice.test.mjs](../tests/preferences/update-notice.test.mjs)           | Unit | only a deployed production version differing from the loaded bundle needs a refresh            |

### reference

| Script                                                                                    | Type    | Purpose                                 |
| ----------------------------------------------------------------------------------------- | ------- | --------------------------------------- |
| [tests/reference/experience.browser.mjs](../tests/reference/experience.browser.mjs)       | Browser | Responsive interaction and feature flow |
| [tests/reference/methodology.browser.mjs](../tests/reference/methodology.browser.mjs)     | Browser | Methodology checks                      |
| [tests/reference/nested-drawer.browser.mjs](../tests/reference/nested-drawer.browser.mjs) | Browser | Nested drawer checks                    |

### rmp

| Script                                                                                                    | Type        | Purpose                                                                                          |
| --------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| [tests/rmp/course-groups.test.mjs](../tests/rmp/course-groups.test.mjs)                                   | Unit        | current sections determine the group, not historical evaluations or the date of a review         |
| [tests/rmp/course-leads.browser.mjs](../tests/rmp/course-leads.browser.mjs)                               | Browser     | Course leads checks                                                                              |
| [tests/rmp/course-leads.integration.test.mjs](../tests/rmp/course-leads.integration.test.mjs)             | Integration | unconfirmed RMP course leads preserve campus, original labels and verified-score isolation       |
| [tests/rmp/course-matching.integration.test.mjs](../tests/rmp/course-matching.integration.test.mjs)       | Integration | full-database RMP course links and serving queries                                               |
| [tests/rmp/course.browser.mjs](../tests/rmp/course.browser.mjs)                                           | Browser     | Course checks                                                                                    |
| [tests/rmp/display.test.mjs](../tests/rmp/display.test.mjs)                                               | Unit        | source missing-value sentinels are not shown as negative percentages or zero ratings             |
| [tests/rmp/inline-unconfirmed.integration.test.mjs](../tests/rmp/inline-unconfirmed.integration.test.mjs) | Integration | course history retains every same-course/campus profile and paginates unconfirmed reviews inline |
| [tests/rmp/library-input.test.mjs](../tests/rmp/library-input.test.mjs)                                   | Unit        | library filters bound source queries without excluding unconfirmed profiles                      |
| [tests/rmp/library.browser.mjs](../tests/rmp/library.browser.mjs)                                         | Browser     | Faculty views, course filters, pagination and browser back                                       |
| [tests/rmp/library.integration.test.mjs](../tests/rmp/library.integration.test.mjs)                       | Integration | RMP library serves every saved profile and original course labels                                |
| [tests/rmp/period-layout.browser.mjs](../tests/rmp/period-layout.browser.mjs)                             | Browser     | Current/history groups, identity controls and wheel/touch scrolling                              |
| [tests/rmp/review-facts.test.mjs](../tests/rmp/review-facts.test.mjs)                                     | Unit        | review facts distinguish missing sentinels, recorded zero and unknown source values              |
| [tests/rmp/review-fields.integration.test.mjs](../tests/rmp/review-fields.integration.test.mjs)           | Integration | course previews, pagination and faculty pages preserve all stored review facts                   |
| [tests/rmp/rmp-input.test.mjs](../tests/rmp/rmp-input.test.mjs)                                           | Unit        | RMP course selection                                                                             |
| [tests/rmp/rmp-insights.test.mjs](../tests/rmp/rmp-insights.test.mjs)                                     | Unit        | RMP quality uses valid recent quality counts and does not substitute difficulty                  |
| [tests/rmp/rmp-pagination.test.mjs](../tests/rmp/rmp-pagination.test.mjs)                                 | Unit        | RMP review pagination                                                                            |
| [tests/rmp/source-retention.integration.test.mjs](../tests/rmp/source-retention.integration.test.mjs)     | Integration | RMP source retention preserves raw records                                                       |
| [tests/rmp/test_course_matching.py](../tests/rmp/test_course_matching.py)                                 | Unit        | Course matching checks                                                                           |
| [tests/rmp/test_mapping_batches.py](../tests/rmp/test_mapping_batches.py)                                 | Unit        | Mapping batches checks                                                                           |
| [tests/rmp/test_mapping_coverage.py](../tests/rmp/test_mapping_coverage.py)                               | Unit        | Mapping coverage checks                                                                          |
| [tests/rmp/test_rmp_collector.py](../tests/rmp/test_rmp_collector.py)                                     | Unit        | Rmp collector checks                                                                             |
| [tests/rmp/test_rmp_mapping.py](../tests/rmp/test_rmp_mapping.py)                                         | Unit        | Rmp mapping checks                                                                               |
| [tests/rmp/test_rmp_supplement.py](../tests/rmp/test_rmp_supplement.py)                                   | Unit        | Rmp supplement checks                                                                            |
| [tests/rmp/word-cloud.test.mjs](../tests/rmp/word-cloud.test.mjs)                                         | Unit        | word weights determine a visible font hierarchy and every supported word has its own color       |

### search

| Script                                                                            | Type    | Purpose                                                                                        |
| --------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- |
| [tests/search/cache.test.mjs](../tests/search/cache.test.mjs)                     | Unit    | index builds coalesce, serialize, retry failures and retain bounded published generations      |
| [tests/search/client.test.mjs](../tests/search/client.test.mjs)                   | Unit    | the primary index accepts typos unchanged and never falls through on a legitimate empty result |
| [tests/search/engine.test.mjs](../tests/search/engine.test.mjs)                   | Unit    | retrieves unseen subjects and whole descriptions without an official-query candidate gate      |
| [tests/search/exact-route.test.mjs](../tests/search/exact-route.test.mjs)         | Unit    | complete codes use catalog-derived names and abbreviations without a fixed mapping             |
| [tests/search/live-routing.browser.mjs](../tests/search/live-routing.browser.mjs) | Browser | One-page official routing and tolerant index fallback                                          |
| [tests/search/result-cache.test.mjs](../tests/search/result-cache.test.mjs)       | Unit    | a hundred identical users share one query and one hydrated result                              |
| [tests/search/results.test.mjs](../tests/search/results.test.mjs)                 | Unit    | all selected facets must match the same section, and seats retain exact offering identifiers   |
| [tests/search/search.browser.mjs](../tests/search/search.browser.mjs)             | Browser | Search checks                                                                                  |

### styles

| Script                                                                    | Type | Purpose                                             |
| ------------------------------------------------------------------------- | ---- | --------------------------------------------------- |
| [tests/styles/css-hygiene.test.mjs](../tests/styles/css-hygiene.test.mjs) | Unit | detects repeated selectors hidden in selector lists |

### syllabus

| Script                                                                                        | Type           | Purpose                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tests/syllabus/assets.test.mjs](../tests/syllabus/assets.test.mjs)                           | Unit           | relay accepts only fixed public OSU image and BUX font paths                                                                                                                                                         |
| [tests/syllabus/check-pdf.py](../tests/syllabus/check-pdf.py)                                 | PDF inspection | OSU · Simple Syllabus                                                                                                                                                                                                |
| [tests/syllabus/choices.test.mjs](../tests/syllabus/choices.test.mjs)                         | Unit           | default order is stable; unavailable syllabi remain after available sections                                                                                                                                         |
| [tests/syllabus/experience.browser.mjs](../tests/syllabus/experience.browser.mjs)             | Browser        | Responsive interaction and feature flow                                                                                                                                                                              |
| [tests/syllabus/fonts.browser.mjs](../tests/syllabus/fonts.browser.mjs)                       | Browser        | Real CDN fonts, CORS and iframe CSP                                                                                                                                                                                  |
| [tests/syllabus/insights.test.mjs](../tests/syllabus/insights.test.mjs)                       | Unit           | turns source week paragraphs into complete timeline entries and preserves legends                                                                                                                                    |
| [tests/syllabus/normalize.test.mjs](../tests/syllabus/normalize.test.mjs)                     | Unit           | discovers real term UUIDs and keeps current independent of catalog codes                                                                                                                                             |
| [tests/syllabus/official-render.test.mjs](../tests/syllabus/official-render.test.mjs)         | Unit           | keeps published layout classes, typography, table widths and image sources                                                                                                                                           |
| [tests/syllabus/pdf-content.test.mjs](../tests/syllabus/pdf-content.test.mjs)                 | Unit           | official gray heading rules keep their browser color in PDF canvas                                                                                                                                                   |
| [tests/syllabus/pdf-typography.test.mjs](../tests/syllabus/pdf-typography.test.mjs)           | Unit           | CSS line height compensates for the actual embedded font ascent and descent                                                                                                                                          |
| [tests/syllabus/save.test.mjs](../tests/syllabus/save.test.mjs)                               | Unit           | save picker cancellation never becomes an automatic download                                                                                                                                                         |
| [tests/syllabus/saved.test.mjs](../tests/syllabus/saved.test.mjs)                             | Unit           | first official observation establishes a baseline; later versions require explicit acknowledgement                                                                                                                   |
| [tests/syllabus/scroll-chain.test.mjs](../tests/syllabus/scroll-chain.test.mjs)               | Unit           | short and exhausted documents pass the whole gesture to the panel                                                                                                                                                    |
| [tests/syllabus/scroll-intent.test.mjs](../tests/syllabus/scroll-intent.test.mjs)             | Unit           | fast wheel bursts stay in the hovered document, including the event that reaches its edge                                                                                                                            |
| [tests/syllabus/selection.test.mjs](../tests/syllabus/selection.test.mjs)                     | Unit           | default skips missing, empty and failed documents while preserving source order                                                                                                                                      |
| [tests/syllabus/source-layout.browser.mjs](../tests/syllabus/source-layout.browser.mjs)       | Browser        | Real official content, dates and responsive reading                                                                                                                                                                  |
| [tests/syllabus/history.integration.test.mjs](../tests/syllabus/history.integration.test.mjs) | Integration    | Exact course/campus/teacher matches, latest references, aliases and unpublished/future exclusions; run with `SYLLABUS_DATABASE_TEST=1`, reads env DB and creates/removes random temporary schemas, no upstream calls |
| [tests/syllabus/storage.integration.test.mjs](../tests/syllabus/storage.integration.test.mjs) | Integration    | sync options require bounded, explicit refresh controls                                                                                                                                                              |
| [tests/syllabus/teacher-data.test.mjs](../tests/syllabus/teacher-data.test.mjs)               | Unit           | teacher ratings require exact OSU identities and never mix instruments or people                                                                                                                                     |
| [tests/syllabus/time.test.mjs](../tests/syllabus/time.test.mjs)                               | Unit           | official timestamps follow the browser zone with an explicit timezone label                                                                                                                                          |
| [tests/syllabus/transport.test.mjs](../tests/syllabus/transport.test.mjs)                     | Unit           | explicit update checks replace the document cache without replaying stale versions                                                                                                                                   |

### tests

| Script                                                                        | Type        | Purpose                      |
| ----------------------------------------------------------------------------- | ----------- | ---------------------------- |
| [tests/test_identity_pdf_research.py](../tests/test_identity_pdf_research.py) | Unit        | Identity pdf research checks |
| [tests/test_identity_research.py](../tests/test_identity_research.py)         | Unit        | Identity research checks     |
| [tests/test_identity_research_db.py](../tests/test_identity_research_db.py)   | Integration | Identity research db checks  |

### translation

| Script                                                                                                                  | Type        | Purpose                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| [tests/translation/local-model.browser.mjs](../tests/translation/local-model.browser.mjs)                               | Browser     | Local model checks                                                                                           |
| [tests/translation/onboarding.browser.mjs](../tests/translation/onboarding.browser.mjs)                                 | Browser     | Onboarding checks                                                                                            |
| [tests/translation/provider-state.integration.test.mjs](../tests/translation/provider-state.integration.test.mjs)       | Integration | database state coordinates workers, fences late outcomes, survives restart and isolates browser observations |
| [tests/translation/provider-state.test.mjs](../tests/translation/provider-state.test.mjs)                               | Unit        | manual slow-node admission keeps capacity limits, real failure cooldowns and operator disable                |
| [tests/translation/translation-browser-usage.test.mjs](../tests/translation/translation-browser-usage.test.mjs)         | Unit        | browser usage reports only bounded metadata and never influences provider health                             |
| [tests/translation/translation-browser.test.mjs](../tests/translation/translation-browser.test.mjs)                     | Unit        | feature and language-pair probes never create a translator or download a model                               |
| [tests/translation/translation-concurrency.test.mjs](../tests/translation/translation-concurrency.test.mjs)             | Unit        | queued work can reuse a result completed by another mode without renewing its TTL                            |
| [tests/translation/translation-gateway.test.mjs](../tests/translation/translation-gateway.test.mjs)                     | Unit        | NAS requests use configured model, target prompt, Access headers and non-streaming output                    |
| [tests/translation/translation-handler.test.mjs](../tests/translation/translation-handler.test.mjs)                     | Unit        | legacy and batch requests expose only normalized no-store results                                            |
| [tests/translation/translation-management.test.mjs](../tests/translation/translation-management.test.mjs)               | Unit        | inspection and ordinary management never replace live registration with shell configuration                  |
| [tests/translation/translation-model.test.mjs](../tests/translation/translation-model.test.mjs)                         | Unit        | manual Google skips the NAS API, shares duplicates and keeps device-side endpoint recovery                   |
| [tests/translation/translation-onboarding.test.mjs](../tests/translation/translation-onboarding.test.mjs)               | Unit        | only a non-English page activates the guide, with no server-side storage access                              |
| [tests/translation/translation-recovery.test.mjs](../tests/translation/translation-recovery.test.mjs)                   | Unit        | temporary NAS failures expire and the same input can probe and recover                                       |
| [tests/translation/translation-retry.test.mjs](../tests/translation/translation-retry.test.mjs)                         | Unit        | snippet failures back off exponentially, honor longer hints and reset after recovery or key changes          |
| [tests/translation/translation-scheduler.test.mjs](../tests/translation/translation-scheduler.test.mjs)                 | Unit        | bounds concurrent snippets and deduplicates duplicate previews and details                                   |
| [tests/translation/translation-service.test.mjs](../tests/translation/translation-service.test.mjs)                     | Unit        | translation actions distinguish bilingual hiding from replaced text                                          |
| [tests/translation/translation-usage.integration.test.mjs](../tests/translation/translation-usage.integration.test.mjs) | Integration | PostgreSQL schema aggregates atomically, constrains dimensions and prunes old days                           |
| [tests/translation/translation-usage.test.mjs](../tests/translation/translation-usage.test.mjs)                         | Unit        | usage stores only small daily aggregates with bounded flush frequency                                        |
| [tests/translation/word-cloud-preference.test.mjs](../tests/translation/word-cloud-preference.test.mjs)                 | Unit        | new and legacy users keep cloud auto-translation off until a dedicated explicit opt-in                       |

Fixture files such as `tests/syllabus/fixtures.mjs` and HTML samples support these tests and are not standalone test commands. `scripts/catalog/benchmark-search.mjs` measures localhost search concurrency; `scripts/search/evaluate.mjs` evaluates corpus recall. Neither is part of the default unit suite.

## Account, favorites and replay checks

`USER_DATA_INTEGRATION=1` enables auth, sharing and sync database tests. They create random disposable tables/schemas and remove them afterward; no real mail is sent. `USER_DATA_TEST_DATABASE_URL` can select a dedicated database; otherwise environment files supply the database. The sharing browser test requires `ALLOW_SERVER_WRITES=1`, creates synthetic guest shares and revokes them in cleanup, retaining audit rows; remote targets additionally require `ALLOW_REMOTE_USER_DATA_TESTS=1`. Sync and replay browser checks intercept auth/sync or collector traffic and do not write server favorites. Browser tests use `USER_DATA_TEST_BASE_URL`; sharing/sync screenshots use `USER_DATA_SCREENSHOT_DIR`.

| Script                                                                                                      | Type        | Purpose                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tests/analytics/privacy.test.mjs](../tests/analytics/privacy.test.mjs)                                     | Unit        | Replay defaults, all-route eligibility, serialized filtering and capability capture                                                                                                                                                                              |
| [tests/analytics/replay.browser.mjs](../tests/analytics/replay.browser.mjs)                                 | Browser     | All-page recorder mounting, remote-only options and persisted opt-out; collectors mocked                                                                                                                                                                         |
| [tests/user-data/history.test.mjs](../tests/user-data/history.test.mjs)                                     | Unit        | Local history deduplication, retention, bounds and safe navigation                                                                                                                                                                                               |
| [tests/user-data/workspace.test.mjs](../tests/user-data/workspace.test.mjs)                                 | Unit        | Atomic local snapshots, per-field deltas, exact acknowledgements and corrupt-data handling                                                                                                                                                                       |
| [tests/user-data/local.test.mjs](../tests/user-data/local.test.mjs)                                         | Unit        | Import/removal/undo preserve complete snapshots and intervening edits                                                                                                                                                                                            |
| [tests/user-data/exchange.test.mjs](../tests/user-data/exchange.test.mjs)                                   | Unit        | Four-kind exchange validation, limits, public redaction and import identity                                                                                                                                                                                      |
| [tests/user-data/auth.test.mjs](../tests/user-data/auth.test.mjs)                                           | Unit        | Pinned origins, bounded streamed bodies and isolated development namespaces                                                                                                                                                                                      |
| [tests/user-data/auth-errors.test.mjs](../tests/user-data/auth-errors.test.mjs)                             | Unit        | Password, OTP, origin, throttle and passkey error classification; no services or writes                                                                                                                                                                          |
| [tests/user-data/auth-boundary.integration.test.mjs](../tests/user-data/auth-boundary.integration.test.mjs) | Integration | `USER_DATA_INTEGRATION=1`; disposable PostgreSQL schema; auth HTTP guards, policy acknowledgment, 8-character passwords, domain-scoped foreign keys, one-use school-mail codes, loopback origins and signed WebAuthn email matching; mocked delivery and cleanup |
| [tests/user-data/auth.integration.test.mjs](../tests/user-data/auth.integration.test.mjs)                   | Integration | Real email-OTP/password/passkey/session/recovery protocols; injected delivery, disposable auth tables                                                                                                                                                            |
| [tests/user-data/sharing.integration.test.mjs](../tests/user-data/sharing.integration.test.mjs)             | Integration | Real SQL capabilities, expiry, codes, ownership, counters, concurrent quotas and retry receipts                                                                                                                                                                  |
| [tests/user-data/sharing.browser.mjs](../tests/user-data/sharing.browser.mjs)                               | Browser     | Creates and revokes synthetic guest shares; partial import, in-place details, retry and mobile management                                                                                                                                                        |
| [tests/user-data/sync-model.test.mjs](../tests/user-data/sync-model.test.mjs)                               | Unit        | In-flight edits, deletion conflicts, cursor expiry and account workspace keys                                                                                                                                                                                    |
| [tests/user-data/sync.integration.test.mjs](../tests/user-data/sync.integration.test.mjs)                   | Integration | Real SQL versioning, replay, concurrent conflicts, deletion, ownership and stale reconciliation                                                                                                                                                                  |
| [tests/user-data/sync.browser.mjs](../tests/user-data/sync.browser.mjs)                                     | Browser     | Mocked auth/sync; two independent devices, lost response/reload, conflicts, pause/resume and guest isolation                                                                                                                                                     |

```sh
USER_DATA_INTEGRATION=1 node --test tests/user-data/*.integration.test.mjs
node tests/analytics/replay.browser.mjs
node tests/user-data/sync.browser.mjs
ALLOW_SERVER_WRITES=1 node tests/user-data/sharing.browser.mjs
```

Temporary transfer tests use the sharing database/browser flags. The browser test creates synthetic transfers and revokes them in cleanup, retaining audit rows.

| Script                                                                                              | Type        | Purpose                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| [tests/user-data/transfers.integration.test.mjs](../tests/user-data/transfers.integration.test.mjs) | Integration | Real SQL pairing approval, ownership, concurrent leases, expiry, idempotent completion and read-only access    |
| [tests/user-data/transfers.browser.mjs](../tests/user-data/transfers.browser.mjs)                   | Browser     | Real API two-browser pairing, partial import, refresh recovery, lost completion response and 320/390px layouts |

Page-link browser tests require `ALLOW_SERVER_WRITES=1`, create synthetic public links and delete them through the owner API in cleanup. Course source requests and external collectors are intercepted. Database tests use `USER_DATA_INTEGRATION=1` and disposable schemas; target/opt-in variables match other sharing tests.

| Script                                                                                                | Type        | Purpose                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| [tests/user-data/page-links.test.mjs](../tests/user-data/page-links.test.mjs)                         | Unit        | Public URL allowlist, secret removal and exact course/detail identities                                         |
| [tests/user-data/page-links.integration.test.mjs](../tests/user-data/page-links.integration.test.mjs) | Integration | Real SQL canonical-link reuse, public snapshots and separate preview/open counters                              |
| [tests/user-data/page-links.browser.mjs](../tests/user-data/page-links.browser.mjs)                   | Browser     | Real link creation and removal, bot previews, missing-result course drawers, reference anchors and cancellation |

First-party telemetry database checks use `USER_DATA_INTEGRATION=1`. The browser test mocks collectors and other data APIs, writes no live telemetry, and uses `USER_DATA_TEST_BASE_URL` with an isolated browser profile.

| Script                                                                                              | Type        | Purpose                                                                                              |
| --------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| [tests/user-data/telemetry.test.mjs](../tests/user-data/telemetry.test.mjs)                         | Unit        | Typed event redaction, query normalization, stable instructor keys and trusted network headers       |
| [tests/user-data/telemetry.integration.test.mjs](../tests/user-data/telemetry.integration.test.mjs) | Integration | Atomic batched SQL replay receipts, daily dimensions and IP provenance; disposable schema            |
| [tests/user-data/telemetry.browser.mjs](../tests/user-data/telemetry.browser.mjs)                   | Browser     | Mocked collector; durable retries, Strict Mode, cross-tab favorites, actual course opens and opt-out |

Maintenance/statistics database checks use `USER_DATA_INTEGRATION=1` and random disposable schemas. Popular-page browser tests mock APIs and write no live ranking or visit data; they use `USER_DATA_TEST_BASE_URL` and `USER_DATA_SCREENSHOT_DIR`.

| Script                                                                                                  | Type        | Purpose                                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| [tests/user-data/maintenance.integration.test.mjs](../tests/user-data/maintenance.integration.test.mjs) | Integration | Ownership-checked retention, dry runs, permanent source preservation, live favorites and expired-cursor reconciliation   |
| [tests/user-data/statistics.integration.test.mjs](../tests/user-data/statistics.integration.test.mjs)   | Integration | Active-account popularity, deletion, ambiguous-identity exclusion, public summaries and environment-separated aggregates |
| [tests/user-data/popular.browser.mjs](../tests/user-data/popular.browser.mjs)                           | Browser     | Mocked bilingual 320/390/1440px lists, initial-render errors, navigation, in-place details and empty states              |

Diagnostic database tests use `USER_DATA_INTEGRATION=1`, generate a disposable schema and remove it afterward. Diagnostic browser tests read browser/device capabilities locally after explicit toggles; collectors and submission APIs are intercepted, so they upload no reports. Set `USER_DATA_TEST_BASE_URL`, `USER_DATA_SCREENSHOT_DIR`, and the usual Playwright module/executable overrides as needed. Statistics checks use synthetic responses and include a locked administrator view.

| Script                                                                                              | Type        | Purpose                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| [tests/diagnostics/protocol.test.mjs](../tests/diagnostics/protocol.test.mjs)                       | Unit        | Complete registry, consent categories, budgets, credential-field rejection, trusted headers and bounded JPEG metadata |
| [tests/diagnostics/reports.integration.test.mjs](../tests/diagnostics/reports.integration.test.mjs) | Integration | Idempotent session-bound reports, independent observations, seven-day visibility and exact keyset pagination          |
| [tests/diagnostics/diagnostics.browser.mjs](../tests/diagnostics/diagnostics.browser.mjs)           | Browser     | Local checks, opt-in fingerprints, permission isolation, reviewed retry and 320/390/1440px layouts                    |
| [tests/diagnostics/statistics.browser.mjs](../tests/diagnostics/statistics.browser.mjs)             | Browser     | Protected loading, long request fields, report preview and 320/390/768/1440px layouts                                 |

The capacity browser check seeds an isolated browser profile with synthetic favorites, mocks data/collector APIs, and tests a failed undo after an intervening addition. It writes no server data. Use `USER_DATA_TEST_BASE_URL` and `USER_DATA_SCREENSHOT_DIR` as for the other browser checks.

| Script                                                                          | Type    | Purpose                                                                                                                             |
| ------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [tests/user-data/capacity.browser.mjs](../tests/user-data/capacity.browser.mjs) | Browser | Full-collection errors, non-destructive undo failure, retained intervening favorites, empty export rejection and phone toast layout |

The live replay test is excluded from `pnpm test` and requires `ALLOW_UMAMI_WRITES=1`. It uses actual Umami scripts/configuration and creates synthetic remote events and recordings; application APIs are mocked. `REPLAY_REQUIRE_ROUND_TRIP=1` requires authenticated retrieval using server-only `UMAMI_API_KEY`. Use `REPLAY_TEST_WIDTH=390` for the phone run. See [replay operations](analytics/umami.md) for production-build and browser settings.

| Script                                                                                | Type                     | Purpose                                                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| [tests/analytics/replay-live.browser.mjs](../tests/analytics/replay-live.browser.mjs) | Live browser integration | Real chunk acceptance, single-visit startup, authenticated replay retrieval, snapshots, menus, paused portals and scrolling |

Concurrent saved-item checks use two tabs in one isolated browser context, share local storage/IndexedDB, and mock all APIs. They observe real transaction callbacks and assert that overlapping remove/undo operations retain both items. No server data is written.

| Script                                                                                          | Type    | Purpose                                                                                      |
| ----------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| [tests/user-data/concurrent-saved.browser.mjs](../tests/user-data/concurrent-saved.browser.mjs) | Browser | 32 cross-tab commits, shared transaction coverage, retained unrelated edits and phone layout |

The scoped-management browser check uses a synthetic account and local/paused-cloud snapshots. Authentication and all API traffic are mocked; cross-tab sign-out must remove the prior account's management rows, selection and draft name without a page reload.

| Script                                                                                            | Type    | Purpose                                                            |
| ------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------ |
| [tests/user-data/scoped-management.browser.mjs](../tests/user-data/scoped-management.browser.mjs) | Browser | Workspace-scoped management state and cross-tab sign-out isolation |

Collection and backup browser checks use the Node/Playwright environment above. All APIs are mocked; writes stay in isolated browser storage and local downloads. The migration integration check requires `USER_DATA_INTEGRATION=1`, creates a random disposable account schema, runs the real CLI and removes its temporary tables. The backup unit test does not connect to PostgreSQL.

| Script                                                                                                        | Type         | Purpose                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [tests/user-data/collections.test.mjs](../tests/user-data/collections.test.mjs)                               | Unit         | Private collection validation, preserved organization, bounded batches and rename conflicts                                     |
| [tests/user-data/compact-tabs.browser.mjs](../tests/user-data/compact-tabs.browser.mjs)                       | Browser      | Compact category tabs stay above results at 1440/768/390/320 pixels; synthetic local data, external requests blocked            |
| [tests/user-data/collections.browser.mjs](../tests/user-data/collections.browser.mjs)                         | Browser      | Create, organize, rename, delete/undo, scoped export and private restore at 1440/768/390/320 pixels                             |
| [tests/user-data/rmp-favorites.test.mjs](../tests/user-data/rmp-favorites.test.mjs)                           | Unit         | RMP source identities, preserved ratings and public exchange validation                                                         |
| [tests/user-data/rmp-favorites.browser.mjs](../tests/user-data/rmp-favorites.browser.mjs)                     | Browser      | Library/profile/saved-page favorites and Undo with same-name verified/unconfirmed profiles                                      |
| [tests/user-data/backup.test.mjs](../tests/user-data/backup.test.mjs)                                         | Unit         | Exact auth model allowlist and credential-safe backup connection options                                                        |
| [tests/user-data/auth-migration.integration.test.mjs](../tests/user-data/auth-migration.integration.test.mjs) | Integration  | Refuse unowned authentication tables in an explicit account schema                                                              |
| [tests/user-data/history.browser.mjs](../tests/user-data/history.browser.mjs)                                 | Browser      | Mocked APIs; sanitized JSON download, custom clear/cancel dialog, stale cross-tab deletion at 1440 English / 320 Chinese pixels |
| [tests/user-data/email-login.live.browser.mjs](../tests/user-data/email-login.live.browser.mjs)               | Live browser | Two real delivered email codes, consumed-code rejection, same account on independent devices and separate sign-out              |

Run the history UI check with `node tests/user-data/history.browser.mjs`. It uses isolated browser storage, triggers a local download and sends no real mail or external analytics.

The live email check requires configured SMTP and an interactive terminal. Set `ALLOW_SMTP_TEST_EMAILS=1` and `AUTH_TEST_EMAIL` to a mailbox you control, then run `node tests/user-data/email-login.live.browser.mjs`. Enter each delivered six-digit code when prompted; terminal echo is disabled. The script sends two real messages, can create an account in the target server's authentication namespace, and creates then signs out two sessions. It does not upload favorites. Use the development server by default; remote targets additionally require `ALLOW_REMOTE_USER_DATA_TESTS=1`. Browser module/executable variables and `USER_DATA_TEST_BASE_URL` match the other user-data checks. Do not store codes in scripts, logs or CI variables.

```sh
node --test tests/user-data/collections.test.mjs tests/user-data/rmp-favorites.test.mjs tests/user-data/backup.test.mjs
node tests/user-data/collections.browser.mjs
node tests/user-data/compact-tabs.browser.mjs
node tests/user-data/rmp-favorites.browser.mjs
USER_DATA_INTEGRATION=1 node --test tests/user-data/auth-migration.integration.test.mjs
```

## Browser compatibility and synchronization budgets

The unit checks below run in default `pnpm test` without external requests. The syllabus integration check requires `SYLLABUS_DATABASE_TEST=1` and `DATABASE_URL`; it creates, writes and removes a random disposable schema, mocks official requests and does not rewrite business archives. Catalog history integration also compares chunked results with the original SQL and verifies interrupted rollback. `telemetry.browser.mjs` additionally disables randomUUID and then all crypto to verify navigation remains usable; collectors are mocked. RMP Python collector tests cover request/runtime ceilings, long cooldown pauses and completeness checks after pipeline flush.

| Script                                                                                                    | Type        | Purpose                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| [tests/user-data/uuid.test.mjs](../tests/user-data/uuid.test.mjs)                                         | Unit        | Secure UUID fallback when randomUUID is unavailable; native binding and failure without a secure random source     |
| [tests/catalog/change-budgets.test.mjs](../tests/catalog/change-budgets.test.mjs)                         | Unit        | Bounded history batches/runtime and no completion marker after expiry                                              |
| [tests/syllabus/refresh-budget.test.mjs](../tests/syllabus/refresh-budget.test.mjs)                       | Unit        | Runtime-aware pacing and Retry-After pause without extra requests                                                  |
| [tests/syllabus/refresh-cache.test.mjs](../tests/syllabus/refresh-cache.test.mjs)                         | Unit        | Active/archive/missing freshness, closing week and final post-term check                                           |
| [tests/syllabus/refresh-cache.integration.test.mjs](../tests/syllabus/refresh-cache.integration.test.mjs) | Integration | Real SQL cache reuse, changed metadata, fresh index after pause, migration seeding, failures and retained archives |

## Personal workspace and authentication checks

These unit checks run with `pnpm test` without external requests. The account integration check requires PostgreSQL and `USER_DATA_INTEGRATION=1`; it creates and deletes one random test schema, uses an in-memory email delivery stub, and sends no real mail. It exercises registration, verification, password login, OTP login and consumed-code rejection. Other user-data integration tests also use random disposable namespaces.

| Script                                                                                                        | Type        | Purpose                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [tests/user-data/storage-status.test.mjs](../tests/user-data/storage-status.test.mjs)                         | Unit        | Cloud acknowledgement, pre-outbox edits and pending removals never show a false saved status                                          |
| [tests/user-data/domains.test.mjs](../tests/user-data/domains.test.mjs)                                       | Unit        | Account/analytics/diagnostic namespace separation and safe responsive code emails                                                     |
| [tests/user-data/recommendations.test.mjs](../tests/user-data/recommendations.test.mjs)                       | Unit        | Evidence-weighted recommendations, eligibility of unrated courses, preserved multi-view selections and permission-only data rejection |
| [tests/user-data/account-domain.integration.test.mjs](../tests/user-data/account-domain.integration.test.mjs) | Integration | Complete verified account flow in a disposable explicit schema; mocked email                                                          |

`USER_DATA_INTEGRATION=1 node --test tests/user-data/*.integration.test.mjs tests/diagnostics/reports.integration.test.mjs` runs the related database suite. It writes only its disposable schemas. Production application APIs and real SMTP delivery are not used.

## Prepared search regression tests

`tests/search/prepared-corpus.test.mjs` uses synthetic public course fixtures and
mock database responses to verify engine equivalence, compressed artifact integrity,
generation matching, schema-free request reads, preparation reuse and publication
ordering. It makes no network calls and writes no database.
`tests/catalog/sync-cli.integration.test.mjs` includes migration 6 and staged index
preparation when explicitly enabled with `CATALOG_DATABASE_TEST=1`; it writes only
its disposable catalog schema. A skipped integration run is not validation of
production PostgreSQL performance.

```sh
node --test tests/search/prepared-corpus.test.mjs
```

`tests/translation/translation-release.test.mjs` covers confirmed completion,
rejected or failed finish, timeout settlement, and cleanup races with in-memory
provider/store mocks. Its six cases make no external calls or database writes.

```sh
node --test tests/translation/translation-release.test.mjs
```

`tests/search/prepared-corpus.integration.test.mjs` optionally loads an already
installed PGlite module through `PGLITE_MODULE`. It creates only in-memory tables
and validates migration 6, compressed bytea restoration, corruption repair and
retention that protects published generations. It does not use `DATABASE_URL`,
credentials, a network database, or external services. Native PostgreSQL
connectivity and concurrent-session behavior still require separate validation.

```sh
PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test tests/search/prepared-corpus.integration.test.mjs
```

## Account readiness regression

Run `node --test tests/user-data/account-status.test.mjs` (also included in `pnpm test`). The in-memory tests cover missing extension tables, pending or failed readiness requests, complete setup, and fail-closed guest entry. They do not connect to a database, change accounts, or call external services. A valid session keeps the account workspace visible when extensions are unavailable; school-email settings remain unavailable until their tables exist. This is degraded UI handling, not a substitute for applying the user-data migrations.

## Collection icon picker

`node --test tests/user-data/collection-icons.test.mjs` checks all bundled icon identities against the saved-collection schema, Chinese/English local search and categories, required Lucide SVG stroke attributes, and the search Enter/selection cues. It needs Node.js 24+ and installed dependencies, writes no data, and calls no external service. These assertions do not replace browser verification.

The picker bundles 99 local icons in eight categories. Search does not send queries to an icon provider. Existing icon identifiers remain valid. Neutral tiles use the shared foreground/surface tokens; selection adds an accent border and check mark rather than relying only on color.

Browser regression: open a new collection, search in both languages, filter categories, test a query with no results, and press Enter in search without saving. Select an icon, save a synthetic group, refresh and reopen it; the selected icon must persist. Changing only filters must not trigger the unsaved-draft warning, while changing the icon must. Check icon strokes and focus rings at 320, 390, 768 and 1440px. Use an isolated local origin without production credentials; saving a group writes to that origin's browser storage.

## Schedule planning

- `tests/planning/model.test.mjs`: Whitelist, local serialization, storage failures and course links. `node --test tests/planning/model.test.mjs`. No services or external writes.
- `tests/planning/parser.test.mjs`: Synthetic layouts, unknown credits, placeholders, conflicting versions and print ordering. `node --test tests/planning/parser.test.mjs`. No services or external writes.
- `tests/planning/curriculum.test.mjs`: Official candidates, isolated namespace and import validation. `node --test tests/planning/curriculum.test.mjs`. No services or external writes.
- `tests/planning/test_sync.py`: Public URL restrictions and unknown layouts. `python3 -m unittest discover -s tests/planning -p 'test_*.py'`. Offline; no database or network writes.
- `tests/planning/workspace.browser.mjs`: Automatic local import, movement persistence, backup, bilingual responsive views and privacy. `node tests/planning/workspace.browser.mjs`. Requires a running local app, Playwright and Chromium; configure `BASE_URL`, `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` as needed. Writes synthetic data only to isolated browser storage and temporary screenshots; no official-source or production database calls.
- `tests/planning/pdf.integration.test.mjs`: Exercises PDF.js extraction into the whitelist model using an in-memory generated PDF; `node --test tests/planning/pdf.integration.test.mjs`. No browser, database or network required.
- `tests/planning/synthetic-pdf.mjs`: Shared synthetic PDF generator for the browser and PDF integration tests; not standalone and writes no private data.
- `tests/planning/import-guard.test.mjs`: Late completion versus edits, loading, deletion and newer imports. `node --test tests/planning/import-guard.test.mjs`. Synthetic data only; no network service, production configuration or credentials.
- `tests/planning/snapshots.test.mjs`: Multi-source identifiers, per-program versions, rule hierarchy and duplicate-safe allocation checks. `node --test tests/planning/snapshots.test.mjs`. Synthetic data only; no network service, production configuration or credentials.
- `tests/planning/database.integration.test.mjs`: Real planning SQL in isolated in-memory PGlite PostgreSQL; migrations, foreign keys, review constraints and rollback. `node --test tests/planning/database.integration.test.mjs`. Synthetic data only; no network service, production configuration or credentials.
- `tests/planning/private-regression.mjs`: Opt-in local private PDF regression. Set `PLANNING_PRIVATE_PDF_DIR` to the local attachment directory, then run `node tests/planning/private-regression.mjs`. By default reads PDFs only; explicitly set `PLANNING_PRIVATE_HAR_COMPARE=1` for response-only offline HAR comparison. Writes no extracted text and emits only type-level counts/failure totals and agreement aggregates. Do not supply private attachments to public CI or upload source data.

- `tests/planning/private-har.test.mjs`: Synthetic XSSI/base64 response decoding, academic-field minimization, aggregate status/credit/year agreement, normalized requirement parent edges and exclusion of ambiguous repeated courses. No real attachment fixtures.

- `tests/planning/audit-evidence.test.mjs`: Distinguishes audit options from observations, explicit audit credits, layout hints and unreviewed hierarchy. `node --test tests/planning/audit-evidence.test.mjs`. Synthetic/public fixtures only; no external services, network or persistent writes (PGlite is in memory).

- `tests/planning/batch-import.test.mjs`: Atomic multi-file append/replace, bounded JSON restore and cancellation. `node --test tests/planning/batch-import.test.mjs`. Synthetic/public fixtures only; no external services, network or persistent writes (PGlite is in memory).

- `tests/planning/schedule.test.mjs`: Separate placement overrides, locked credit groups and duplicate-safe semester totals. `node --test tests/planning/schedule.test.mjs`. Synthetic/public fixtures only; no external services, network or persistent writes (PGlite is in memory).

- `tests/planning/template.test.mjs`: Requirements-only seed whitelist, explicit review gate, remapped references and cycle rejection. `node --test tests/planning/template.test.mjs`. Synthetic/public fixtures only; no external services, network or persistent writes (PGlite is in memory).

- `tests/planning/archive.integration.test.mjs`: Real PGlite raw-byte archive, hash verification, immutable parser revisions, Unicode compatibility, version collision rejection, rollback and backup restoration. `node --test tests/planning/archive.integration.test.mjs`. Synthetic/public fixtures only; no external services, network or persistent writes (PGlite is in memory).

- `tests/planning/recommendation.test.mjs`: Workload/prefix caps, completed-course exclusion, rating shrinkage/request allowlist, pending public samples and source-preserving draft application. `node --test tests/planning/recommendation.test.mjs`. Synthetic/public fixtures only; no external services, network or persistent writes (PGlite is in memory).

- `tests/planning/test_inventory.py`: Official college index, title/version metadata and source-discovery boundaries. `python3 -m unittest discover -s tests/planning -p 'test_*.py'`. Offline synthetic fixtures; no services or external writes.

- `tests/planning/test_public_layouts.py`: Official subject aliases, paired-year HTML, optional summer, Music/Engineering/Nursing/Knowlton/Public Health PDF columns, wrapped credits, alternatives and footer exclusion. `python3 -m unittest discover -s tests/planning -p 'test_*.py'`. Offline synthetic fixtures; no services or external writes.

- `tests/planning/directory.test.mjs`: College/program coverage, bounded paging, explicit requirement-term facets and public metadata minimization. Synthetic/public inputs only; no external network, database or writes. `node --test tests/planning/directory.test.mjs`.

- `tests/planning/import-profile.test.mjs` checks minimal report selection, explicit Official/Planned mode and program headers. Run `node --test tests/planning/import-profile.test.mjs`. Synthetic input, no network or writes.

- `tests/planning/course-catalog.test.mjs` checks identifier allowlists, shared reads, variable credits and inherited prerequisite prefixes. Run `node --test tests/planning/course-catalog.test.mjs`. Mock transport, no network or writes.

- `tests/planning/workspace.test.mjs` checks duplicate-safe placement, protected records across sources and semester defaults. Run `node --test tests/planning/workspace.test.mjs`. Synthetic input, no network or writes.

- `tests/test_planning_samples.py` checks inspected CSE table layouts and grouped Earth Sciences choices. Run `python3 -m unittest discover -s tests -p test_planning_samples.py`. Offline, no services or writes.

- `tests/planning/automatic-import.test.mjs` checks cross-report attendance precedence, full academic titles, automatic serialization and metadata privacy. Run `node --test tests/planning/automatic-import.test.mjs`. Synthetic inputs only; no network or persistent writes.

- `tests/planning/requirement-search.test.mjs` checks exact GE attributes and bounded course-family fallback. Run `node --test tests/planning/requirement-search.test.mjs`. Offline synthetic inputs; no network or writes.

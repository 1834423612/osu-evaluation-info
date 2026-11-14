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

| Environment flag               | Scope and effects                                                              |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `CATALOG_DATABASE_TEST=1`      | Catalog snapshot, term-head and CLI recovery tests in disposable schemas       |
| `SYLLABUS_DATABASE_TEST=1`     | Syllabus index/document retention in disposable schemas                        |
| `TRANSLATION_DATABASE_TEST=1`  | Provider coordination and usage aggregation in disposable schemas              |
| `RMP_INTEGRATION_TESTS=1`      | Read-only queries against existing RMP/catalog/evaluation data                 |
| `RMP_RESEARCH_DATABASE_TEST=1` | Python identity evidence database tests in temporary schemas                   |
| `CATALOG_LIVE_TEST=1`          | Real OSU requests and publication into disposable storage; not a default check |

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

| Script                                                                                        | Type           | Purpose                                                                                            |
| --------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| [tests/syllabus/assets.test.mjs](../tests/syllabus/assets.test.mjs)                           | Unit           | relay accepts only fixed public OSU image and BUX font paths                                       |
| [tests/syllabus/check-pdf.py](../tests/syllabus/check-pdf.py)                                 | PDF inspection | OSU · Simple Syllabus                                                                              |
| [tests/syllabus/choices.test.mjs](../tests/syllabus/choices.test.mjs)                         | Unit           | default order is stable; unavailable syllabi remain after available sections                       |
| [tests/syllabus/experience.browser.mjs](../tests/syllabus/experience.browser.mjs)             | Browser        | Responsive interaction and feature flow                                                            |
| [tests/syllabus/fonts.browser.mjs](../tests/syllabus/fonts.browser.mjs)                       | Browser        | Real CDN fonts, CORS and iframe CSP                                                                |
| [tests/syllabus/insights.test.mjs](../tests/syllabus/insights.test.mjs)                       | Unit           | turns source week paragraphs into complete timeline entries and preserves legends                  |
| [tests/syllabus/normalize.test.mjs](../tests/syllabus/normalize.test.mjs)                     | Unit           | discovers real term UUIDs and keeps current independent of catalog codes                           |
| [tests/syllabus/official-render.test.mjs](../tests/syllabus/official-render.test.mjs)         | Unit           | keeps published layout classes, typography, table widths and image sources                         |
| [tests/syllabus/pdf-content.test.mjs](../tests/syllabus/pdf-content.test.mjs)                 | Unit           | official gray heading rules keep their browser color in PDF canvas                                 |
| [tests/syllabus/pdf-typography.test.mjs](../tests/syllabus/pdf-typography.test.mjs)           | Unit           | CSS line height compensates for the actual embedded font ascent and descent                        |
| [tests/syllabus/save.test.mjs](../tests/syllabus/save.test.mjs)                               | Unit           | save picker cancellation never becomes an automatic download                                       |
| [tests/syllabus/saved.test.mjs](../tests/syllabus/saved.test.mjs)                             | Unit           | first official observation establishes a baseline; later versions require explicit acknowledgement |
| [tests/syllabus/scroll-chain.test.mjs](../tests/syllabus/scroll-chain.test.mjs)               | Unit           | short and exhausted documents pass the whole gesture to the panel                                  |
| [tests/syllabus/scroll-intent.test.mjs](../tests/syllabus/scroll-intent.test.mjs)             | Unit           | fast wheel bursts stay in the hovered document, including the event that reaches its edge          |
| [tests/syllabus/selection.test.mjs](../tests/syllabus/selection.test.mjs)                     | Unit           | default skips missing, empty and failed documents while preserving source order                    |
| [tests/syllabus/source-layout.browser.mjs](../tests/syllabus/source-layout.browser.mjs)       | Browser        | Real official content, dates and responsive reading                                                |
| [tests/syllabus/storage.integration.test.mjs](../tests/syllabus/storage.integration.test.mjs) | Integration    | sync options require bounded, explicit refresh controls                                            |
| [tests/syllabus/teacher-data.test.mjs](../tests/syllabus/teacher-data.test.mjs)               | Unit           | teacher ratings require exact OSU identities and never mix instruments or people                   |
| [tests/syllabus/time.test.mjs](../tests/syllabus/time.test.mjs)                               | Unit           | official timestamps follow the browser zone with an explicit timezone label                        |
| [tests/syllabus/transport.test.mjs](../tests/syllabus/transport.test.mjs)                     | Unit           | explicit update checks replace the document cache without replaying stale versions                 |

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

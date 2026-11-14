# RMP faculty library and unconfirmed reviews

English · [简体中文](../zh-CN/rmp/library.md)

## Pages and navigation

`/rmp` searches saved profiles by campus, name, department, raw course code, supported course aliases and official identity status. It shares the Courses navigation group with course search. The homepage remains `/`.

`/rmp/[id]` shows one source profile and its reviews across courses. Course navigation is a desktop sidebar and a compact mobile selector. Raw RMP course labels remain distinct; misspellings and abbreviations are not silently merged on this page. Course filtering, pagination, browser back, source links, teacher replies and review details remain available.

Grid/list mode is stored locally as `course-atlas:rmp-view:v1`. Switching still works in page memory when browser storage is unavailable. The library does not duplicate the catalog, official evaluation trends or section search.

## Course groups and score eligibility

The course panel separates current-term teachers from historical profiles using the current official section roster, never the age of a review. Exact OSU account matches take precedence. A unique normalized full name can place an unconfirmed profile in a group, but cannot verify identity or qualify its score. Historical SEI/SSLE rosters are not current teaching rosters.

Both verified and unconfirmed profiles have inline expandable, paginated, translatable comments. Identity and teaching association are distinct: a known person with insufficient teaching evidence is labelled as an unconfirmed teaching link.

Course quality, difficulty and tag totals use only profiles with verified identity and teaching association. An unconfirmed profile keeps its own scores and comments even when it is the only source, but never enters course totals. Counts and links remain visible without inventing zero or mixed scores. Individual teacher APIs remain scoped to the selected official account.

Teacher cards prefer reviews from the last two years. When recent samples are absent, the course-specific historical mean is shown explicitly as historical; the recent sample count stays zero. The course preview's recent aggregate remains a separate measure.

Course leads require the same RMP campus and an exact code or evidence-backed course mapping. Similar names, number fragments and other campuses are insufficient. Preview and pagination use the same profile predicate. Unknown names never produce invented OSU email addresses. Search cards without RMP data show a text entry, without an empty-result illustration.

## Review fields

The shared review component displays overall quality, helpfulness, clarity, difficulty and willingness to take again. Grade, attendance, textbook, online and for-credit facts are in expandable details. Existing teacher replies are retained. Helpful/unhelpful counts are read-only source observations, not voting buttons.

Missing values remain distinct from `false` and `0`. A negative textbook sentinel is missing; undocumented numeric enumerations retain their `n (RMP)` value. Preview and paginated comments are not truncated. A missing re-enrollment percentage (`-1`) is not displayed as a negative percentage.

See the [RMP rating scale](https://help.ratemyprofessors.com/article/31-rating-scale).

## Retention

Source professors, reviews and campus relationships have DELETE/TRUNCATE protection. An unresolved identity does not delete source data. Confirmed source removals can update soft state; the library still exposes retained records with archived/removed labels.

Ordinary course scoring excludes source-removed reviews. Profile source averages are retained from RMP, not recalculated from uncertain legacy supplements. Supplements without immutable RMP review IDs appear in a separate disclosure and do not duplicate review counts or scores.

```sh
pnpm rmp:library:migrate
```

## Refresh policy

Pages read the local database: 24 profiles or 12 reviews per page, with short API caching and the actual sync time. Reload reads this copy; the source link opens current RMP content.

`.github/workflows/rmp-sync.yml` targets Saturday 03:30 America/New_York. Each run allows at most 600 requests, batches at most 20 teachers, waits at least 10 seconds and normally refreshes changed profiles or pages unchecked for seven days. Budget exhaustion preserves checkpoints. A weekly schedule does not guarantee that the entire backlog refreshes in one run.

Collection does not run on each page visit. It is followed by identity and course reconciliation; explicit manual decisions survive. Mapping conflicts have bounded retries, leaving collected data for a later job. Unconfirmed new profiles are immediately browsable. GitHub schedules may be delayed; see its [schedule documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

Official catalog, syllabus and RMP jobs have separate timestamps and states.

## APIs and verification

- `GET /api/rmp/professors?q=&campus=ALL&identity=all&offset=0`
- `GET /api/rmp/professors/[id]?course=MATH1131&offset=0`
- `GET /api/rmp/course/leads?subject=MATH&catalog=1131&campus=MNS&scope=course-history`

Inputs, page sizes and offsets are bounded; SQL values are parameterized. Failures report unavailable data rather than empty reviews. Profile counts, course lists and review pages use one read-only transaction.

```sh
RMP_INTEGRATION_TESTS=1 node --env-file-if-exists=.env.local --test tests/rmp/*integration.test.mjs
node tests/rmp/library.browser.mjs
node tests/rmp/course-leads.browser.mjs
node tests/rmp/period-layout.browser.mjs
```

Browser scripts accept `PLAYWRIGHT_MODULE`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, `RMP_TEST_BASE_URL` and `RMP_TEST_OUTPUT`. They cover bilingual responsive views, browser back, real Mansfield leads, long identity controls and wheel/touch handoff.

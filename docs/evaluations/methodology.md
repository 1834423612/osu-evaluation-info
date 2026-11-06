# Evaluation data and recommendation methodology

The application queries the configured PostgreSQL `osu_eval` schema. The supplied SQL export contains the same normalized schema and 68,729 instructor-section evaluation records, 7,108 instructor identities and 8,738 course keys. Live verification on 2026-11-03 confirmed 68,729 records and term coverage SU 2022–SU 2026. These are historical evaluation results, not live evaluations of future scheduled classes.

The source is OSU's public Explorance Blue SEI/SSLE report. `source.importedAt` is the latest completed database ingestion time, not the official publication time. No demo records, inferred scores, third-party ratings or fabricated responses are substituted if the database fails. `available`, `no-data` and `unavailable` are separate states.

## Instruments

- **SEI:** through SU 2025, metric `sei_overall_item_10`, the overall instructor rating item (question 10).
- **SSLE:** from AU 2025, metric `ssle_mean_all_items`, the mean across SSLE items.

Both use a 1–5 scale but ask different questions. They have separate scores, sample totals and trend series. The summary selects the most recently available instrument. It never averages SEI and SSLE together. A course with only historical SEI results continues to show SEI explicitly.

## Course and faculty matching

Course identity uses exact official subject plus catalog number. Unknown catalogs are not joined by title or guessed. Catalog suffixes such as honors designations are retained. Unless `campus` is supplied, historical evaluation summaries cover all campuses. Supported evaluation campus codes are `COL`, `LMA`, `MNS`, `MRN`, `NWK` and `WST`.

Scheduled faculty are matched using the exact `lastname.number` identity from an `osu.edu` or `buckeyemail.osu.edu` address. Display names alone never establish a match; names collide and can change. Faculty summaries use evaluations of this exact course. A professor's scores from unrelated courses are not silently substituted. An instructor can therefore have an official email and still show no matched history for the selected course.

`responseCount` is the sum of responses to instructor evaluations. It is not a count of unique people. The same student can evaluate more than one class or instructor. `sectionCount` is the count of instructor-section evaluation records; team-taught classes can contribute one record per evaluated instructor. `responseRate` is a **percentage (0–100)** computed as total responses divided by total invited evaluations. The application must label these as responses and evaluation records rather than unique students or unique sections.

## Scores

For evaluation record _i_, let `nᵢ` be responses, `rᵢ` its published rating, and `aᵢ` its age in years. Time is approximated from the term midpoint (SP=.30, SU=.55, AU=.85 of its calendar year), because no individual submission timestamps are available.

```
wᵢ = nᵢ × 2 ^ (-max(0, aᵢ) / 2)
score = Σ(wᵢ × rᵢ) / Σ(wᵢ)
unadjustedScore = Σ(nᵢ × rᵢ) / Σ(nᵢ)
```

The two-year half-life gives recent observations greater relevance while retaining historical evidence. This is a transparent application policy, not an official OSU score or validated predictive model. Values are rounded to two decimals only after aggregation. Each term's chart point uses response weighting without time decay; term points are never linked across instruments.

`weightedResponseCount` is the sum of decayed response counts. It is not an inferential effective sample size. No confidence interval is invented: SSLE standard deviations are unavailable in the supplied data, and published section-level summary statistics cannot support claims about unique independent student observations.

## Evidence coverage and recommendation signals

A score has enough coverage for a directional signal only when all conditions hold:

- At least 30 raw responses and 30 decayed responses.
- At least two instructor-section evaluation records.
- At least two terms with observations.
- The latest term is no more than two years old.

Coverage is `limited` if any condition fails; otherwise `moderate`, upgraded to `high` with at least 100 raw responses and three records. These are descriptive evidence categories, not statistical confidence levels.

With sufficient coverage, `positive` means a time-weighted score of at least 4.2/5, `caution` means at most 3.3/5, and `mixed` is the interval between them. Otherwise the signal is `insufficient`. Thresholds use unrounded scores. These labels describe reported teaching evaluation evidence; they do not predict grades, workload, difficulty, learning outcomes, or an individual student's experience. Small score differences should not drive course decisions.

The policy is exported as `SCORING_POLICY`, version `response-decay-v1`, so changes can be reviewed and versioned centrally.

## API and performance

`GET /api/evaluations?subject=CSE&catalog=2221` returns a `CourseEvaluationSummary`. Optional parameters are `campus=COL` and repeated `email=lastname.number@osu.edu`. Invalid identifiers return 400; a database outage returns 503 with an `unavailable` summary. API errors never disclose database credentials or server error details.

`getCourseEvaluations(inputs)` accepts up to 50 courses in one call and returns a record keyed by `SUBJECT CATALOG`. Use one campus per course key in a batch; mixed-campus duplicates are rejected. Same-campus duplicates merge their instructor hints. The catalog API groups its page by campus before calling this helper, so all-campus searches retain each campus’s own history. It queries the existing indexed relational tables with bound parameters and aggregates by course, instructor, term and instrument inside PostgreSQL. Only active source rows are used. It does not scan or serialize all evaluations into the browser. A bounded process cache keeps at most 4,000 aggregate rows and 200 course keys for five minutes. A six-connection pool, four-second connect timeout and eight-second statement timeout limit resource use. Metadata uses a five-minute cache with concurrent request deduplication.

## Verification

On 2026-11-03, live batch verification for CSE 2221, MATH 1151 and a nonexistent course completed in approximately 342 ms. Results included:

- CSE 2221: SSLE 144 responses over three terms; SEI 1,093 responses over ten terms, held separately.
- MATH 1151: SSLE 1,345 responses over three terms; SEI 5,944 responses over ten terms.
- A nonexistent subject/catalog returned `no-data` rather than a zero rating.
- An unmatched official-domain email stayed unmatched.

Thirteen assertions also exercised exact email identity, rejection of external domains, instrument separation, response weighting, term charts, small-sample suppression and stale-data suppression. These observed counts may change when a new source is imported.

## Maintained scoring tests

The test suite supports **Node.js 24 or newer** and uses the built-in `node:test` runner and native TypeScript type stripping. No database, environment variables, transpiler, network access or credentials are required:

```sh
node --test tests/evaluations/scoring.test.mjs
```

The suite uses fixed dates and synthetic observations to verify instrument separation, response weighting, the two-year decay ratio, empty and zero samples, stale and insufficient evidence, threshold boundaries before rounding, evidence categories, and strict faculty email identity. Node 24.18.1 was verified. If the package does not declare an ESM type, Node may emit `MODULE_TYPELESS_PACKAGE_JSON` while detecting the TypeScript module; this warning does not affect test results.

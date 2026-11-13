# RMP course reconciliation

The matcher reads every active RMP profile, actual review course label and cached
profile course list. Official references come from complete published catalog
generations and active evaluation history. No reviews, source labels or RMP IDs
are rewritten. This is a separate identity process from tolerant course search:
ratings must retain exact catalog numbers, decimals and honors/track suffixes.

## Evidence and ambiguity

- Official subject names and codes generate initials, word prefixes and shortened
  subject forms. There is no hand-maintained course or subject alias dictionary.
- Known official subject codes retain their identities. Unknown abbreviations
  need a unique interpretation compatible with the RMP academic department or
  the identified teacher's official taught subjects. A number existing under an
  unrelated subject is insufficient evidence.
- Number-only labels require a catalog-backed academic department. No digit
  substitution, reversal, old-to-new numbering conversion or suffix removal is
  used to assign ratings.
- Teacher links require exact observed names, the same campus, academic evidence,
  overlapping courses and exactly one fully supported official identity per RMP
  profile. Several independently verified source profiles can reference the same
  OSU username; their profiles/reviews are not merged or rewritten. Competing
  official identities stay pending. A regional administrative
  department can be supplemented by the official subject taught at that campus.
- Unresolved and ambiguous rows retain their reasons and candidates. Reviewed
  accept/reject decisions take priority over automatic proposals.

For example, `BIO` can mean more than one official subject. In the audited local
snapshot, `BIOLOGY1101` exists, while `BIOLOGY1100` was not present. A Biology
review labelled `BIO1100` must remain unresolved rather than being assigned to
`BIOMSCI1100`. This observation is specific to that snapshot, not a claim about
every historical OSU catalog.

## Storage and serving

`db/schemas/rmp-course-matching.sql` is installed by a normal mapping refresh.
It adds `course_identity_match`, `course_matching_refresh`, an immutable token
normalizer, and `course_review_query`. The large review-token index is built
concurrently by the installer. Install it explicitly before deploying serving
code that depends on the new view.

Derived keys are `(professor_id, campus_code, raw_course_token)`. Each accepted
row has one canonical `course_key` and source evidence. The serving view preserves
existing exact lookups, adds accepted aliases, and excludes the alias branch when
it would duplicate an exact review. Summary statistics, tags, comments and review
pagination use this same view and the same campus/profile gates.

The API defaults to `instructorScope: "selected"`. Syllabus teacher labels and
other individual summaries remain restricted to the requested identities. Course
pages explicitly request `"course-history"` (`scope=course-history` for GETs),
which adds active official `instructor_course` evidence for this exact campus and
course. History queries also work when the current section list has no usernames
or cannot be refreshed. Accepted profile results remain bounded to 120 per request.

Source reads use a read-only repeatable snapshot. Large RMP payloads are paged and
ASCII-encoded with SHA-256 checks. Stage inserts are bounded; derived identity and
course updates commit together. Every staged course row is compared with storage
before commit. Unchanged evidence avoids update churn and duplicate refresh hashes.

## Run and audit

```sh
python3 -m pip install -r scripts/rmp/requirements.txt
pnpm rmp:mappings --dry-run --audit-report /tmp/rmp-audit.json
pnpm rmp:mappings --audit-report /tmp/rmp-applied.json
```

The default `--term-window 0` reads all available history. `--dry-run` never
installs schemas or changes mapping rows. JSON reports include every profile/
campus/course label, accepted target or missing reason, review counts, source
counts/fingerprints, identity changes and unresolved legacy supplement evidence.
Reports contain source-derived identifiers; keep them outside Git, for example
under ignored `data/local/rmp/`.

After successful scheduled catalog synchronization/pruning, the existing workflow
runs `--require-schema`. That mode requires installed migrations and indexes and
performs no DDL. New official labels, reviews and faculty facts are incorporated
on the next scheduled refresh. RMP collection still requires its separate existing
authorization; reconciliation makes no external RMP requests.

Unreconciled SQLite supplements remain excluded from scores until a genuine RMP
review ID can be established. An apparent missing record is not sufficient reason
to invent an ID or include a possible duplicate.

## Validation

```sh
python3 -m unittest discover -s tests/rmp -p 'test_*.py'
RMP_INTEGRATION_TESTS=1 node --env-file=.env.local --test tests/rmp/course-matching.integration.test.mjs
```

Integration checks compare all accepted course labels with source review IDs,
verify no duplicate course/campus reviews or altered catalog numbers, and exercise
the actual summary/pagination queries across all six campuses. They also verify
the independent selected-teacher and course-history scopes. The real-data browser
flow is `tests/rmp/course.browser.mjs`; it uses the existing Playwright environment
variables and `GUIDE_TEST_BASE_URL` to check course → RMP tab → database → rendered
reviews at desktop/mobile widths. API responses are not mocked.

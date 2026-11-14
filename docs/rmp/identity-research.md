# Source-assisted identity research

English · [简体中文](../zh-CN/rmp/identity-research.md)

Research starts with active, unlinked RMP profiles across every campus. It queries
official OSU Search, uses the legacy official people endpoint as a second source,
and can verify public department/profile pages discovered during research. It
never invents an OSU account from a name, merges RMP profiles, or rewrites reviews.

## Repeating a scan

Use Node 24 and a Python virtual environment with
`pip install -r scripts/rmp/requirements-research.txt`. PDF collection uses pypdf;
ordinary mapping and database replay only need `requirements.txt`.
Credentials are read from `DATABASE_URL` / `.env.local`; never pass them on the
command line. Run from the repository root:

```sh
pnpm rmp:research:scan
pnpm rmp:research:scan --legacy
pnpm rmp:research:review \
  --journal data/local/rmp/identity-directory-scan.jsonl \
  --journal data/local/rmp/identity-legacy-scan.jsonl \
  --install-schema --apply
pnpm rmp:mappings --require-schema
```

The first two commands append a response journal under `data/local/rmp/` and
resume completed requests. A failed source remains retryable and is not recorded
as an empty successful result. Positive official account records also populate
`osu_directory.person_cache`. Requests are bounded and paced; no cookies or
authentication are used. Source contacts, phone numbers and street addresses are
excluded; only account, name, explicit appointment/role and campus facts remain.
The review command is read-only unless `--apply` is provided. Schema installation
is explicit and needed once. Preserve the journal or use a different `--output`
path when starting a new source-observation pass.

Multiple sources can be combined explicitly:

```sh
pnpm rmp:research:review \
  --journal data/local/rmp/identity-directory-scan.jsonl \
  --journal data/local/rmp/identity-legacy-scan.jsonl \
  --journal data/local/rmp/identity-account-scan.jsonl \
  --web-journal data/local/rmp/identity-web-profile-scan.jsonl \
  --web-index data/local/rmp/web-search-index \
  --pdf-journal data/local/rmp/identity-pdf-profile-scan.jsonl \
  --apply
```

`rmp:research:scan --accounts` uses the previous report's candidate accounts to
request exact account details. It is useful when a name search is noisy or the
campus was absent from an older observation.

## Replaying server-side evidence

Every scanned profile, including unresolved profiles, receives a server-side
result and append-only source evidence. Rebuild decisions on another machine
without the local journals or any new network collection:

```sh
pnpm rmp:research:review --from-database --report /tmp/rmp-replay.json
```

Stored JSON is read in bounded pages and checked against a server-generated
SHA-256 before use. Truncated transport responses are reread by immutable key,
then, if necessary, by bounded byte fragments; incomplete data is never padded
or treated as an empty result. `decision_sha256` compares identities, verdicts, reasons and
classifications deterministically. Add `--apply` only to publish a rebuilt
review. Source-assisted decisions are rechecked when additional evidence arrives;
contradicted tool decisions are withdrawn with an audit log. Explicit human
overrides remain protected. Distinct RMP profiles can share a verified OSU person.

## Evidence rules

- Normalize punctuation, case and accents. Omitted middle names can match;
  conflicting explicit middle names and first-name-only initials do not establish
  a person. Nicknames are not guessed from a fixed dictionary.
- Require a matching name and campus. Prefer an independently observed own course,
  then academic-department evidence, then an explicit official faculty appointment
  without a conflicting academic department. A plain employee affiliation is
  insufficient for the final path.
- If no official campus is known at all, one directly observed university account
  with a compatible full name and matching academic department can identify the
  person. The RMP school's campus remains explicitly labeled as RMP provenance,
  with `official_campus_verified: false`. This exception cannot override a known
  different official campus, competing compatible accounts or an overfull search.
  The official-name index includes omitted middles and compound family names when
  checking ambiguity; it does not rely on a short list of special-case people.
- Compare competing accounts at the strongest available evidence level. Equally
  supported accounts remain ambiguous, including possible old/new account pairs;
  similar account strings are not automatically merged.
- Combine observations by verified account. Missing webpage fields cannot erase
  complete directory appointments; current central appointments take precedence
  over old webpage titles. Original observations and source URLs remain available.
- An overfull name-search response cannot establish uniqueness without independent
  own-course evidence. Failed requests are distinct from confirmed empty results.

## Departmental web evidence

`pnpm rmp:research:web` reads research search indexes under
`data/local/rmp/web-search-index`. Each index records profile IDs, the actual
individual search queries, result titles/URLs and retrieval times. Discovery is
separate from proof: a search summary never establishes an identity.

The verifier upgrades old official HTTP links to HTTPS, follows at most three
redirects within official OSU domains, bounds response size and request time, and
requires a name heading plus its own contact block to identify a single account.
It does not take a second person's title or a site footer as evidence. Explicit
appointments can enrich an incomplete directory cache with their provenance.
Unreachable pages and documents requiring another parser remain recorded as
research leads, not confirmed identities. Source indexes and journals are local
audit data, not source-control fixtures.

## Historical PDF evidence

`pnpm rmp:research:pdf` checks focused official CV, directory and syllabus PDF
leads in the same search indexes. It resumes its journal and can reverify positive
documents with `--verify-positives`. Official redirects, request size, time and
page counts are bounded. A full name must have its own nearby canonical OSU
account; neighboring people and unrelated email columns are rejected.

Evidence retains the document URL, SHA-256 and page number. Documents are treated
as historical regardless of download date. Their job titles remain under
`historical_appointments`, never under current appointments or the current people
cache. Verified central directory records and current department profiles populate
`osu_directory.person_cache`; historical identity evidence is cached separately
in the research tables. Missing current employment stays unknown.

The 2026-11-13 pass queried every one of the 7,758 originally unlinked profiles and
performed an individual web search for every name. This is a source-assisted
audit; it does not claim that every search result was personally read or that a
negative search proves a person never taught at OSU. Public records may still
lack an account, a historical appointment or a unique identity. Such profiles
remain unresolved with their evidence instead of receiving fabricated links.

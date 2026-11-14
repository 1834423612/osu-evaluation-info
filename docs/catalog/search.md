# Course search engine

Text queries use a full-catalog index built from validated, published OSU snapshots.
They do not depend on the official API first returning an exact or AND match.
The original input remains in the URL. Every result retains its actual course,
term, campus and instructor identities; approximate retrieval never changes rating joins.

## Research and implementation choice

[MiniSearch](https://lucaong.github.io/minisearch/) provides an in-process inverted
index, field boosts, prefixes and BM25-family scoring. Its
[7.2.0 source](https://github.com/lucaong/minisearch/blob/v7.2.0/src/MiniSearch.ts)
is the installed implementation. The current corpus fits process memory, so this
adds no external search service, credentials or database migrations.

[Typesense](https://typesense.org/docs/30.2/api/search.html) documents bounded typo
expansion, split/join repair, numeric tolerance and progressive token relaxation.
[Meilisearch](https://www.meilisearch.com/docs/capabilities/full_text_search/relevancy/ranking_rules)
separates coverage, typo, attribute and proximity signals. These informed the
policy below; this project does not claim to reproduce either engine's ranking.
A managed or dedicated search service remains an option when process memory,
cold-start cost or independent scaling become the limiting factor.

## Retrieval policy

- Normalize Unicode width, accents, case and punctuation. Apply conservative
  plural normalization and stop words, retaining Roman `I` for course levels.
- Build the vocabulary from every indexed title, description, subject and teacher
  name. Candidate spellings come from a radix-tree vocabulary, not a list of
  observed mistakes. Index meaningful descriptions before prerequisite clauses.
- Allow one edit for words of 4–6 characters and two for longer words, including
  adjacent transpositions. Three-character words get one edit with query context.
  Retain at most 16 spelling alternatives per term and 12 meaningful query terms.
- Search titles, subjects, descriptions and teacher names with field boosts.
  Prefer whole-title equality, complete coverage and contiguous phrases before
  weaker prefixes or spelling matches. When a longer query has no full match,
  require at least 70% of terms and sufficient rarity-weighted coverage. Mark
  partial matches explicitly; never force a nearest result for unrelated input.
- Derive initials, word prefixes, omitted words, consonant abbreviations and close
  subject spellings from all official subject names/codes. Resolve at most 12
  plausible subjects, using the number and text to narrow actual course matches.
  No subject alias table participates in this primary engine.
- Match numbers against the course's own catalog number. Prefer exact numbers,
  then prefixes, then bounded edits/reversal; adjacent digit swaps cost less than
  arbitrary substitutions. Keep decimal/suffix identities intact.
- Support number-before-subject, irregular separators, split/joined words, and
  mixed input such as an incorrect number plus course-title words. Corrections
  display actual query/catalog words, not internal normalized stems.
- When a possibly wrong number is itself a valid course, keep the exact result
  and provide separate, expandable nearby choices. Do not silently replace it.

These are lexical retrieval rules, not an LLM or an embedding model. Arbitrary
unrelated abbreviations, paraphrases with no shared vocabulary, and an incorrect
number that names another valid course cannot be resolved with certainty.

## Data lifecycle and bounds

`GET /api/catalog/search` reads PostgreSQL only. The existing complete-snapshot
publication is authoritative; running or failed syncs never enter the index.
The reader uses a read-only repeatable transaction and validates publication before
building. Bulk JSON is ASCII-encoded with a SHA-256 integrity check before parsing;
invalid input fails the build rather than creating a partial searchable catalog.

The index stores compact metadata and section filter facts. A result page hydrates
only its visible sections from the same generation. Pages contain 12–24 courses,
with at most 24 preview sections each; opening a course still refreshes full official
details in the browser. Seats remain separate live OSU requests. Both the index
source and sync timestamp are shown. Search never proxies official live reads.

Publication pointers refresh after 30 seconds. Builds coalesce and serialize,
with at most 8 queued builds and 2 retained indexes per Node process. A corpus is
bounded to 50,000 course/campus documents. Failed builds leave existing generations
untouched. Cold loads include database transfer and index construction; they are
not represented by the warm in-memory query timing.

Search cursors use `s:` and pin the generation, term, normalized query, filters,
page size, sort and algorithm version. Changing any of those requires restarting.
Totals refer to matched courses/sections in that complete snapshot. Manual subject
and catalog sorting applies across the full matched set, not an upstream window.

Facets are available from the snapshot even when official facet discovery fails.
Every selected filter must match the same section. For unsupported semantics
(currently OSU's evening classification), the client explicitly switches to live
search with limited typo correction; it never approximates or ignores the filter.
Index unavailability is also labelled as a limited live fallback. A pinned page
cannot silently switch generations or data sources. Users can choose live search
at any time without losing their query or filters.

Broad browsing without a query still uses the existing direct OSU transport and
explicit backup mirror. Live fallback and exact routing also derive subject names and abbreviations from metadata;
there is no enumerated alias map.

## Files and validation

- `analyzer.ts`, `subjects.ts`: text normalization and data-derived subject resolution.
- `engine.ts`, `types.ts`: retrieval, ranking and match evidence.
- `catalog-source.ts`, `filters.ts`: validated snapshot loading, facets and page hydration.
- `index-cache.ts`, `service.ts`, `results.ts`: lifecycle, scope and stable pagination.
- `client.ts`: primary index transport and explicit live fallback policy.

Run `pnpm test` for deterministic engine, filter, cancellation, integrity, hydration
and pagination tests. Browser tests are `tests/search/search.browser.mjs` (real
published index, three widths/two languages), `tests/catalog/search.browser.mjs`
(legacy fallback) and `tests/catalog/search-debug.browser.mjs` (paused services).
Set `GUIDE_TEST_BASE_URL`, `PLAYWRIGHT_MODULE` and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` for local browser runs.

The reproducible, read-only corpus evaluator needs `DATABASE_URL`:

```sh
node --expose-gc --env-file=.env.local scripts/search/evaluate.mjs /tmp/search-spring.json
SEARCH_EVAL_TERM=1268 node --expose-gc --env-file=.env.local scripts/search/evaluate.mjs /tmp/search-autumn.json
SEARCH_EVAL_TERM=1264 node --expose-gc --env-file=.env.local scripts/search/evaluate.mjs /tmp/search-summer.json
```

It sweeps all distinct codes/titles, corrupts varying words across all titles, and
adds subject-stratified spelling, transposition, abbreviation and description
queries plus negative controls. Real alternative-number collisions are reported
separately. For ambiguous identical titles/descriptions, equivalent indexed content
is acceptable. Reports include failures, Recall@1/5/12, reciprocal rank, CPU query
timings, cold load/build time and heap usage. `--expose-gc` enables a retained-heap
measurement. These synthetic recall figures are not production success rates or
a guarantee for every possible query. Keep generated reports outside the repository.

Result-load analytics distinguish the engine, fuzzy result count and fallback
reason; see [Umami analytics](../analytics/umami.md).

## Automatic exact routing and concurrent requests

Complete codes first use a small subject vocabulary (`GET /api/catalog/subjects`), not the full search index.
It reads course metadata only and coalesces the generation-scoped result; no section transfer or index build is required.
Unique metadata-derived abbreviations can route to an official subject. Ambiguous names stay in tolerant search.
An unseen literal subject code can be tried as written, so a new official subject need not wait for the next local sync.

The browser tries one official search page, within a two-second budget including vocabulary resolution.
This is a direct OSU request, with no server proxy or server cache of the live response.
Official term discovery may add its usual metadata request on a cold browser session.
Automatic search does not fetch more official pages or query spelling alternatives. A partial page is marked incomplete;
opening a course retains the existing on-demand expansion. Empty, failed or slow exact reads use the local tolerant index.
Keywords, ambiguous subjects and pinned index cursors keep the index path. An explicit index mode skips official routing.

Immutable hydrated index pages are shared by generation, query, filters, sort and cursor. Defaults per Node process:
96 pages, a 12 MiB serialized-size budget, 120-second TTL and 128 distinct pending keys.
A hundred simultaneous copies of one query share one ranking/hydration operation. A new publication has a new key.
Failed requests are not cached. Capacity limits produce 429 with Retry-After, and the client does not amplify overload
by switching those requests to OSU. The existing PostgreSQL pool bounds connections; search uses reads, never DDL or data writes.
The vocabulary adds at most 8 cached entries / 512 KiB per process; the browser retains at most 8 term vocabularies for five minutes.

Exact identifiers use maps and metadata lookup. Descriptions and spelling correction use the inverted index;
binary search on a sorted course list cannot replace those matching rules. These bounds limit each process;
capacity across serverless instances and arbitrary distinct-query floods still depends on deployment limits.

Initial local measurement on 2026-11-13: an uncached development search took 12.4 s including cold index work;
ready-index queries took about 53–74 ms. These are local measurements, not a production latency guarantee.
Tests cover 100-way request coalescing, byte/entry/pending limits, cancellation, dynamic subjects,
one-page official routing, empty/slow fallback, and no official fanout for fuzzy alternatives.

A production-build localhost benchmark with 200 simultaneous requests for the same cached query
on 2026-11-13 returned the same page to all clients: p50 248 ms, p95 416 ms, max 446 ms.
The first uncached description search still took 8.6 s; automatic exact routing avoids that cold index work.
This checks shared-query coalescing, not 200 unrelated production queries. Run locally with:

```sh
node scripts/catalog/benchmark-search.mjs
```

The tool accepts localhost only, caps clients at 200, and writes its report under `.cache/`.

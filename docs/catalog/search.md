# Course search

Search reads current OSU offerings directly from the browser. It keeps the user's
input in the URL and search field; interpretation changes only the official
request. Term, campus and all selected facets remain in effect.

| Input                           | Interpretation                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `philosophy 2465`, `PHILOS2465` | Resolve the official subject, then verify the exact course identity              |
| `MECH 2040`, `MAT 1151`         | Recognize a supported abbreviation or a unique subject spelling                  |
| `cse 22`, `2511`                | Match actual catalog numbers and their prefixes, excluding prerequisite mentions |
| `earth science`, `psychology`   | Resolve the official subject name or an unambiguous prefix                       |
| `death meaning life`            | Require meaningful words together and prioritize the course title                |
| `ENG 2040`, `ani`               | Keep ambiguity visible and offer subject choices                                 |

Subject resolution uses the selected term's official facets, with a small alias
list accepted only when the destination subject exists. Unicode width, accents,
spacing, punctuation and singular/plural subject names are normalized. A short
ambiguous fragment does not silently become a subject filter. A conflicting
explicit subject filter stays selected until the user removes it.

## Retrieval and relevance

OSU's unqualified multiword query can return unrelated courses matching just one
word. Keyword requests therefore join meaningful words with the supported `AND`
operator. Quotes, wildcards and unsupported field prefixes are not sent.

Each ranked window reads at most three official pages of 200 section candidates.
Courses merge by their existing campus-specific identity. Numeric input matches
the catalog field. Text ranking favors shared title words, course identity, close
title spellings and teacher names; descriptions are shown only when the current
window contains no direct matches. Every meaningful word must match. This local
ranking does not alter the course, instructor or evaluation identity joins.

Search defaults to relevance; users can choose subject or catalog-number order.
The browser's existing request queue, cancellation, metadata cache and timeouts
still apply. There is no server-side official-data proxy or full-text snapshot
fallback.

## Suggestions and pagination

An empty exact search can offer real nearby courses under the same filters. A
bounded lookup reads at most two pages of 24 course choices. Suggestions deduplicate
across campuses and require a click; the original number is never automatically
replaced. An explicit number-only suggestion lets the user search across subjects.

Ranked cursors use `r:upstream-page:offset`. A window can have several UI pages;
later windows continue the bounded scan, up to the official page ceiling of 50.
Ranking is within each window, not a claim of global ordering across unread pages.
If a window is empty but candidates remain, the interface offers continuation
instead of claiming the entire search has no matches. Counts are exact only when
the candidate scan is complete and uncapped. Otherwise the interface identifies
the displayed page without presenting upstream candidate counts as matching totals.
Back/Forward restores the query and result page, including a fast return before
Next's native-history update completes.

## Verification

`pnpm test` covers intent resolution, relevance, actual catalog-field matching,
bounded pagination, cancellation, errors, filter conflicts and suggestion identity.
`tests/catalog/search.browser.mjs` exercises the browser → endpoint discovery →
official response normalization → result UI flow at 1440, 768 and 390 pixels in
Chinese and English, including pagination, browser Back and result analytics.
`tests/catalog/search-debug.browser.mjs` checks paused services and response replay.
Set `GUIDE_TEST_BASE_URL`, `PLAYWRIGHT_MODULE` and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` for a local preview and Playwright installation.

The November 12, 2026 live browser check also verified `american experiment`,
`death meaning life`, `cse 22`, `MECH2040` and unavailable-number suggestions
against Spring 2027 official offerings. Offering availability can change by term.
Search outcome measurement is documented in [Umami analytics](../analytics/umami.md).

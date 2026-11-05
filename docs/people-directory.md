# OSU people directory lookup

Instructor identities are shown directly beside the avatar / name in section
lists and official-evaluation instructor lists. Visible rows automatically look
up the instructor; opening the instructor reveals directory appointment titles
and departments. There is no separate directory-search form or role-lookup
button. Known `@osu.edu` addresses become an exact `name.#` query; the server
accepts only records whose account matches that query. For name-only lookups,
the UI requires a unique full-name match (allowing an omitted middle name).
Ambiguous or partial-name results leave the role unconfirmed. The server does
not return contact details.

## Providers

1. OSU Search is the primary source:
   `wss://search-api.intcomm.osu.edu/socket.io/?EIO=3&transport=websocket`.
   The Node 24 built-in WebSocket client implements the verified Engine.IO 3
   handshake and sends the Socket.IO `search` event with
   `{term, providers:["people"]}`. Only a `results` event from the `people`
   provider and the submitted term is accepted.
2. On an unavailable or empty primary result, the legacy
   `https://content.osu.edu/v2/people/search` endpoint is tried with
   `firstname` / `lastname` using the first and last name parts (middle names
   are omitted because this API's `firstname` field excludes them). For an account query, the client also supplies the
   instructor's full name as `fallbackName`. If the primary account lookup is
   unavailable or has no exact match, that name is used only to locate legacy
   candidates. A candidate is accepted only when its `username` is exactly the
   original account or its `email` is exactly that account at `osu.edu` (case
   insensitive). Matching names alone are insufficient. Without a full fallback
   name, an account query never becomes an unverified surname search.

Both sources were probed successfully on 2026-11-05, including the new endpoint
without an Origin header. HAR evidence was used to establish field names and
event structure; credentials and raw directory responses are not repository
fixtures.

## Data and role semantics

`POST /api/people/lookup` accepts `{term, fallbackName?}`. An optional fallback
name follows the same character/length bounds as `term` and must contain at
least two name parts. It projects each source into the
same minimal shape: name, role tags, and appointment titles / organization.
Names, phone numbers, addresses, emails, student majors, and raw source records
are not stored in the database. The response includes the person's name for
display; the other contact and student-program fields are excluded.

Role tags use explicit appointment titles and affiliation labels. Teaching
assistant and student-assistant tags require those specific title phrases.
Professor and Lecturer have distinct tags; Instructor / Faculty is used
only for other explicitly stated teaching affiliations. Graduate / Undergraduate
TA labels preserve the distinction when their appointment title states it. Multiple roles can coexist. An employee tag follows a listed
appointment. A student tag follows student affiliation or the presence of
listed major information; the program itself is not exposed.

These tags do not establish full-time or tenure status, and missing directory
or evaluation data does not establish that someone is a TA. Recitation is not
used as identity evidence. Same-name results remain separate candidates unless
their complete minimal projections are identical.

## Bounds and failures

- Input: 2–120 characters; name / `name.#` characters only; a 4 KiB request-body
  limit and three-second body-read deadline.
- Requests: 120 per minute per proxy address key, with only address hashes kept
  in a bounded process-local map; at most 12 concurrent source lookups.
- Upstreams: five-second deadlines, 512 KiB result bounds, fixed provider
  hosts, and same-origin redirects for the legacy source.
- Display: at most 15 candidates and eight appointments per candidate; only
  uniquely matched instructor records receive identity badges. Appointment
  information appears inside that instructor's own expanded details.
- Browser work: rows load on visibility, with a shared three-request queue,
  in-flight deduplication, and a bounded 384-entry memory cache across lists.
  No directory response is written to browser storage.
- Cache: a bounded in-memory LRU keyed by a hash of both the query and optional
  fallback name; the browser's memory cache includes both as well. Successful matches last
  six hours, empty results 30 minutes, and failures 30 seconds. No raw provider
  payload or HAR is cached or persisted.

The API returns 503 for provider failure and an empty successful result for a
confirmed empty directory response, so an outage is not presented as a
missing person. The process-local rate limit supplements deployment-level
controls; it is not a distributed rate limiter.

## Verification

On 2026-11-05, fresh live probes of `ramnath.6` and the corresponding full
name both returned one matching record from OSU Search with Professor
appointments and Engineering / Computer Science and Engineering departments.
A direct legacy API name probe also returned HTTP 200 and one record. A fresh
legacy schema probe confirmed string `username` and `email` fields that exactly
matched the expected account; these fields are used transiently for identity
verification and are excluded from API responses. The synthetic test suite
exercises transport failure and empty-result fallback, exact legacy account
checks, rejection of same-name wrong accounts, distinct fallback-name caches,
account mismatches,
ambiguous names, role evidence, and minimal response projection. Raw directory
records and the source HAR are excluded from the repository.

A full-name probe for Neil John DeBoer also confirmed that legacy
`firstname=Neil John` returns no record while `firstname=Neil` returns the
expected full-name record. Account fallback therefore searches the first and
last name only and retains the exact account acceptance check.

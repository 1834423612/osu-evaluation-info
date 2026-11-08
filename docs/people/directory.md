# OSU people directory lookup

Instructor lists derive compact roles from all saved official appointment titles
beside the avatar / name. Professor, Associate Professor, Assistant Professor,
clinical / practice / visiting appointments, Lecturer, Senior Lecturer, emeritus
appointments, research roles, and qualified assistant positions retain their
distinctions. An emeritus title without an explicit professor rank is shown as
Emeritus, without inventing a rank. Multiple jobs such as Researcher and Lecturer
appear together. A row shows up to two positions and an explicit +N indicator
for further positions; the full caption is also available on hover. Contract
markers and duplicate aliases collapse; unfamiliar
explicit titles remain visible in their original language instead of becoming
Staff or Professor. Coarse directory affiliation roles are a fallback only when
no appointment title is available. Existing database and browser caches already
contain these titles and do not need to be repopulated for this presentation change.
All distinct original appointment titles and departments remain available in a
scrollable details popover, including jobs beyond the first two appointments.
Only the compact role badge, marked with a small information icon, opens that
popover. On RMP cards, the name, avatar, summary tags, and card background toggle
the review preview; links, action controls, and expanded review content keep
their own interactions.
Only visible instructor rows initiate lookup: a shared queue permits at most two
requests at once, spaces starts by 350 ms, deduplicates duplicate identities,
and applies a 250 ms visibility delay. Cached records render immediately;
background course cards never mount instructor lists. A click opens a compact
popover with appointment / department facts without changing the section row's
layout. The same trigger and outside dismissal close it. Missing role evidence
uses an information icon and never a generic verified-person label.

## Identity and providers

Known `@osu.edu` addresses become the primary exact `name.#` query. The server
accepts OSU Search results only when their account ID or OSU email exactly
matches. Name-only queries omit middle names and use at most three bounded
first / family-name combinations, including joined compound surnames. Their
results must still match the canonical complete name, including middle names,
and must be unique before the UI assigns a role. A first-and-last-only match
is insufficient to establish identity.

1. OSU Search is primary:
   `wss://search-api.intcomm.osu.edu/socket.io/?EIO=3&transport=websocket`.
   The Node 24 built-in client implements Engine.IO 3, sends
   `search {term, providers:["people"]}`, and accepts only the matching
   `results` event for provider `people` and the submitted term.
2. The legacy `https://content.osu.edu/v2/people/search` endpoint follows when
   the primary result is absent or lacks role evidence. It receives bounded
   first / family-name query parts, without middle names. An account query
   carries a full `fallbackName` only to find candidates: exact legacy
   `username` or OSU email equality is still mandatory.
3. When central directory results identify the account but omit role data,
   supported official department profile pages can supply the explicit title.
   The initial fixed subject mapping is `MATH -> https://math.osu.edu` and
   `GET /people/name.#`. The parser requires the exact canonical profile URL,
   a matching OSU account email inside the main contact section, and exactly
   one `field-your-title` job-title field in that same section. Other page text,
   navigation items, arbitrary user-provided URLs, and other hosts never
   establish roles. Same-origin redirects are bounded. The source profile URL
   is retained as provenance and shown in the popover.

The HAR and the live official Search JavaScript were rechecked: expanding a
Search contact card only reveals existing DOM data and sends no extra detail
API request. The central record for `mejiacordero.2` currently has empty
appointment, affiliation, and major arrays. The current official Mathematics
profile explicitly lists Julian Mejia Cordero as **Lecturer**, with the exact
OSU account email. The departmental fallback therefore yields Lecturer and
Department of Mathematics without guessing Professor or TA.

## Cache and trust boundaries

`POST /api/people/lookup` accepts `{term, fallbackName?, subject?}`. Subject is
an optional hint into the fixed department mapping, never a host or URL. The
endpoint ignores client-provided roles, appointments, person objects, and
claimed source metadata. Only source responses fetched and account-checked
by the server can reach the database write path.

The browser reads its own bounded localStorage cache first. On a miss it calls
the website server, which reads `osu_directory.person_cache` before contacting
OSU. The additive table keeps normalized name, roles, appointments, verified
source, optional official source URL, protocol version, and verification time.
It excludes phone, postal address, email, raw source payloads, and student
program details. Name-only searches are not persisted as account identities.

Install or upgrade with `pnpm db:people:init` after configuring `DATABASE_URL`.
The migration is idempotent and supports both fresh and existing tables. Cache
protocol v3 invalidates prior incomplete records so they can be enriched.
Complete evidence lasts 30 days; a record with no roles or appointment lasts
30 minutes, so missing data does not become a month-long conclusion. A source
failure can return a previously verified database row marked stale, without
replacing it. Database read / write failure safely falls back to direct official
lookup. Raw browser data is never uploaded as official evidence.

A newly supplied supported department subject bypasses a fresh incomplete
database entry to allow enrichment. The browser also records the subject under
which a negative lookup was attempted, so a generic empty cache does not block
later Mathematics profile discovery. Completed empty lookups clear loading
before publishing cache updates, leaving the information icon visible.

## Role semantics and bounds

Role tags follow explicit appointment titles and affiliation labels. Professor,
Lecturer, other teaching faculty, graduate / undergraduate teaching assistants,
and student assistants remain distinct in the source data. The badge uses a
specific title or combination of titles, while its popover keeps every distinct
official appointment title and department. Student and employee tags are suppressed when redundant
with an explicit TA / student-assistant title. A role does not establish
full-time or tenure status. Missing evaluations and teaching Recitation never
establish TA status.

- Requests are limited to 60 per minute per hashed address key; the process
  keeps a bounded rate map and caps simultaneous source lookups.
- Input is limited to 2–120 name / account characters, with a 4 KiB body limit
  and a three-second body read deadline.
- Source requests have five-second deadlines, 512 KiB response limits, fixed
  hosts, and bounded same-origin redirects.
- All source attempts and redirects share an 18-second overall budget. Browser
  requests allow 30 seconds, beginning only when their queued network task
  starts; queue wait time does not consume the request deadline.
- At most 15 candidates and eight normalized appointments are retained; the
  popover shows all distinct appointment / department highlights with bounded scrolling.
- Provider failures return 503; confirmed empty results return an empty
  successful response. No contact or directory payload is written to logs or
  source-control fixtures.

## Verification

Tests cover exact account acceptance, rejected same-name accounts, strict
canonical full-name matching, middle-name-free query variants, department-page
job-title scoping and wrong-account rejection, role inference, and deduplication.
Cache route tests cover source-free database hits, malformed rows, expiry and
protocol refresh, client data poisoning attempts, stale fallback, and database
outages. Fresh live checks verified the Lecturer profile for `mejiacordero.2`
and retained official source provenance through the database cache. Desktop and
mobile browser checks cover visible automatic lookup, the concurrency ceiling,
local cache hydration, role captions, two-row popovers, and unchanged row height.

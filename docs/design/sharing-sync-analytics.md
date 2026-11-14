# Sharing, saved items and telemetry design

English · [简体中文](../zh-CN/design/sharing-sync-analytics.md)

> See [Accounts, favorites and sharing](../user-data.md) for shipped behavior and deployment. This document records the design; current authentication supports email codes, passkeys, optional passwords and recovery codes, and replay defaults to on for all pages under remote masking policy.

Status: proposed architecture, researched on November 14, 2026. This document does not describe deployed sharing, authentication or synchronization features. The runtime observations below are dated evidence.

## Existing implementation and observed risks

Saved courses, sections, instructors and syllabi live in versioned browser storage. There is no account-backed saved-item service. Course saves are capped at 100; other kinds have separate limits. Enrollment is deliberately removed from stored snapshots. Syllabus update acknowledgements refer to exact document revisions and must survive migration.

Course detail state already uses URL parameters, including course, detailTab, ratingSource and focusSection. A copied URL must resolve the referenced entity even if it is outside the recipient's current result window. A dedicated resolver is needed; copying a selected card's current URL alone is insufficient.

The root layout loads one tracker component and a separate recorder. The existing tracker has data-errors and data-performance, but lacks release and deployment-environment labels. Package version 0.1.0 is not a useful deployment identifier; the bundled build SHA is available.

Read-only observations on November 14:

- Recorder configuration enabled replays and heatmaps at 100% sampling, moderate input masking, a 1,200,000 ms maximum duration and an empty block selector.
- The ordinary tracker response was 4,776 bytes and lacked window.umamiConfig/captureException. A cache-bypassing request returned 9,300 bytes and supported both. Recorder responses also differed and only the fresh response supported umamiConfig. The cached responses were about 23 hours old. This proves a stale-script delivery path; it does not identify the exact installed server version.
- Two recent recordings were inspected structurally without exporting visitor identifiers or form contents. Their full snapshots had no repeated rrweb node IDs within a snapshot. This does not rule out duplicated logical controls, missing styles or mutation-order problems.
- Fresh desktop and phone page checks found one visible main course-search input and no horizontal overflow. A phone-only filter input also existed with zero dimensions. These checks covered the homepage, not all interactive panel states.
- Umami 3.4.1 declares rrweb ^2.0.1 and rrweb-player 2.0.0-alpha.20; 3.5.0 declares rrweb ^2.1.7 and rrweb-player 2.1.7. This is an upgrade candidate, not proof that upgrading repairs every replay.

The tracker before-send hook currently sanitizes URL query parameters. Recorder traffic has a separate send path; it is not sanitized by that hook. Removing a next/script element after execution also does not stop its already-running recorder. Both require explicit handling before private account, recovery or transfer interfaces ship.

## Product surfaces and permissions

| Surface                   | Behavior                                                                                                       | Access and lifetime                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Share current page/course | System share sheet when available; copy-link fallback; course, term, campus, section and active detail context | Ordinary canonical public URL; optional attributed link                      |
| Shared saved collection   | Separate /share/... page; compact mixed-item list; import all or selected                                      | Read-only snapshot; revocable capability; explicit visibility and expiry     |
| Temporary transfer        | Send selected local items between devices without an account                                                   | Expiring single-claim transfer; high-entropy link or approved device pairing |
| Account synchronization   | Private, continuous synchronization of selected data categories                                                | Passkey-backed account; device sessions; user-controlled sync                |
| Local history             | Recent submitted searches and actually opened courses                                                          | Local by default; clear, disable and optional separate history sync          |

Public sharing must not turn into edit access. Collection recipients get independent copies; later publisher changes do not silently mutate those copies. A publisher may explicitly publish a new snapshot. Collaborative editing and live subscriptions would require separate permissions and conflict semantics.

A collection can contain courses, sections, instructors and syllabi. Reuse existing identity and source badges. Support collection names, flat tags, search, sorting, multi-select, move, remove, JSON export/import, duplicate detection, import preview and an undo period. Start with shallow organization rather than a deeply nested folder interface. The collection model follows the separation between organization, public reading and private state used by [Linkwarden](https://docs.linkwarden.app/usage/collections).

Sharing strips enrollment counts, private notes, account identifiers, browsing history, notification acknowledgements and unnecessary cached content. Teacher email is excluded unless separately selected as public contact data. Unconfirmed RMP profiles keep their source ID and warning; they are never merged by name. Syllabus shares reference a document identity and available archive revision rather than copying arbitrary HTML.

Shared pages show a title, item counts by type, expiry, source/identity badges and clear selection controls. The import preview reports new, already-saved, changed and unavailable items. Unavailable catalog entities retain their snapshot with an archive/unavailable label. An import result distinguishes selected, imported, skipped, failed and still pending items.

A shared page has its own layout and metadata. It must not open a second copy of the search page underneath a detail panel. Details can reuse the existing drawer with a shared-page resolver and correct back behavior. Shared pages are noindex and use a restrictive referrer policy. Private capability and transfer pages load no third-party analytics or replay. Public social previews contain only explicitly published fields.

Keep the saved-page toolbar compact: title/counts, a local/cloud state badge and labelled Select, Share and Import actions. Selection mode uses checkboxes and a count; clicking nested actions must not toggle selection or open a second view. Reuse the site's muted surfaces, thin borders and restrained scarlet primary action. Put identity/source information below the title and management actions in a separate row. Desktop dialogs have a bounded width; phones use a safe-area-aware sheet with one scroll owner. Conflict alternatives sit side by side on desktop and stack on phones. Preserve 44-pixel touch targets without inflating every visible icon, and verify sticky actions do not cover the final item.

## Six-digit codes and transfer safety

Six decimal digits provide only 1,000,000 possibilities, about 19.9 bits. A display name is not an authentication credential, and a six-digit code cannot safely serve as a permanent private account key.

- Durable share links use cryptographically random capability tokens of at least 128 bits; 256 bits is the proposed default. Store a keyed digest, never the raw capability. Permission and expiry are checked on every read, including cached data and previews.
- Six-digit public aliases may be enabled only for content explicitly marked publicly shareable, with short validity, issuance quotas, a global active-code limit and an enumeration warning. A code alias never grants account access.
- Private six-digit transfer pairing expires after 10 minutes. The sender must approve the specific receiving session before the payload can be fetched. The receiving session has a separate high-entropy secret; the short code only locates the pending exchange.
- An unattended private transfer uses a long random link or QR code instead. Proposed validity choices are 15 minutes, 1 hour, 24 hours and 7 days; default 1 hour. Six-digit approval pairing cannot be extended to a week.
- Apply shared, atomic limits by challenge, originating session, trusted network address and overall service budget. Per-process in-memory limits are insufficient. Return uniform errors and add a challenge only after suspicious attempts.
- A preview GET never consumes a transfer. Claiming is a transactional POST bound to a recipient session, producing a brief resumable lease. The same recipient can retry after a timeout; another recipient cannot win the claim. Mark completion only after a durable local import acknowledgement.
- Revocation invalidates subsequent reads. Expired transfers are removed by a scheduled cleanup. Deleted public aliases have a reuse cooldown; long links remain bound to their original snapshot and cannot resolve to a future reuse of the numeric code.
- Anonymous creators receive a separate management capability for revocation; losing that capability means waiting for expiry. Payload size, creation count and retention are bounded.

This pairing design borrows the separation of a short user code and a high-entropy device secret, expiry, rate limits and explicit approval from [RFC 8628](https://datatracker.ietf.org/doc/html/rfc8628#section-5.1). It is an application transfer protocol, not a claim to implement an OAuth authorization server.

Transfer links, capability fragments, recovery material and authorization headers must be excluded from proxy logs, analytics, errors and replays. Moving a token into a URL fragment alone does not protect it from DOM recording or client scripts. No capability bearer value goes into local history.

## Passwordless identity

Use self-hosted Better Auth with the existing PostgreSQL service and its passkey plugin, rather than implementing WebAuthn verification from scratch. Keep traditional password registration disabled.

A passkey-first flow creates an opaque pending registration, performs user verification and creates the account only after successful verification. Display names may be duplicated and are editable. They are not used to look up private data. [Better Auth supports passkey-first registration](https://better-auth.com/docs/plugins/passkey).

Use an exact production origin and stable WebAuthn RP ID; localhost is a separate development identity. Do not trust arbitrary forwarded hosts. Store only credential public keys and required WebAuthn metadata; the website does not receive biometric images or device unlock PINs. An account is not proof of OSU affiliation.

Offer additional passkeys and device/session revocation. Before depending on cloud storage, show recovery setup: a second passkey, one-time hashed recovery codes, or a verified email magic link. Email recovery requires a configured delivery service and rate limits. An already-configured trusted OIDC provider can be an optional alternative; provider credentials and email delivery are not currently configured in the application environment inspected for this audit.

Use library-managed secure HttpOnly cookies, origin/CSRF checks, short-lived challenges and replay protection. Business APIs still require explicit ownership checks; library authentication does not authorize custom sync/share routes. Account linking requires an authenticated, deliberate action, not a matching email or name. See [Better Auth security](https://better-auth.com/docs/reference/security) and [email magic links](https://better-auth.com/docs/plugins/magic-link).

Default browsing remains local and anonymous. No account is created merely by visiting. Login and consent to upload local saved items are distinct actions.

## Synchronization protocol

Use an operation-based protocol with a local IndexedDB outbox, a server cursor and per-item revisions. A full-array last-write-wins upload is unsuitable.

Each operation includes an idempotency key, account/workspace, device ID, per-device sequence, entity key, operation kind and base revision. The server validates ownership, applies a bounded batch in a transaction and returns accepted/rejected/conflicting operations plus the next server sequence. Unrelated items can commit while conflicting items remain pending. Server order, not device wall-clock time, defines synchronization order.

| Situation                                     | Required result                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| First login with both local and cloud items   | Preview the union, deduplicate by entity identity, preserve local originals until the cloud confirms persistence |
| Two devices add different items               | Merge both                                                                                                       |
| Same import or request retried                | Return the prior result; do not duplicate saves or popularity counts                                             |
| Delete on one device, stale device reconnects | Keep the tombstone; a stale snapshot cannot recreate the item                                                    |
| Intentional re-add after observing deletion   | New explicit add operation against the observed tombstone                                                        |
| Concurrent delete and edit                    | Preserve both versions in a conflict; do not silently discard either user's action                               |
| Concurrent changes to different safe fields   | Merge those fields                                                                                               |
| Competing collection rename or note edits     | Keep alternatives; ask to use local, cloud or keep both                                                          |
| Device clock wrong                            | No loss; timestamps are display metadata only                                                                    |
| Partial failure or full local storage         | Keep pending data and an actionable failure state; never show synchronized                                       |
| Damaged/failed local read                     | Treat as unavailable input, not an empty authoritative collection                                                |
| Logout, account switch or disabled sync       | Keep local and account workspaces separate; never upload account A's private cache to B                          |

Deletion tombstones and operation receipts are retained for a proposed minimum of 180 days. Devices offline beyond the supported cursor horizon perform a full reconciliation and review old pending changes; they do not blindly replay stale additions. Compaction records the minimum valid cursor. Account deletion and revoked-device rules take precedence over offline queues.

Syllabus revisions and the user's acknowledgement are separate fields. A shared import starts with the recipient's own acknowledgement state. Across the same account, only an explicit acknowledgement of an exact observed revision clears its notification; a stale device cannot clear a newer update.

Sync runs after an authenticated change with debounce, on reconnect and when a tab becomes visible. Batch and cap requests; avoid a permanent socket or frequent background polling. Use BroadcastChannel or a leader lease for same-account tabs. A Web Lock improves local scheduling but correctness still comes from server idempotency and transactions. Retry with bounded exponential backoff.

Users can disable sync per device and separately choose whether to sync history. Pausing uploads retains the pending queue. Resuming previews conflicts. Logout offers keeping a device copy or removing that account's local cache; deleting cloud data is a separate operation.

[Automerge's conflict model](https://automerge.org/docs/reference/documents/conflicts/) is useful background: automatic convergence does not resolve every conflicting user intention. This small typed collection does not need an entire collaborative-document CRDT runtime in its first implementation.

## Storage, service boundaries and performance

Add a user-data schema separate from the official catalog, syllabus archive and evaluation tables. The authentication library owns its authentication tables; domain data uses the existing bounded PostgreSQL pool or an explicitly budgeted adapter pool.

| Logical tables                                  | Purpose and constraints                                                                                                |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Accounts, credentials, sessions, devices        | Opaque IDs, credential uniqueness, revocation and recovery                                                             |
| Collections, saved items, collection membership | Owner-scoped uniqueness by kind and canonical entity key; collection membership does not duplicate the underlying save |
| Operations, receipts, tombstones, conflicts     | Unique operation IDs, indexed account/server cursors, exact base versions                                              |
| Shared snapshots, capabilities, code aliases    | Immutable payload version, scope, expiry, revocation; no dependency on a public listing                                |
| Transfers and claims                            | Hashed secrets, claim owner, lease and completion state                                                                |
| Event outbox and entity aggregates              | Deduplicated business facts and eventually updated popularity counts                                                   |
| Security events and diagnostic reports          | Separate retention, privileged access, deletion and explicit consent metadata                                          |

The API groups are share creation/revocation/read, transfer create/approve/claim/acknowledge, sync push/pull/resolve and account/device management. All mutations validate a strict schema, item and body limits, same-origin requests and scope. Import/export formats have a schema version and deterministic migration. Treat imported titles, links and notes as untrusted data; no arbitrary HTML or server-side URL fetching.

Use keyset/cursor pagination and account/entity indexes. Lock only the affected account/item rows, not catalog tables. Keep payload snapshots small and immutable. Popularity processing consumes an outbox in batches instead of incrementing one hot global row on every click. Telemetry failure must not fail course browsing or a confirmed save.

Share/transfer private responses use no-store. Revocation-safe public caches have an explicit invalidation path and revalidate authorization on every access. Backups preserve private user data only under a documented retention policy; transport encryption and access control are not end-to-end encryption.

Proposed performance targets, to be measured rather than advertised as guarantees: bounded batches of at most 100 operations, sync request bodies at most 256 KiB, lightweight event batches at most 16 KiB, no full-catalog scans for user operations, and a several-hundred-client load test against the actual server/database pool. Raise existing local save limits only with pagination and quota migration, never by silently truncating imported data.

## History and popularity definitions

Keep recent submitted searches and actual course opens locally. Proposed defaults: 100 search entries, 200 course visits, 90-day retention. Deduplicate consecutive entries and preserve term/campus context. Do not record every keystroke, hover, prefetch, automatic pagination or capability URL. Provide remove-one, clear-all, disable and export controls. History synchronization is a separate opt-in.

| Metric                      | Meaning                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| Link preview                | Metadata request, including an identifiable bot class; not a human open            |
| Share open                  | Client-confirmed public share render, deduplicated per bounded visit window        |
| Transfer use                | Successful claim/import completion; not a preview                                  |
| Saved entity count          | Active unique owner/entity saves; multiple collections and devices count once      |
| Anonymous saves             | Device-scoped observations, labelled separately from account totals                |
| Search result click-through | Actual course opens divided by recorded result impressions for the same request ID |
| Imported items              | Successfully committed new items, excluding already-saved items and retries        |

An account is not guaranteed to be a unique person. IP and browser fingerprints cannot make that guarantee either. Do not label device estimates as people. A local-only browser cannot provide an authoritative server inventory; opt-outs, offline edits and abuse prevent an exact site-wide human favorite total.

Use typed product events with request IDs, canonical entity IDs, normalized submitted search terms, result/match status and latency. Redact likely emails, tokens and unusually long input before sending. Do not combine generic click events and confirmed domain events into a double count. High-cardinality operational data belongs in the application telemetry store, not unbounded Umami session properties.

## Browser and request diagnostics

The referenced Who Are You registry contains 133 rows: net 21, exit 6, headers 9, locale 9, device 36, browser 27 and fingerprints 25. The complete per-row inventory follows this design. Some readings are inferred or spoofable and must carry provenance, confidence and capability state.

Separate three purposes:

1. Product analytics: bounded coarse browser/device/language/time-zone context, search outcomes, course opens and feature completion. Respect the user's analytics setting and applicable browser privacy signals.
2. Security audit: trusted-proxy IP, session/device revocations, abusive-code attempts and sign-in outcomes. Proposed raw-IP retention: 7 days, restricted to administrators; longer-lived counters use a rotating keyed digest. Do not accept arbitrary client X-Forwarded-For.
3. Optional diagnostics: a dedicated “run diagnostics” screen with a preview and explicit submission. High-entropy fingerprints, extension probing, network-exit probes and hardware details do not run during ordinary search. Requested location, sensor and file probes require their own action. Proposed submitted-report retention: 7 days, configurable downward; location and raw local file data stay excluded unless separately selected.

Every registry entry needs a stable ID, localized label, source, sensitivity, capability requirements, consent category, timeout, size limit and retention. A result is one of available, unsupported, denied, blocked, timed-out or failed; missing is never synthesized as zero. Store the value with its source and schema version, not a single opaque fingerprint string.

TCP SYN, JA4, HTTP/2 SETTINGS and QUIC fingerprints require a controlled transport probe. CDN termination hides the original connection from the Next.js server. Cloudflare-specific fields require trusted edge metadata. DNS/exit/cross-site tests need independently controlled destinations; do not silently call the reference project's public probe endpoints. Browser APIs differ by browser and permission state. A complete inventory does not mean 133 values can be obtained from every device.

Run optional probes in bounded idle batches, cancel on navigation, avoid main-thread work during scrolling and set a report/body budget. Do not upload raw storage contents, browser history entries, cookies, private keys or photo files. Storage tracing reports this application's own storage capabilities/usage, not another site's data. This inventory is for diagnostics, not account authentication or automatic misconduct decisions.

## Umami 3.5 compatibility and replay investigation

| Capability              | Application integration                                                                                                | Umami deployment or dashboard                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Browser errors          | Keep data-errors; add caught-error reporting from error boundaries and selected catch paths, deduplicated and redacted | Error issues, occurrence filters and session/replay links                                   |
| Release/environment     | Bundled build SHA, optionally a release tag; explicit production/staging/development value                             | Filter issues by actual running app build                                                   |
| Central configuration   | One initialization source; document attribute precedence over umamiConfig                                              | Version-compatible tracker and recorder                                                     |
| Identity                | Optional analytics-specific opaque account pseudonym after permission; reset safely on logout/account switch           | Distinct IDs and corrected session attribution; never email, credential ID or recovery code |
| Replays and heatmaps    | One recorder, scoped blocking, consent gate; validate custom controls, portals, iframes and scroll roots               | Sampling, duration, masking, new player/navigation and heatmap fixes                        |
| Performance             | Retain performance collection; correlate confirmed search/sync latency through typed events                            | Updated background/prerender CWV and reporting                                              |
| Analytics API           | Preserve explicit date ranges for reproducible audits; support period shortcuts and visitId when available             | Error endpoints, tightened API permissions and updated client contracts                     |
| Session privacy/network | Keep site identity separate from analytics salt; use only intentional supported rotation                               | Explicit APP_SECRET, TRUSTED_PROXIES and optional ENABLE_CLIENT_SALT                        |
| Reports/security        | Define goals, funnels, journeys, retention and boards for search → course → save/import; audit read permissions        | Chart/calendar/time-zone fixes, admin security/2FA, share revocation, cache/query fixes     |

Umami 3.5's complete relevant capability set includes server and dashboard features; adding script attributes does not enable server migrations, administrator controls or a working recorder. Revenue, links and pixels are existing optional features, not new browser attributes to enable without a product purpose. Do not fabricate purchase events or open public raw analytics to satisfy a feature checklist.

Upgrade the self-hosted service, tracker and recorder as one versioned rollout. Verify explicit APP_SECRET, Node >=20.19 and PostgreSQL migration 27_add_error_tracking, back up the database, and remove reliance on the deleted public /api/config endpoint. Keep API keys server-only. Check existing tokens after the tighter route checks.

The 3.5 tracker exposes identify, but no public reset method in its inspected interface. Passing undefined is not a supported logout protocol. Keep account-linked analytics disabled until an end-to-end test proves login, logout and account switching cannot attribute the next user's activity to the previous account. Application account synchronization and its business metrics do not depend on enabling this linkage.

Use a deliberate asset version in tracker and recorder URLs and verify cache keys at the reverse proxy/CDN; purge stale script caches on upgrade. A version query is ineffective if the CDN ignores that parameter. The website build's release marker and the Umami asset version are separate values.

The replay investigation remains open:

1. Reproduce on the same saved event data with the old and new players, then record a new synthetic test with matched tracker/recorder/server versions.
2. Compare live DOM, serialized snapshots and reconstructed DOM at the affected timestamp. Inspect hidden accessibility controls, responsive copies, portal containers, stylesheet serialization, Tailwind layers and content-visibility.
3. Verify full snapshots, mutation ordering, fragment restoration and network failures. A stationary replay may also be a stopped recording; the configured maximum and the script's session-cache startup window need checking.
4. Measure recording-on/off input latency, long tasks, mutation volume and payload size. Start with the official 15% sampling/5-minute defaults for comparison; keep a controlled 100% debug session for reproducibility rather than all traffic.
5. Test search composition/IME, term menus, course details, RMP pages, syllabi/iframes, nested scrolling, navigation/back and reduced-motion/mobile layouts. Replay scripts do not execute the site's application JavaScript; the reconstructed visual state must come from serialized DOM/styles/events.
6. Block authentication/recovery/private-transfer/private-saved content and ensure enabling/disabling tracking actually starts/stops capture. If the upstream recorder lacks teardown, an explicit reload with an initialization gate is safer than pretending removal of a script tag stops it.

Cross-origin iframe internals and pre-existing broken recordings may remain unrecoverable. Do not remove accessibility controls, flatten all panels or discard scrolling optimizations merely to hide a recorder defect. Identify a concrete incompatibility before a component-specific fix.

Primary references: [Umami 3.5 release](https://umami.is/blog/umami-v3.5), [tracker configuration](https://docs.umami.is/docs/tracker-configuration), [error tracking](https://docs.umami.is/docs/error-tracking), [replays](https://docs.umami.is/docs/replays), [3.4.1 dependencies](https://github.com/umami-software/umami/blob/v3.4.1/package.json), [3.5.0 dependencies](https://github.com/umami-software/umami/blob/v3.5.0/package.json), [recorder send path](https://github.com/umami-software/umami/blob/v3.5.0/src/recorder/index.js).

## Delivery boundaries and acceptance

Independent conventional commits are required for each behavior: fix(analytics) for cache/version delivery and privacy lifecycle; feat(analytics) for 3.5 integration; feat(history); feat(sharing) for canonical links and public collections separately; feat(transfer); feat(auth); feat(sync); feat(telemetry) for typed product metrics and opt-in diagnostics separately; feature-specific tests with each implementation; docs in separate commits. These are planned boundaries, not completed changes.

Migration is additive and separate from official sync jobs. Back up local saves before the first local format upgrade. Back up the database before production migrations; deploying code never runs destructive migrations automatically. The initial rollout keeps new cloud features gated until their corresponding routes and migrations are healthy.

Required acceptance scenarios:

- Desktop 1440, tablet 768 and phones 390/320 CSS pixels, both languages, 200% text zoom, keyboard and touch; actual screenshots of selection, share/import, expired/revoked, login/recovery, conflict and offline states.
- Two browsers plus a third offline device: union import, repeated requests, concurrent edits, delete/re-add, clock skew, cursor expiry, login switch, lost responses and interrupted storage writes.
- Private object ownership tests, CSRF/redirect tests, code-guess limits across processes, claim races, expiry/revocation, bot previews, XSS-bearing imports and secret/log/replay redaction.
- Both local-only and authenticated imports preserve syllabus update notifications and unavailable historical entities. Existing quotas never silently drop items.
- Save counts remain unchanged on duplicate imports, multiple collections and replayed requests; remove/re-add and anonymous/account merging have explicit tested definitions.
- A production build with matched Umami assets records and replays the complete search → panel → scroll → save flow. Compare screenshots and mutation/event diagnostics, not only successful HTTP responses.
- Load tests use synthetic data and bounded concurrency against an isolated schema; publish measured CPU, memory, database pool wait and p95 latency. No several-hundred-user capacity claim is made without this measurement.

Implementation blockers are infrastructure choices, not reasons to weaken the protocol: stable auth origin/RP ID, recovery/delivery availability, managed secrets, trusted proxy topology and optional dedicated diagnostic probe infrastructure.

## Complete diagnostic registry

Inventory source: [Who Are You registry](https://github.com/yt1988/who-are-you/blob/cabe524f4cc944dd7c62a30582a395132a4132d6/src/sniffers.mjs), revision cabe524f4cc944dd7c62a30582a395132a4132d6 (MIT project). This is an inventory, not a copied probe implementation.

Modes: B = coarse basic analytics only; S = restricted security data; D = optional submitted diagnostic; L = local display unless explicitly selected for a report. All non-basic readings still require their registry's permission and deployment support. Methods name upstream sources; endpoint names do not authorize using those services in production.

### Network

Trusted edge metadata or controlled probes. Transport fingerprints require dedicated infrastructure.

| ID     | Reading                   | Upstream method                   | Mode | Additional limits                                        |
| ------ | ------------------------- | --------------------------------- | ---- | -------------------------------------------------------- |
| ip     | IP address                | CF-Connecting-IP                  | S    | Trusted proxy; raw data restricted to security retention |
| geo    | Location                  | request.cf.city                   | B    | Country/region buckets only in B                         |
| coords | Coordinates               | request.cf.latitude               | D    | Edge estimate, not browser GPS                           |
| isp    | Network (ASN)             | request.cf.asOrganization         | B    | Coarse ASN; trusted edge or local database               |
| tor    | Tor                       | check.torproject.org exit list    | D    | —                                                        |
| dns    | DNS resolver              | edns.ip-api.com                   | D    | Controlled DNS detection; optional external requests     |
| tzip   | Time zone of the IP       | request.cf.timezone               | D    | —                                                        |
| ptr    | Reverse DNS               | DNS PTR                           | D    | —                                                        |
| edge   | Nearest data center       | request.cf.colo                   | D    | —                                                        |
| proto  | HTTP and TLS              | request.cf.tlsVersion             | D    | Browser-to-edge metadata, not origin TLS                 |
| kex    | Key exchange              | /cdn-cgi/trace · kex, sni         | D    | —                                                        |
| warp   | Cloudflare WARP           | /cdn-cgi/trace · warp             | D    | —                                                        |
| tlsfp  | TLS fingerprint           | TLS ClientHello                   | D    | Controlled TLS termination or authorized edge metadata   |
| tcpfp  | TCP/IP fingerprint        | probe.1ms.dog · TCP SYN           | D    | Dedicated transport probe                                |
| ja4    | TLS fingerprint (JA4)     | probe.1ms.dog · JA4               | D    | Dedicated probe or authorized edge feature               |
| h2fp   | HTTP/2 fingerprint        | probe.1ms.dog · HTTP/2 SETTINGS   | D    | Dedicated HTTP/2 termination probe                       |
| quicfp | QUIC fingerprint (HTTP/3) | probe.1ms.dog · HTTP/3 · QUIC JA4 | D    | Dedicated QUIC/HTTP3 probe and UDP path                  |
| clock  | Your clock                | Date.now()                        | D    | —                                                        |
| webrtc | WebRTC addresses          | RTCPeerConnection · STUN          | D    | Controlled STUN; sensitive addresses                     |
| lan    | Local address             | WebRTC host candidate             | D    | Often hidden or replaced by mDNS                         |
| v6mac  | IPv6 leaking the MAC      | IPv6 EUI-64 (ff:fe)               | D    | Heuristic EUI-64 shape; not a reliable MAC               |

### Network exits

Use separate controlled destinations, explicit opt-in and bounded requests. CORS and proxy routing can prevent a reading.

| ID        | Reading                | Upstream method                  | Mode | Additional limits |
| --------- | ---------------------- | -------------------------------- | ---- | ----------------- |
| ex_cn     | Site in mainland China | myip.ipip.net                    | D    | —                 |
| ex_intl   | IP service abroad      | api.ip.sb                        | D    | —                 |
| ex_gpt    | ChatGPT                | chatgpt.com/cdn-cgi/trace        | D    | —                 |
| ex_claude | Claude                 | claude.ai/cdn-cgi/trace          | D    | —                 |
| ex_cf     | Cloudflare             | www.cloudflare.com/cdn-cgi/trace | D    | —                 |
| stack     | IPv4 and IPv6          | Cloudflare Radar · IPv4 / IPv6   | D    | —                 |

### Request headers

Use only headers actually received from a trusted path. Browser hints may be absent.

| ID     | Reading            | Upstream method             | Mode | Additional limits                                       |
| ------ | ------------------ | --------------------------- | ---- | ------------------------------------------------------- |
| h_ua   | User agent         | User-Agent                  | B    | B stores coarse parsed family; full string in D/S only  |
| h_lang | Languages          | Accept-Language             | B    | —                                                       |
| h_chua | Browser brands     | Sec-CH-UA                   | B    | —                                                       |
| h_plat | Platform           | Sec-CH-UA-Platform          | B    | —                                                       |
| ch     | Client Hints       | Sec-CH-UA-* (Accept-CH)     | D    | Accept-CH; high-entropy hints require opt-in            |
| h_enc  | Compression        | Accept-Encoding             | B    | —                                                       |
| h_dnt  | Do Not Track       | DNT · Sec-GPC               | B    | —                                                       |
| h_ref  | Came from          | Referer · document.referrer | B    | Sanitized public route; no tokens or query content      |
| wba    | AI agent signature | Signature · Signature-Agent | D    | Only when signed-agent headers exist; verify separately |

### Locale

Browser/API support varies; identifying detailed lists require diagnostic consent.

| ID     | Reading                | Upstream method        | Mode | Additional limits                              |
| ------ | ---------------------- | ---------------------- | ---- | ---------------------------------------------- |
| langs  | Browser languages      | navigator.languages    | B    | —                                              |
| locale | Locale                 | Intl.DateTimeFormat    | B    | —                                              |
| tz     | System time zone       | Intl …timeZone         | B    | —                                              |
| hour   | Clock format           | Intl …hourCycle        | B    | —                                              |
| week   | Week starts            | Intl.Locale weekInfo   | D    | —                                              |
| fmt    | Number and date format | Intl.NumberFormat      | D    | —                                              |
| icu    | ICU data               | Intl.supportedValuesOf | D    | —                                              |
| kbd    | Keyboard layout        | navigator.keyboard     | D    | Permission/support dependent; never typed keys |
| voices | Speech voices          | speechSynthesis        | D    | Identifying local voice list; optional         |

### Device

Browser support, permissions and privacy settings vary. Capability checks do not authorize accessing a device.

| ID        | Reading                 | Upstream method                   | Mode | Additional limits                                      |
| --------- | ----------------------- | --------------------------------- | ---- | ------------------------------------------------------ |
| os        | Operating system        | userAgentData                     | B    | —                                                      |
| browser   | Browser                 | userAgentData.brands              | B    | —                                                      |
| arch      | CPU architecture        | …architecture · bitness           | D    | —                                                      |
| form      | Device form             | userAgentData formFactors         | D    | —                                                      |
| model     | Device model            | screen · GPU · Client Hints model | D    | —                                                      |
| screen    | Screen                  | screen · devicePixelRatio         | B    | Bucket dimensions/DPR in B; exact values in D          |
| hz        | Refresh rate            | requestAnimationFrame             | D    | Idle sample; approximate, affected by power state      |
| screens   | Screens                 | screen.isExtended · screenX       | D    | Window-management support and permission               |
| win       | Window                  | innerWidth · availHeight          | B    | Bucket viewport dimensions in B                        |
| scrollbar | Scrollbar width         | offsetWidth − clientWidth         | D    | —                                                      |
| gpu       | Graphics card           | WebGL RENDERER                    | D    | —                                                      |
| vm        | Virtual machine         | WebGL renderer · hypervisor names | D    | —                                                      |
| webgpu    | WebGPU                  | navigator.gpu adapter.info        | D    | —                                                      |
| gpulim    | WebGPU capabilities     | GPUAdapter limits · features      | D    | —                                                      |
| glx       | WebGL capabilities      | WebGL2 · MAX_TEXTURE_SIZE         | D    | —                                                      |
| cpu       | CPU cores               | hardwareConcurrency               | D    | —                                                      |
| mem       | Memory                  | navigator.deviceMemory            | D    | —                                                      |
| heap      | JS memory limit         | performance.memory                | D    | —                                                      |
| touch     | Touch and pointer       | maxTouchPoints · pointer          | B    | —                                                      |
| battery   | Battery                 | navigator.getBattery              | D    | —                                                      |
| geoloc    | Precise location (asks) | geolocation (on request)          | D    | Separate user action and location permission           |
| sensors   | Motion sensors (asks)   | devicemotion (on request)         | D    | Separate action; sensor permission as required         |
| conn      | Connection              | navigator.connection              | D    | —                                                      |
| media     | Cameras and mics        | enumerateDevices                  | D    | Labels may need media permission; no recording         |
| audiohw   | Audio hardware          | AudioContext.sampleRate           | D    | —                                                      |
| bio       | Biometrics              | PublicKeyCredential               | D    | Availability only; no credentials or biometric data    |
| bt        | Bluetooth               | bluetooth.getAvailability         | D    | —                                                      |
| devs      | Devices already allowed | usb · hid · serial getDevices     | D    | Only previously granted devices; no permission request |
| gamepad   | Game controller         | getGamepads (on request)          | D    | Separate user gesture                                  |
| xr        | VR / AR                 | navigator.xr.isSessionSupported   | D    | —                                                      |
| codecs    | Video codecs            | MediaSource.isTypeSupported       | D    | —                                                      |
| rtccodecs | WebRTC codecs           | RTCRtpSender.getCapabilities      | D    | —                                                      |
| recmime   | Recording formats       | MediaRecorder.isTypeSupported     | D    | —                                                      |
| hwdec     | Hardware video decoding | mediaCapabilities.decodingInfo    | D    | —                                                      |
| drm       | DRM                     | requestMediaKeySystemAccess       | D    | Optional capability test; no licence acquisition       |
| storage   | Storage quota           | storage.estimate                  | D    | —                                                      |

### Browser

Optional checks run in isolation when needed. Never read another origin's private data.

| ID        | Reading                            | Upstream method                                | Mode | Additional limits                                           |
| --------- | ---------------------------------- | ---------------------------------------------- | ---- | ----------------------------------------------------------- |
| scheme    | Color scheme                       | prefers-color-scheme                           | B    | —                                                           |
| motion    | Animations                         | prefers-reduced-motion                         | B    | —                                                           |
| gamut     | Display colors                     | color-gamut · dynamic-range                    | B    | —                                                           |
| a11y      | Accessibility                      | prefers-contrast · forced-colors               | B    | —                                                           |
| sysui     | Default font size and accent color | font-size: medium · AccentColor                | D    | —                                                           |
| display   | Opened as                          | display-mode                                   | B    | —                                                           |
| dnt       | Privacy signals                    | doNotTrack · GPC                               | B    | —                                                           |
| cookies   | Cookies                            | navigator.cookieEnabled                        | B    | —                                                           |
| psb       | Privacy Sandbox                    | browsingTopics · runAdAuction · sharedStorage  | D    | —                                                           |
| perms     | Permissions                        | permissions.query                              | D    | —                                                           |
| apis      | Sensitive APIs                     | usb · serial · hid · IdleDetector …            | D    | —                                                           |
| pdf       | PDF viewer                         | pdfViewerEnabled                               | D    | —                                                           |
| ai        | Built-in AI                        | LanguageModel · Translator.availability        | D    | —                                                           |
| webdriver | Automation                         | navigator.webdriver                            | D    | —                                                           |
| auto      | Automation traces                  | headless · CDP · Electron traces               | D    | —                                                           |
| idstr     | Identity strings                   | navigator.vendor · productSub · plugins        | D    | —                                                           |
| agent     | How you click                      | mousemove → pointerdown · isTrusted            | D    | —                                                           |
| worker    | navigator in a Worker              | Worker · navigator                             | D    | —                                                           |
| adblock   | Ad blocker                         | bait element                                   | D    | —                                                           |
| trackers  | Tracker blocking test              | 7 tracker scripts (on request)                 | D    | Isolated test; no third-party code on main origin           |
| ext       | Extensions                         | window.ethereum · DOM marks                    | D    | —                                                           |
| extwar    | Extension scan                     | chrome-extension:// files                      | D    | Browser/CSP limits; cannot enumerate all extensions         |
| history   | Tab history                        | history.length                                 | D    | Only history.length; no visited URLs                        |
| exif      | What a photo carries               | a photo's EXIF, read locally                   | L    | User-selected file, local preview; selected metadata only   |
| traces    | Stored traces                      | localStorage · IndexedDB · Cache · window.name | L    | Own-origin capabilities/counts, never stored values         |
| xsite     | Cross-site tracking                | cross.1ms.one · iframe · SameSite=None · CHIPS | D    | Separate controlled origin and iframe; partitioning applies |
| fonts     | Installed fonts                    | canvas measureText                             | D    | —                                                           |

### Fingerprints

Opt-in, budgeted computation only. Results are spoofable and are not identity credentials.

| ID        | Reading                       | Upstream method                        | Mode | Additional limits                                     |
| --------- | ----------------------------- | -------------------------------------- | ---- | ----------------------------------------------------- |
| engine    | JS engine                     | Error.message                          | D    | —                                                     |
| engver    | Engine's real version         | JS feature probes                      | D    | —                                                     |
| wasm      | WebAssembly                   | WebAssembly.validate                   | D    | —                                                     |
| lies      | Lie detection                 | Function.prototype.toString · iframe   | D    | —                                                     |
| cssv      | CSS feature level             | CSS.supports                           | D    | —                                                     |
| smooth    | Font smoothing                | canvas text antialiasing               | D    | —                                                     |
| canvas    | Canvas                        | canvas.toDataURL                       | D    | —                                                     |
| webgl     | WebGL                         | WebGL getParameter                     | D    | —                                                     |
| audio     | Audio                         | OfflineAudioContext                    | D    | —                                                     |
| mathfp    | Math fingerprint              | Math.* → SHA-256                       | D    | —                                                     |
| emoji     | System emoji version          | emoji measureText                      | D    | —                                                     |
| fontfp    | Font list                     | fonts → SHA-256                        | D    | —                                                     |
| domrect   | Element sizes (DOMRect)       | getClientRects · Range                 | D    | —                                                     |
| svgrect   | SVG text sizes                | SVG getBBox · getComputedTextLength    | D    | —                                                     |
| textm     | Text metrics                  | measureText actualBoundingBox          | D    | —                                                     |
| glimg     | WebGL rendering               | WebGL readPixels                       | D    | —                                                     |
| keys      | Engine API count              | window · HTMLElement · CSS keys        | D    | —                                                     |
| timer     | Timer precision               | performance.now() resolution           | D    | —                                                     |
| callstack | Call stack depth              | recursion depth                        | D    | Strict CPU/recursion budget; skip constrained devices |
| fpid      | Combined fingerprint          | SHA-256                                | D    | Diagnostic composite only, never identity             |
| hwid      | Hardware ID (across browsers) | screen · cores · GPU · fonts → SHA-256 | D    | Heuristic composite, not hardware serial              |
| etag      | Cache ID (ETag)               | HTTP cache · ETag / If-None-Match      | D    | Dedicated opt-in diagnostic resource; no tracking ID  |
| rand      | Fingerprint protection        | canvas × 2                             | D    | —                                                     |
| adsp      | Anti-detect tells             | impossible readings · switcher marks   | D    | —                                                     |
| shield    | Whose protection              | navigator.brave · noise · lies         | D    | —                                                     |

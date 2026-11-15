# First-party statistics and diagnostics

English · [简体中文](../zh-CN/analytics/first-party.md)

This service is separate from Umami. Browsing remains local unless a feature explicitly sends data: ordinary product events follow the analytics setting; favorites upload after account sync is enabled; diagnostic values upload only after report preview and submission. Umami replay follows its remote configuration on every page, including account, saved, history and sharing pages.

## Events and request context

The event collector records page views, submitted searches, search outcomes and elapsed time, opened courses, favorite additions/removals and share imports. Typed payloads exclude arbitrary form values, credentials and URL fragments. Course-code search labels are normalized; likely credentials and emails are redacted. Cross-tab notifications, cloud mirrors and retried event IDs do not count as new actions.

The browser queue uses IndexedDB: up to 500 events, retained locally for 24 hours, batches of 20, bounded retry backoff. Failed collection does not block searching or saving. Explicit opt-out, Do Not Track, Global Privacy Control and the developer-tools analytics switch suppress collection.

Request context includes the full User-Agent and Accept-Language, browser-reported languages/time zone, a viewport size bucket, environment, and an IP address only when a trusted proxy header is configured. A random installation ID is HMACed before storage; it is not an account credential. Browser values are not proof of identity.

Set `USER_DATA_TRUSTED_PROXY_HEADER` only when the ingress removes caller-supplied values and overwrites this header with one validated address. For example, `x-real-ip` is safe only under that deployment contract. Lists and arbitrary `X-Forwarded-For` values are rejected. Without configuration, IP is stored as unavailable.

Telemetry uses a separate PostgreSQL pool of two connections with a queue bound and statement timeout. Event insertion and daily counters share one atomic SQL operation. Daily aggregates use UTC; environment filters separate production, staging and development.

## Statistics

Open `/admin/statistics` through the **Statistics & diagnostics** section of Dev Tools. Production APIs require the signed administrator session unlocked with `DEV_DEBUG_KEY`. Client-side visibility does not grant API access. Local development allows debugging by default.

The dashboard provides 1–90-day totals, the top 50 search terms, result and latency distributions, page views, lifetime attributed-link counters, request context and diagnostic reports. Request records paginate 100 at a time; report summaries paginate 25 at a time. Cursors retain timestamp microseconds and use an ID tie-breaker. Full diagnostic payloads load only when a report is opened. JSON export includes the displayed results, not an unbounded database dump.

`/popular` counts active favorites in synced accounts, once per account and canonical item. Removing a favorite reduces its count. Ambiguous teacher names do not become shared identities. Anonymous local saves and shares are not people counts. Public responses contain compact course/section snapshots and teacher labels, with contact details removed. Results may be cached for one minute.

## Browser diagnostics

`/diagnostics` lists all 133 entries in the referenced [Who Are You registry](https://github.com/yt1988/who-are-you/blob/cabe524f4cc944dd7c62a30582a395132a4132d6/src/sniffers.mjs). Its MIT notice is retained in `src/lib/diagnostics/UPSTREAM-LICENSE.txt`. This project uses its own probe implementation; inventory method names describe the upstream capabilities, not a promise of identical measurements.

- Basic checks run only after **Run diagnostics**. Device/fingerprint and network groups have separate opt-in switches.
- Location, motion sensors and keyboard layout use separate actions and browser permissions where required. Camera/microphone inspection lists available device types/labels without requesting recording access. No biometric samples are read.
- EXIF reads a user-selected JPEG locally, capped at 20 MiB with a 256 KiB metadata read. The file is never uploaded. Storage checks report this origin's counts, not stored values. Tab history exposes only `history.length`.
- CPU-heavy work is bounded. Stack tests run in a disposable worker; audio fingerprints use offline rendering. Canvas, font and hardware composites are spoofable diagnostics, not serial numbers or authentication identifiers.
- Each result states its source and capability status: available, unsupported, denied, blocked, timed out, failed, not configured or not run. Missing readings are not zeroes. Extension traces do not enumerate all extensions; font checks cover a named sample rather than every installed font.
- Select values, review the actual JSON, then submit. Bulk selection excludes IP, local addresses, precise location, sensors and photo metadata. These can be selected individually. Reports are schema-versioned and limited to 133 distinct IDs, 16 KiB per value and 512 KiB per submission.

The server stores submitted readings as **browser-reported**, with independently observed request fields stored separately. Submission IDs are idempotent and bound to the submitting session. Reports are unavailable to the administrator APIs after seven days. Physical deletion requires the maintenance job described below.

### Optional probe infrastructure

Network transport details cannot be reconstructed from the Next.js origin connection behind a CDN. Without controlled infrastructure these entries remain **not configured**. The application does not call the reference project's public probe services.

`DIAGNOSTICS_TRUSTED_HEADERS` accepts a JSON map, for example `{"ja4":"x-diagnostic-ja4","edge":"x-diagnostic-colo"}`. Only allowlisted registry IDs and `x-diagnostic-*` headers are accepted. The ingress must remove incoming copies and set values observed on the browser-to-edge connection. Never forward the origin's own TLS properties as the visitor's fingerprint.

`DIAGNOSTICS_PROBE_PATHS` maps supported network IDs to dedicated paths such as `{"dns":"/diagnostic-probes/dns"}`. Paths must begin `/diagnostic-probes/` and use letters, digits, slashes, underscores or hyphens. The browser performs a credential-free, no-referrer request with a four-second deadline and a 16 KiB JSON response limit. The application does not fetch arbitrary URLs supplied by visitors.

These paths are operator-provided adapters, not built-in transport probes. An adapter must report measurements attributable to the requesting browser. A server's outbound IP cannot represent the browser's exit address. DNS, cross-site, extension and tracker tests require controlled destinations, browser-side measurement and any necessary isolation/CORS support. Unavailable infrastructure must remain unavailable; do not return successful placeholder values.

## Installation and retention

Run the additive migrations after configuring the authentication/user-data secrets and backing up the database:

```sh
pnpm account:migrate --production
pnpm account:migrate --production --apply
pnpm user-data:migrate --production
pnpm user-data:migrate --production --apply
```

Without `--apply`, commands print a read-only plan. Development defaults use separate authentication tables and `osu_user_dev`; production uses `osu_user`. See [account deployment](../user-data.md) before overriding namespaces.

| Data | Retention |
| --- | --- |
| Security events, full request context, diagnostic reports | 7 days |
| Raw product events | 30 days |
| Nonempty daily dimensions, including search terms | 90 days |
| Daily totals with no dimension | Retained |
| Expired/revoked shared snapshots | 7-day cleanup grace |
| Expired/completed/revoked transfers | 1-day cleanup grace |
| Sync receipts and deletion tombstones | 180 days minimum |
| Active favorites, official course/syllabus archives | Not removed by this job |

```sh
pnpm user-data:maintain --production
pnpm user-data:maintain --production --apply
```

The first command is a dry run. Applied cleanup checks the installation ownership marker, locks only its own maintenance job, uses bounded deletion batches and reports remaining work. Tombstone removal advances the account's reconciliation floor transactionally; a device with an expired cursor must review its merge before restoring local items.

`.github/workflows/user-data-maintenance.yml` runs every four hours only after repository variable `USER_DATA_MAINTENANCE_ENABLED=true` is set. Scheduled cleanup is **disabled by default**. Manual dispatch defaults to a dry run; enable its apply option to remove expired data. Configure `DATABASE_URL` and the production namespace/table-prefix variables consistently with the application. Apply migrations before enabling the schedule. Until the job runs, expired rows may remain physically stored even when report APIs deny access. Database backups have their own retention policy.

[Testing](../testing.md) · [Umami](umami.md) · [Accounts and sharing](../user-data.md)

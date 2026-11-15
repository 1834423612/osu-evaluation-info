# Accounts, favorites and sharing

English · [简体中文](zh-CN/user-data.md)

Favorites work locally without an account. The saved page manages courses, sections, instructors and syllabi together, supports selected JSON export/import, and keeps existing items when importing. Removing selected items offers Undo. Imports exceeding a collection limit fail without truncating the collection. Limits are 100 courses and 200 items in each other category.

## Collections and private backups

The saved page shows compact collection tabs with live item counts. Cards show local storage, confirmed cloud storage and collection membership. **Manage** opens a separate dialog (a draggable bottom sheet on phones), and supports up to 30 named collections, each with 12 flat tags of up to 24 characters. Favorites can belong to several collections without duplication. Search matches item details, collection names and tags. Select the current view, a subject group, or individual cards with a checkbox. Partial selections are marked. Type filters and title/type sorting affect the management list.

Select items to add, move or remove collection membership. Deleting a collection keeps its favorites and offers Undo. Organization follows account sync. Competing edits require a choice; **Keep both collections** retains the cloud version and creates a separate device copy. Reopen a draft if another tab has changed that collection.

Share, transfer and ordinary JSON export use the active collection and explicit selection. The share dialog lists the exact candidates and starts with no selection unless items were explicitly selected beforehand. Private organization stays out of public snapshots. An empty collection cannot accidentally publish all favorites.

**Export** offers a downloaded collection, a full private backup, or online device transfer without a file. **Import** offers local files, online transfers and share codes. The full private backup saves the current workspace's four favorite categories, cached details, organization and syllabus acknowledgement state. Private backups allow 10 MiB; ordinary exchange files allow 1 MiB. Use **Import**, review the summary and choose **Merge backup**. Existing snapshots and collection names stay; membership and tags form a union. Invalid or over-limit unions fail before the single workspace write. Backups may contain cached contacts: keep them private.

RMP library cards and profile pages support direct favorites. They retain source IDs, ratings and the captured identity state. Equal names do not merge; RMP course labels do not become official teaching assignments. Saved RMP entries link to their profile and support grouping, sharing, sync and Undo.

## Database backup before deployment

Install PostgreSQL client tools matching or newer than the server. Preview with `pnpm user-data:backup --production`; add `--apply` to create a backup. The tool verifies the installation marker and selects exact authentication model names from the configured account schema, excluding development schemas.

Two custom-format archives share one exported PostgreSQL snapshot: personal-data/analytics/diagnostic tables and authentication tables. Authentication tables are excluded from the first archive, so they appear only once. The tool fully decodes both archives without restoring them, records SHA-256 digests and row counts, and restricts file permissions. Credentials pass through child environment variables, never command arguments. Output stays in the ignored `.cache/user-data-backups/` directory; copy it to protected backup storage before changing hosts.

This is a user/account backup; official catalog, syllabus, evaluation and RMP data are separate. Archive readability is not a restore drill. Test restoration in an isolated database and preserve server secrets before a production rollback.

## Sign in on another device

Registration collects a display name, email, password and email verification code. Sign-in offers separate email-code, passkey and password methods. Email codes are the default when mail is available; existing accounts created by email code do not have a password until one is set. Passkey sign-in asks for email and device verification, without a password. The server checks that the verified credential belongs to the entered, verified email before creating a session. Password sign-in errors offer the passwordless alternatives; setting or resetting a password requires email verification. Codes use one accessible input with six visual cells, paste support and browser autofill. A verified account can add passkeys and ten recovery codes. A passkey provider may synchronize credentials between devices; browsers supporting cross-device authentication can offer a phone/QR option. Email sign-in works independently of passkey availability. This site does not require a particular authenticator platform.

Email codes expire after five minutes and permit three attempts. The UI enforces a 60-second resend cooldown. PostgreSQL budgets enforce one message per email per minute, six per hour, 30 per network source per hour, and 1,000 globally per hour; authentication also limits verification attempts and source requests. Missing trusted IP metadata uses a shared fallback budget. Throttled responses include `Retry-After`. Passwords require 12–128 characters. Recovery codes are single-use, expire after one year, and are shown only when generated; generating a new set invalidates the previous set. Store the downloaded codes outside the browser. The account page shows passkey creation times in the browser’s local time zone, device/browser information, network IP and approximate network location when available, and permits revoking another device. Browser model information is shown only when the browser supplies it.

## Server setup

Configure the server-only variables in [.env.example](../.env.example): `DATABASE_URL`, distinct random `BETTER_AUTH_SECRET` and `USER_DATA_SECRET` values of at least 32 characters, the production HTTPS `AUTH_BASE_URL`, and `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. The SMTP sender must be authorized by the mail service. Port 587 normally uses STARTTLS with `SMTP_SECURE=false`; port 465 uses `true`. Certificate validation remains enabled. Changing either secret can invalidate sessions or issued capabilities; preserve them across deployments.

Run migrations with the same credentials and overrides as the application:

```sh
# Production: preview first, then apply.
pnpm account:migrate --production
pnpm account:migrate --production --apply
pnpm user-data:migrate --production
pnpm user-data:migrate --production --apply

# Development uses isolated defaults.
pnpm account:migrate --apply
pnpm user-data:migrate --apply
```

Commands load `.env.local` and `.env`. Without `--apply`, they show a read-only plan. `osu_identity` contains account, session, passkey, favorites, sharing, transfer, principal and abuse-budget tables. `osu_analytics` contains product events and visitor contexts; `osu_diagnostics` contains diagnostic reports. Development uses matching `_dev` schemas. Authentication has a dedicated pool with an explicit schema search path and no table prefix. The namespace helpers resolve domain tables; explicit overrides support disposable integration tests. Ownership markers and checksums protect initialization. Official catalog, syllabus, evaluation and RMP tables have separate domains.

`AUTH_DEV_BASE_URL` defaults to `http://localhost:3000`. When this address uses a loopback host, development also trusts `localhost`, `127.0.0.1` and `[::1]` with the same protocol and port for email/password authentication. Other ports and arbitrary hosts remain untrusted. Passkeys remain tied to the configured relying-party host and origin; use the address where the passkey was registered. Production trusts the configured origin, not arbitrary forwarded-host headers. Set `USER_DATA_TRUSTED_PROXY_HEADER` only when a trusted proxy overwrites that header and direct access to the origin is blocked. Do not use a client-supplied IP header as proof of identity.

Missing SMTP disables sending codes; adding environment values is not proof of successful delivery. Check actual delivery with an address you control before enabling registration publicly. No SMTP credentials appear in client bundles or logs.

## Optional account sync

Signing in does not upload or replace favorites. **Set up sync** previews local-only, cloud-only and conflicting items; **Merge & enable sync** opts in. **Merge once** stops after that merge and its conflict choices finish. **Pause** keeps account favorites on the device and stops further upload. Signing out shows the separate guest collection; account copies remain under their own local namespace for the next sign-in.

The server uses per-item versions, account cursors, deletion tombstones and idempotent operation IDs. Independent additions merge. Concurrent changes to the same item require **Keep device** or **Use cloud**. A deletion is a versioned change, so an offline edit cannot silently resurrect it. Syllabus notification acknowledgements travel as exact revision data.

The client persists its outbox in IndexedDB before sending. It debounces changes, polls visible pages every 30 seconds, retries after connectivity returns and backs off failures. An IndexedDB lease coordinates sync across tabs; requests name their expected account and the API checks it against the authenticated session. A response for another account cannot be applied. If the server reports an expired reconciliation cursor, the device retains its changes and asks for a reviewed merge.

Browser storage is required for durable sync. Storage/quota failures leave original snapshots and queued changes available rather than treating them as an authoritative empty collection. Export backups before clearing browser storage. Sync is not an offline backup of every official PDF or the complete course catalog.

## Collection links

**Share** publishes an immutable snapshot of all or selected favorites. Links default to link-only access; their high-entropy capability is in the URL fragment, captured before analytics and removed from the address bar. The browser session retains it for refresh. Public sharing is an explicit choice and additionally issues a six-digit discovery code valid for at most 24 hours. A short code grants access to that public snapshot only; it is not an account login.

Snapshots expire after the selected period (15 minutes to 30 days); the default is seven days. Owners can copy, replace or revoke links from **Shared links**. Replacing a link invalidates its old capability. An anonymous owner needs the creating browser's cookie; an authenticated owner can manage its account links from other devices. Clearing the anonymous cookie loses anonymous management access.

The separate share page supports partial import and in-place course details. Existing recipient favorites are kept. Public snapshots omit email addresses and the sender's syllabus notification state. Creation retries reuse a request ID, so a lost response does not publish a duplicate. Each owner can keep 20 active links and 10 MiB of active snapshots; each snapshot is at most 1 MiB. Link metadata previews, explicit opens and imports are separate counters; opens and imports are deduplicated by their documented actor/window scope, not claimed as distinct people.

## Local activity

`/history` stores submitted searches and deliberately opened courses in this browser for 90 days, with at most 100 searches and 200 course opens. Reopening an item moves it to the top. History is grouped by local calendar date, searchable by type or text, and can be disabled, cleared after confirmation, deleted individually or in selected batches, or exported as JSON. The homepage shows at most four distinct recent searches in a compact row. Export uses sanitized local URLs and includes all retained entries, independent of the visible filter. Cross-tab edits re-read the latest history inside the shared IndexedDB transaction. Durable writes need IndexedDB and browser storage; export remains available when writes fail. Keystrokes and prefetched courses are not history entries. History is local and is not uploaded by favorites sync.

See [Testing](testing.md) for isolated database tests and mocked browser flows, [Umami analytics](analytics/umami.md) for recording settings, and the dated [design record](design/sharing-sync-analytics.md) for the broader architecture. Design proposals do not imply that every proposed subsystem has shipped.

## Temporary transfers

**Export → Send online** on the saved page sends all or selected favorites without an account. The independent `/transfer` page receives codes and manages active transfers from this browser or account. A transfer defaults to one hour; options are 15 minutes, one hour, 24 hours and seven days. Owners can revoke it. Limits are ten active transfers, 10 MiB total and 1 MiB per snapshot.

A private link carries a high-entropy fragment capability. A six-digit pairing code expires after ten minutes and can only request access: the sender must compare the confirmation number shown on the receiving device and approve that device. A code alone never returns the snapshot. No more than three pending receiving devices are admitted per transfer.

Receiving creates a 15-minute lease, bounded by the transfer expiry, so a second device cannot consume the same transfer concurrently. The same browser can resume or refresh its claim. Selected items are persisted locally before completion is acknowledged. If the acknowledgement response is lost, **Confirm completion again** retries the same claim; it does not import a second copy. Import preserves exact syllabus revision state for new items and keeps existing recipient items. Read-only availability checks do not create an anonymous identity.

## Course and page links

Course cards and detail tabs provide **Share**; public pages also expose a footer share button. A supported device opens its native share sheet; other browsers copy the link. Cancelling the native sheet does not copy anything. If attribution is unavailable, the canonical public URL remains the fallback. The link dialog offers manual copy and a fresh device-share action when a browser requires another gesture.

Attributed `/l/` links record metadata previews separately from redirect opens. Recognized preview bots receive escaped Open Graph HTML; prefetches and HEAD requests do not increment opens. These are request counts, not unique people. Repeated creation by the same owner reuses its canonical target. Links preserve public filters, the exact course/term/campus/detail selection, and reference-topic anchors; paging cursors and credentials are excluded. Private workspace routes are not general public page targets.

A course link retains a small public snapshot without emails, live enrollment or section lists. If its course is absent from the current search result window or search fails, that snapshot opens the existing course drawer while official details refresh normally. The attribution parameter does not become a course filter or alter search counts.

## Browser write coordination

Local favorite actions, imports, removal/undo, syllabus observations and cloud reconciliation share short IndexedDB read/write transactions on the `sync` object store. Each action re-reads the current workspace after acquiring the transaction. The callback is synchronous: network calls and UI waits run outside it. A single localStorage workspace replacement commits all four favorite kinds; existing data is kept when capacity or storage writes fail.

Use `withSavedMutation` from `src/lib/saved/mutations.ts` for UI mutations. Sync-state callbacks already hold the same transaction. Browser storage rejects saved-item writes outside this context. Await completion before acknowledging a one-time transfer or reporting an import as complete. IDB access must be available for coordinated writes; read-only/export operations retain their original snapshots.

## Recommendations and visitor context

The discovery page samples real courses from a published catalog generation, using the most recent evaluation instrument, response-count shrinkage, sample evidence, course information and subject diversity. Unrated courses remain eligible. It supports subject and entity-type filters. Account favorite counts are private: public payloads contain no account counts, even when favorites inform internal ranking.

Normal visits collect a bounded browser context in `osu_analytics.visitor_context`: UA/language/time zone, screen and viewport dimensions, pixel ratio, platform/model when supplied, CPU count, optional memory/network hints, touch, cookie support and display preferences. A server-derived pseudonymous visitor ID is also used with Umami `identify()`. Signed-in context can be associated with that account for its own device list. IP comes only from a configured trusted ingress header; an HTTPS IP lookup supplies country/region/city with a bounded timeout and cache. No GPS, motion, accelerometer, camera, microphone or permission-requesting probe runs automatically. Existing analytics opt-outs, DNT and GPC remain effective. Contexts expire after seven days under the maintenance command.

Implementation references: [Impeccable](https://github.com/pbakaus/impeccable) for interface hierarchy, [Ding](https://github.com/YusufCeng1z/ding) for single-toast behavior, [OWASP password recovery](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [Better Auth rate limits](https://www.better-auth.com/docs/concepts/rate-limit), and [Umami identity](https://docs.umami.is/docs/distinct-ids). Existing project components and tokens remain the implementation foundation.

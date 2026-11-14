# Accounts, favorites and sharing

English · [简体中文](zh-CN/user-data.md)

Favorites work locally without an account. The saved page manages courses, sections, instructors and syllabi together, supports selected JSON export/import, and keeps existing items when importing. Removing selected items offers Undo. Imports exceeding a collection limit fail without truncating the collection. Limits are 100 courses and 200 items in each other category.

## Sign in on another device

Email codes are the initial sign-in method. A verified account can add passkeys, an optional password and ten recovery codes. A passkey provider may synchronize credentials between devices; browsers supporting cross-device authentication can offer a phone/QR option. Email sign-in works independently of passkey availability. This site does not require a particular authenticator platform.

Email codes expire after five minutes and permit three attempts. Passwords require 12–128 characters. Recovery codes are single-use, expire after one year, and are shown only when generated; generating a new set invalidates the previous set. Store the downloaded codes outside the browser. The account page lists sessions and permits revoking another device.

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

Commands load `.env.local` and `.env`. Without `--apply`, they show a read-only plan. Production defaults to authentication tables `public.ca_*` and schema `osu_user`; development defaults to `public.ca_dev_*` and `osu_user_dev`. `AUTH_TABLE_PREFIX` and `USER_DATA_SCHEMA` override these defaults. Ownership markers prevent adopting unrelated tables. Applied incremental migrations are checksummed and must not be edited. These migrations do not change official catalog, syllabus, evaluation or RMP tables.

`AUTH_DEV_BASE_URL` defaults to `http://localhost:3000`. Production trusts the configured origin, not arbitrary forwarded-host headers. Set `USER_DATA_TRUSTED_PROXY_HEADER` only when a trusted proxy overwrites that header and direct access to the origin is blocked. Do not use a client-supplied IP header as proof of identity.

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

`/history` stores submitted searches and deliberately opened courses in this browser for 90 days, with at most 100 searches and 200 course opens. Reopening an item moves it to the top. History can be disabled, cleared or edited individually. Keystrokes and prefetched courses are not history entries. History is currently local and is not uploaded by favorites sync.

See [Testing](testing.md) for isolated database tests and mocked browser flows, [Umami analytics](analytics/umami.md) for recording settings, and the dated [design record](design/sharing-sync-analytics.md) for the broader architecture. Design proposals do not imply that every proposed subsystem has shipped.

## Temporary transfers

**Transfer** on the saved page sends all or selected favorites without an account. The independent `/transfer` page receives codes and manages active transfers from this browser or account. A transfer defaults to one hour; options are 15 minutes, one hour, 24 hours and seven days. Owners can revoke it. Limits are ten active transfers, 10 MiB total and 1 MiB per snapshot.

A private link carries a high-entropy fragment capability. A six-digit pairing code expires after ten minutes and can only request access: the sender must compare the confirmation number shown on the receiving device and approve that device. A code alone never returns the snapshot. No more than three pending receiving devices are admitted per transfer.

Receiving creates a 15-minute lease, bounded by the transfer expiry, so a second device cannot consume the same transfer concurrently. The same browser can resume or refresh its claim. Selected items are persisted locally before completion is acknowledged. If the acknowledgement response is lost, **Confirm completion again** retries the same claim; it does not import a second copy. Import preserves exact syllabus revision state for new items and keeps existing recipient items. Read-only availability checks do not create an anonymous identity.

## Course and page links

Course cards and detail tabs provide **Share**; public pages also expose a footer share button. A supported device opens its native share sheet; other browsers copy the link. Cancelling the native sheet does not copy anything. If attribution is unavailable, the canonical public URL remains the fallback. The link dialog offers manual copy and a fresh device-share action when a browser requires another gesture.

Attributed `/l/` links record metadata previews separately from redirect opens. Recognized preview bots receive escaped Open Graph HTML; prefetches and HEAD requests do not increment opens. These are request counts, not unique people. Repeated creation by the same owner reuses its canonical target. Links preserve public filters, the exact course/term/campus/detail selection, and reference-topic anchors; paging cursors and credentials are excluded. Private workspace routes are not general public page targets.

A course link retains a small public snapshot without emails, live enrollment or section lists. If its course is absent from the current search result window or search fails, that snapshot opens the existing course drawer while official details refresh normally. The attribution parameter does not become a course filter or alter search counts.

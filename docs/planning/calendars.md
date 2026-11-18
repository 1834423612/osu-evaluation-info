# Calendars and saved schedule groups

English · [简体中文](../zh-CN/planning/calendars.md)

## Use

Three official sources appear automatically: **Terms & exams**, **Holidays & breaks**, and **Registration deadlines**. They read the shared academic-calendar database, rather than copying events into each account. Open a source for a month, week or agenda view; select a date for its complete title and Registrar link. The source bar shows the latest successful collection time, and offers retry when dates cannot load. These sources are read-only and can be referenced by a combined calendar.

**New calendar** starts with a choice between a personal calendar, a live subscription and a combined calendar. The settings form previews the name, icon and color before saving. An empty new calendar does not count as an unfinished edit until its settings change.

Save a semester simulation as a separate group, or replace a selected saved group. Course changes mark the original group stale; they do not silently replace its sections. Open **My calendars** to rename it, edit individual events, choose its icon/color, view a week or agenda, and export ICS. Each calendar has a miniature preview. The mobile grid keeps all seven weekday headings on one row. Times use America/New_York, including daylight saving.

Import ICS files locally, subscribe to an HTTPS/webcal ICS URL after sign-in, or combine existing calendars. A combined calendar refers to its sources; source changes appear in the combined view. Subscribed events are read-only; create an editable copy before changing them. Imports are limited to 2 MB and 3,000 expanded events; unsupported or excessive recurrence fails explicitly. A workspace supports 40 calendars. Browser storage limits may be lower; export a backup if saving reports a storage error.

Remote sources refresh after one hour when the workspace is open. A shared feed request can also refresh up to two stale sources, protected by a database lease and owner rate budget. Refresh failure keeps the last successful events. Remote fetches allow public HTTPS destinations only, revalidate redirects, pin DNS results, and bound duration and response size. Private feeds requiring cookies or an interactive login are unsupported.

## Sharing and subscriptions

Choose one or more calendars and visible event categories. All categories are initially selected. Public nickname is optional. Links can last one day, one week, 30 days, or until revoked. Publishing requires a verified account and institutional-email verification, which does not prove enrollment. The same calendar selection reuses its existing subscription link; changing events updates that link. Revoking a link invalidates it; publishing again creates a new capability. Owners can keep up to 50 active links, each containing at most 30 calendars.

Recipients can view the week grid and copy selected calendars to their own workspace. A copied calendar is independent of subsequent source changes. Capability links grant access to anyone who possesses them. Event titles, descriptions, locations and ordinary event URLs in selected categories are shared; private subscription source URLs and private account identifiers are excluded. Recipient copies cannot be recalled.

The subscription URL works with calendar clients supporting ICS subscriptions. Google and Outlook launch links are convenience shortcuts; provider interfaces and sign-in flows can change. If the address is not prefilled, copy the URL and use [Google's From URL workflow](https://support.google.com/calendar/answer/37100?hl=en) or [Outlook's Subscribe from web workflow](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web). Calendar clients control their refresh frequency. An exported ICS file is a snapshot.

## Official dates and operations

The source is the [OSU University Registrar calendar](https://registrar.osu.edu/academic-calendar/), using its public `umbraco/api/calendar/getentries` endpoint. Collection covers the previous year through five years ahead and consolidates repeated daily entries. General holidays, no-class periods, session boundaries and examination periods are available; individual final-exam appointments are not inferred. Explicit no-class dates suppress generated class meetings. Office closures alone do not suppress classes. General official dates can be included per calendar; exports include dates within that calendar's range.

```sh
pnpm user-data:migrate
pnpm user-data:migrate --apply
pnpm calendar:sync
pnpm calendar:sync --apply
```

Both commands default to preview; `--apply` writes to the configured database. Development uses `_dev` schemas. For a deliberate production operation, add `--production` with the production database configuration. The catalog workflow runs calendar sync independently after search preparation, including when an earlier source step fails; retries and response validation preserve existing rows on source failure. Monitor the workflow rather than assuming every external source succeeds.

Private `calendar` and `calendar_link` tables are in `osu_identity` / `osu_identity_dev`. Planning backups retain the same calendar snapshot for atomic account sync and recovery. Public `academic_calendar` belongs to `osu_planning` / `osu_planning_dev`. Domain schema backups include the new tables. Maintenance removes orphaned private calendars and expired/revoked links after their retention period.

Calendar URLs and events are private account data until shared. They are readable by the application server and are not end-to-end encrypted. A private source URL may itself be a credential. Calendar pages and portals mask replay content; analytics exclude private event text, source URLs and capability values.

For local inspection without uploading a file, run `node scripts/calendar/inspect.mjs /path/to/calendar.ics`; it prints aggregate event and round-trip counts only. See [testing](../testing.md) for offline regression commands.

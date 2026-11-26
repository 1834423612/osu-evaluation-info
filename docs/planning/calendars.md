# Calendars and saved schedule groups

English · [简体中文](../zh-CN/planning/calendars.md)

## Use

Three official sources appear automatically: **Terms & exams**, **Holidays & breaks**, and **Registration deadlines**. They read the shared academic-calendar database, rather than copying events into each account. Open a source for a month, week or agenda view; select a date for its complete title and Registrar link. The source bar shows the latest successful collection time, and offers retry when dates cannot load. These sources are read-only and can be referenced by a combined calendar.

**New calendar** starts with a choice between a personal calendar, a live subscription and a combined calendar. The settings form previews the name, icon and color before saving. An empty new calendar does not count as an unfinished edit until its settings change.

Save a semester simulation as a separate group, or replace a selected saved group. Course changes mark the original group stale; they do not silently replace its sections. Open **My calendars** to rename it, edit individual events, choose its icon/color, view a week or agenda, and export ICS. Each calendar keeps its miniature preview when another source is selected. Official cards carry a shield and an Official badge, and are read-only. Private cards offer edit, delete and share shortcuts on hover or keyboard focus; touch screens keep these actions visible. A share icon identifies calendars with an active link. The mobile grid keeps all seven weekday headings on one row. Times use America/New_York, including daylight saving.

On desktop, the source list and selected calendar occupy two bounded columns with independent scrolling. Adding source cards does not stretch the main calendar to match the list. Narrow screens stack the regions. Stable event colors distinguish types and course/content identities. Dense overlapping events have a count control and an expandable full-title list; select any item there to open its details rather than relying on a narrow grid tile.

Import ICS files locally, subscribe to an HTTPS/webcal ICS URL after sign-in, or combine existing calendars. A combined calendar refers to its sources; source changes appear in the combined view. Subscribed events are read-only; create an editable copy before changing them. Imports are limited to 2 MB and 3,000 expanded events; unsupported or excessive recurrence fails explicitly. A workspace supports 40 calendars. Browser storage limits may be lower; export a backup if saving reports a storage error.

Remote sources refresh after one hour when the workspace is open. A shared feed request can also refresh up to two stale sources, protected by a database lease and owner rate budget. Refresh failure keeps the last successful events. Remote fetches allow public HTTPS destinations only, revalidate redirects, pin DNS results, and bound duration and response size. Private feeds requiring cookies or an interactive login are unsupported.

## Reminders and timetable alternatives

Set up to five reminder times in calendar settings. Editable events can use those defaults, override them with their own times, or turn reminders off. An explicit event setting takes precedence. A combined calendar's explicit defaults propagate through nested sources; when it has no defaults, source-calendar defaults apply. An empty reminder list disables the inherited defaults without changing the source events.

ICS exports and shared device subscriptions include supported relative-to-start `VALARM` entries with `ACTION:DISPLAY`. Imports retain supported display alarms; unsupported alarm actions or absolute/end-relative triggers are not converted into executable actions. Multiple reminders can therefore travel with the calendar, but the receiving calendar app, its subscription behavior and notification permissions determine delivery. All-day reminders are relative to midnight at the start of the date. Reimporting an exported ICS is a snapshot; a subscribed device controls when it refreshes changed reminders.

Semester simulation starts with automatic section choices, including courses that already have an imported section. Fix a particular component only when desired, or return it to automatic selection. The weekly preview scales to the available space and uses distinct course colors. Compare the generated alternatives with **Previous timetable** / **Next timetable**, or use the left/right arrow keys while the simulation dialog is open. No initial navigation-button click is required. In My calendars, those keys compare saved simulation groups in week view; other calendar views navigate the displayed date range. Inputs, selectors and open menus retain their normal keyboard behavior. Saving uses the alternative currently displayed.

Every simulation run rereads official seat and waitlist availability for the semester’s courses, including fixed sections and asynchronous courses. Restricted sections show whether a waitlist has space, is full, is unavailable or could not be confirmed. Failed reads clear the previous run’s availability and display an unknown state; course times remain usable for comparison. Requests remain bounded and cancellable, and the button identifies the current refresh stage. Seat counts are session data and are not written into static catalog snapshots.

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

## Interface and import behavior

Event selection opens an anchored details preview; editing is a separate action for editable calendars. On phones, class blocks use small subject-and-number labels, and the compact details card shows a single date with its time range for same-day events. Official and subscribed events stay read-only. Mobile source cards use matching dimensions, and all seven weekday headings stay on one row. Newly generated share links attempt one automatic clipboard copy; a visible copy field remains available when the browser refuses clipboard access. Sharing lists explicit calendar/category choices and publication state.

Remote DNS pinning supports Node.js single-address and automatic-family lookup contracts. Canvas links with `#assignment_` are recognized as assignments. ICS import keeps the first supported event category (class, assignment, exam, holiday or event); unrecognized categories become event. Export retains that normalized category and HTTP(S) source links; a zero-duration deadline shows a single time rather than an identical start/end range.

## Responsive calendar details and no-class days

Official registrar all-day events explicitly marked as no classes keep their all-day heading and shade the entire corresponding day column with a pale diagonal pattern in the source color. Date-only ends remain exclusive, independent of the viewer's timezone. An office closure without a no-class flag and an ordinary personal all-day event do not gain this treatment.

Each event chooses its information density from its actual width and height. Wider/taller rectangles show the full title, exact time, location and session; narrow lanes retain the course identity and expose full details through the accessible label and detail panel. Duration rectangles preserve the time scale: minimum card heights must not create apparent conflicts between non-overlapping classes. Point events retain their separate target-size policy.

Sitewide native vertical scroll chaining is defined in `src/styles/scroll-chain.css`. Scrollable content yields to its scrollable ancestor at the real boundary, with intentional dialog boundaries retaining background isolation. Same-origin embedded documents use a shared boundary bridge because native scrolling cannot cross those document boundaries reliably. The shared utility replaces page-specific wheel/gesture interception; it cannot access cross-origin document internals.

Course-detail swipe navigation follows registered visible tabs, including syllabus. The evaluation-source selector names official OSU evaluations and RMP reviews separately and labels each source's counts rather than combining unlike metrics.

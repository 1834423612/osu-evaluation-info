# Development tools and local data

## Opening the tools

Development builds show a small **DEV** launcher below the header on the left.
Production builds hide it. Tap the frog logo in the header or footer seven times
to open it again; `Ctrl+Alt+D` also opens it. Consecutive taps must be no more than
700 ms apart. A pause resets the count; a toast appears after the third tap.
The close button hides the tools for the current tab.

Production tools require a server-side environment variable:

```dotenv
DEV_DEBUG_KEY=your-private-maintenance-key
```

Set this in the deployment environment or your untracked `.env.local`, then
restart the server. Never prefix it with `NEXT_PUBLIC_`. An empty value leaves
production tools locked. The browser submits the key to a same-origin endpoint;
the server issues a signed, HttpOnly, SameSite cookie valid for eight hours.
Requests that bypass server caches require that cookie. The key is not included
in the JavaScript bundle or diagnostic export. The unlock endpoint bounds request
size and rate-limits attempts per server instance.

## Available controls

| Control                         | Effect                                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bypass app / HTTP caches        | Ignores application result caches, requests `no-store`, and bypasses supported server result caches after authorization. In-flight deduplication, rate limits, and provider health protections remain active. |
| Factory preview                 | Reads and writes a temporary, empty profile in memory. Real favorites and preferences remain in local storage. A reload resets the preview; disabling it restores the real profile.                           |
| Repeat translation guide        | Gives the translation guide a temporary state so it can be tested repeatedly without changing its real completion flag.                                                                                       |
| Repeat language notice          | Replays the initial language suggestion after a reload.                                                                                                                                                       |
| Exclude this session from Umami | Enables Umami's opt-out marker and blocks app tracking. Turning it off restores the previous opt-out preference.                                                                                              |
| Outline layout boundaries       | Shows element boundaries to find spacing and overflow problems.                                                                                                                                               |
| Simulate failed requests        | Rejects application fetches so empty, error, and retry states can be inspected. Authentication requests remain available.                                                                                     |
| Request delay                   | Adds 0, 800, or 2,000 ms to fetches. Cancellation remains supported.                                                                                                                                          |
| Refresh data                    | Reloads the page and resets browser memory caches.                                                                                                                                                            |
| Upgrade local data              | Runs the registered local-data migrations and reports merged/removed entries.                                                                                                                                 |
| Clear derived caches            | Removes registered, rebuildable directory data; retains saved items and preferences.                                                                                                                          |
| Export saved data               | Downloads the real local profile, including while a factory preview is active. Debug session records are excluded.                                                                                            |
| Export diagnostics              | Downloads build, browser, viewport, storage key names, and recent request paths/statuses/timings. Data values, request bodies, query strings, cookies, and the maintenance key are excluded.                  |
| Restore normal mode             | Disables testing flags and reloads.                                                                                                                                                                           |

Flags are scoped to the browser tab. Some controls reload immediately so existing
components and caches cannot retain the previous test state. The tools occupy the
upper left and scroll within their panel; the translation dock remains at the
lower right. Collapse the panel when interacting with content underneath it.

Cache bypass applies to application data and HTTP fetches. Browser-managed Chrome
translation models and static asset caches remain under the browser's control.
A factory preview does not erase downloaded models.

## Automatic storage upgrades

`src/lib/preferences/storage-migrations.ts` registers the purpose and current
version of each supported storage family. Initialization checks local and session
storage once per page load:

- Merge older favorites by identity, including nested instructor/course links.
  Current scalar fields take precedence; distinct entries are retained.
- Preserve valid language, translation, and enrollment-watch preferences.
- Delete superseded directory caches and old mascot session choices. Prune invalid
  or more-than-30-day-old directory snapshots.
- Write and verify the merged destination before removing an older source.
- Preserve unknown keys, future versions, corrupt important records, and source
  records when a write fails. Other applications' data is untouched.

Add an explicit migration when a future schema changes field meanings; a version
number alone does not justify deleting user data. The registry deliberately
distinguishes important preferences/favorites from rebuildable caches.

## Course card insights and metadata

RMP previews load near the viewport, deduplicate identical requests, and batch up
to 24 courses with at most four concurrent repository lookups. The preview query
omits review comment payloads. Tags combine matched course reviews across unique
professors; recent difficulty is weighted by each professor's valid rating count.
The UI shows the sample size, the two-year window, and the nonofficial source.
Missing ratings remain unknown. Tags wrap naturally, and translation preserves
the full original and translated text.

Server-rendered titles and social metadata use English. Browser tab titles follow
the active site language and route, including after client navigation. The
version strip uses the first line of the commit subject and a short hash from
Vercel build metadata or the local Git checkout; long subjects are truncated.

## Verification

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

`tests/catalog/experience.browser.mjs` exercises 320/390/768/1440 px layouts,
original and translated RMP tags, distinct teacher/section save controls, source
badge alignment, language-aware titles and navigation, English social metadata,
and production debug authentication and profile isolation. Run it against a
production server with a disposable `DEV_DEBUG_KEY`; set `GUIDE_TEST_BASE_URL`
and `GUIDE_TEST_DEBUG_KEY` to match. It uses the same external Playwright setup as
the translation browser tests (`PLAYWRIGHT_MODULE` and, if needed,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`). API data is mocked; production debug
authentication is exercised against the real endpoint.

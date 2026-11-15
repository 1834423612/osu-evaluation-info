# Umami analytics

English · [简体中文](../zh-CN/analytics/umami.md)

## 3.5 tracking and replay

The tracker enables `data-errors="true"`, performance collection and hash exclusion. `data-release` identifies the website build and `data-environment` identifies its deployment; neither is the Umami service version. Asset URLs include `NEXT_PUBLIC_UMAMI_ASSET_VERSION` (default `3.5.0`) to bypass stale collector assets; the proxy cache key must include this parameter. React error boundaries also report through `captureException`.

When configured, replay defaults to on for every page, including accounts, favorites, history and sharing. The frontend does not override remote sampling, duration or input-masking parameters and does not stop/reload recording on entry to those pages. Browser DNT/GPC, Dev Tools analytics suppression and explicitly saved opt-outs still apply; absent and legacy unspecified replay preferences default to on. Persisted opt-outs are read before mounting collector scripts.

Share capabilities are extracted from URL fragments before collectors start. Generic events do not copy raw form values. Configure and verify input masking in Umami. The replay browser test mocks collector assets rather than sending test contents to the live analytics service.

The root layout loads Umami through `next/script` when all required public
settings are configured. Set these values before building or restarting the
application:

```dotenv
NEXT_PUBLIC_UMAMI_WEBSITE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NEXT_PUBLIC_UMAMI_TRACKER_URL=https://example.com/umami_main.js
NEXT_PUBLIC_UMAMI_RECORDER_URL=https://example.com/recorder.js
```

The recorder URL is optional. The tracker collects page views for client-side
navigation, automatic click events, Core Web Vitals, and uncaught browser
errors. Custom `ui_interaction`, `form_submit`, and `scroll_depth` events add
stable action and interface-area properties for controls, course search,
filters, tabs, favorites, settings, and scrolling. Course searches emit a
`course_search` event with a normalized `search_term` and a `search_type` of
`course_code` or `keyword`, so course popularity can be compared directly.
The before-send hook removes non-UTM query parameters from page URLs and
referrers while preserving the five standard UTM parameters. Raw form contents
are not copied into generic interaction events. The tracker respects the
browser's Do Not Track signal.

Completed first-page queries also emit `course_search_results`, including URL
searches, filter changes, suggestion choices and successful retries. Pagination,
cancelled requests and Dev Tools simulations are excluded. This is a result-load
metric, not a one-to-one conversion event for form submissions.

| Property                           | Meaning                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `status`                           | `matches`, `no_matches`, `continuation`, `filter_conflict`, or `error`                  |
| `result_count` / `total_courses`   | Courses shown on the page / known matching total (`-1` if unknown)                      |
| `complete` / `has_more`            | Candidate scan was complete / another result page is available                          |
| `search_term` / `search_type`      | Same normalized input labels as the submission event                                    |
| `match_kind`                       | Recognized course code, number, subject, or keywords                                    |
| `search_engine` / `fuzzy_results`  | Engine version and count of explicitly fuzzy results on this page                       |
| `index_fallback`                   | `none`, `unavailable`, or `filter`; separates limited live fallback from indexed search |
| `term` / `campus` / `filter_count` | Selected offering scope, without copying arbitrary filter values                        |
| `duration_ms`                      | Time to load results, rounded and capped at two minutes                                 |

Treat only `no_matches` as a confirmed empty result. `continuation` is an
unfinished search window; a network failure or conflicting filter is a different
problem. Existing submission-only history cannot retroactively provide these
outcomes. No visitor IDs, exception messages or API credentials enter this event.

Load `recorder.js` with the same website ID to collect session replays and
heatmap input. In the Umami website settings, enable Replays and Heatmaps and
choose their sample and masking settings. These server-side settings are
required in addition to loading the recorder script. UTM parameters remain in
page views for the built-in UTM report.

The `NEXT_PUBLIC_` values are embedded during the production build. Changing
them requires rebuilding and redeploying the application. Leave the settings
blank to disable analytics on a deployment.

## Read-only search audit (Umami 3.4.x)

Set `UMAMI_API_KEY` in `.env.local` using an account API key from the self-hosted
Umami settings. This server-side key must not use a `NEXT_PUBLIC_` name. The API
origin defaults to the tracker URL's origin; `UMAMI_API_BASE_URL` can override it.

```sh
node --env-file=.env.local scripts/analytics/analyze-search.mjs /tmp/osu-search-audit.json
```

The script uses authenticated GET requests, traverses all event/property pages,
and refuses capped or incomplete responses. Its report contains aggregate
activity counts and search terms, with a separate production-domain breakdown
so developer traffic does not inflate the result. It omits visitor/session IDs,
locations, referrers and credentials. Keep the generated report outside the
public repository. Search submission events alone do not establish whether a
search succeeded; result instrumentation is required to measure that outcome.
The audit reports production `resultStatuses` and `confirmedEmptyQueries` when
new result events exist. An empty status map means no measured outcomes, not
zero failed searches. Result loads and submissions should not share a denominator.

API contracts: [Umami 3.4.1 event data](https://github.com/umami-software/umami/blob/v3.4.1/src/app/api/websites/%5BwebsiteId%5D/event-data/route.ts)
and [API-key authentication](https://umami.is/blog/umami-v3.4).

## Recorder startup and replay rendering

Concurrent startup payloads wait for the first collector visit token, with a 100-payload / 30-second bound. The recorder loads after that token is available, so the SDK's short session-start window is not spent waiting for a slow initial collector response. Sampling, masking and maximum duration still come from the remote configuration.

Paused/seeked replays can freeze portal entrance animations at their first frame. A replay-only CSS rule displays open drawer, sheet, dialog, select and popover surfaces in their open layout while `html.rrweb-paused` is present. It does not change live-site or playing animations.

## Firewall checks

A successful tracker request does not prove recordings are complete. Verify the **full snapshot** request as well as smaller mutation chunks. A firewall may reject a large HTML/CSS snapshot with 403 while accepting subsequent events. Without CORS headers, the browser can report only `net::ERR_FAILED`; the dashboard may then contain mutations without a usable baseline.

On November 14, 2026, a synthetic production-build check reproduced a roughly 340 KiB full-snapshot rejection by BaoTa WAF. After an exact collector-path exception, both 1440px and 390px runs sent all chunks successfully, read their own replay back through the authenticated API, and matched live/rebuilt search inputs, term menus, details and scroll offsets. This is dated evidence for those flows, not a guarantee for every recording.

Prefer a site-specific exception for the falsely triggered body-inspection rule on `POST /api/record`. Do not disable the entire firewall or exempt every API. BaoTa URL allowlists can skip most WAF defenses, so retain endpoint rate limiting separately if a path allowlist is the only available control. See [BaoTa's WAF guide](https://www.bt.cn/bbs/thread-73847-1-1.html). Keep Umami token validation and request-size bounds. A missing snapshot cannot be reconstructed from later mutations alone; check new recordings after fixing the rule.

## Live replay regression

`tests/analytics/replay.browser.mjs` uses mocked scripts and validates defaults, all-page coverage, a six-second collector startup delay and opt-out behavior. The separate live check deliberately creates synthetic Umami traffic:

```sh
pnpm build
pnpm exec next start --hostname 127.0.0.1 --port 3001
```

Run in another terminal with the configured public tracker/website values and server-only `UMAMI_API_KEY`:

```sh
ALLOW_UMAMI_WRITES=1 REPLAY_REQUIRE_ROUND_TRIP=1 \
USER_DATA_TEST_BASE_URL=http://127.0.0.1:3001 \
node tests/analytics/replay-live.browser.mjs

ALLOW_UMAMI_WRITES=1 REPLAY_REQUIRE_ROUND_TRIP=1 REPLAY_TEST_WIDTH=390 \
USER_DATA_TEST_BASE_URL=http://127.0.0.1:3001 \
node tests/analytics/replay-live.browser.mjs
```

Catalog and other application data APIs use synthetic fixtures; first-party collectors receive no live test writes. The real Umami tracker/recorder and remote configuration are used. The check requires one visit token, accepted recording chunks, a full snapshot in the API response, and matching visible control counts, rectangles and panel scrolling. It rebuilds with pinned rrweb 2.1.7 and saves synthetic screenshots/events under `USER_DATA_SCREENSHOT_DIR` (default `.cache/replay-live`). Do not publish recordings from real profiles. These synthetic visits remain subject to Umami retention; `qa_replay_verification` marks their activity.

Use the standard `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` overrides when needed. `REPLAY_RRWEB_DIR` can name the installed rrweb package directory when the host cannot follow workspace symlinks. The API key stays in the test process and authenticated request headers; it is never injected into the browser.

# Umami analytics

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

API contracts: [Umami 3.4.1 event data](https://github.com/umami-software/umami/blob/v3.4.1/src/app/api/websites/%5BwebsiteId%5D/event-data/route.ts)
and [API-key authentication](https://umami.is/blog/umami-v3.4).

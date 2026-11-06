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

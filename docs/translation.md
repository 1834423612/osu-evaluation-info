# On-demand translation

`TranslateText` keeps the source visible until a validated translation is
available. On desktop Chrome it tries the built-in Translator API after a user
click; browsers without an available language model use `POST /api/translate`.
See the [Chrome Translator API documentation](https://developer.chrome.com/docs/ai/translator-api)
for supported platforms and language-pair availability.
The API accepts only bounded text and one of two fixed target languages. It
tries Google's `dict-chrome-ex` endpoint, then `clients5`, then the legacy
`gtx` endpoint. These Google endpoints are undocumented best-effort services;
HTTP errors, rate limits, malformed responses, empty responses, and unchanged
text are treated as unavailable. The route never forwards upstream error pages
or raw response payloads to the browser.

The button offers one-click Chinese / English translation. The target follows
the content language rather than the interface language, so an English review
still translates into Chinese when the interface is set to English. Whitespace
and paragraph breaks are preserved in the source and translated displays.

The API has per-process request-rate limits, response-size limits, in-flight
deduplication, and a bounded in-memory translation cache. Translation content
may be sent to Google only after the user requests translation in a browser
that cannot translate locally. The application does not persist translation
text in its database or browser storage.

The display preference (`bilingual` or `replace`) and automatic-translation
switch are stored locally in the browser. A preference selected on any
translation control becomes the default for other content on that page and
later visits. Automatic translation processes only snippets intersecting the
visible viewport, with at most two requests running at once. Duplicate course
previews/details share the same work and cache. A snippet leaving the viewport
before queued work starts is skipped. Failed requests are held for 30 seconds;
three consecutive failures also pause new work for 30 seconds.

Automatic mode only uses a Chrome model whose availability is already
`available`; it cannot initiate a model download. When a model is unavailable
or needs downloading, automatic requests use the server fallback. A direct
manual translation click may prepare a model, with a bounded timeout.
Settings render through a collision-aware Radix portal, so card and review
scroll containers do not crop them. A failed translation leaves the original
text unchanged and displays a concise unavailable message.

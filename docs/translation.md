# On-demand translation

Translation runs inside the existing Next.js server when a user requests it.
There is no additional process, polling job, or background health checker.
`src/lib/translation` separates the shared contract, browser adapter, server
provider adapters, scheduler, HTTP validation, and usage aggregation.
For database state, recovery, audits, and management commands, start with the
[translation operations guide](translation-operations.md).

The flow is:

```text
TranslateText → Chrome Translator API when available (highest priority)
              → one NAS lane: POST /api/translate
                  → bounded memory cache / shared in-flight work
                  → NAS Ollama
              → parallel overflow lanes: browser-direct Google
                  → dict-chrome-ex → clients5 → gtx, according to device health
              ← browser validates and normalizes the Google result
```

## First-use reading guide

Non-English interfaces show one small coachmark beside a visible translation
button. A successful manual translation advances the guide to the adjacent
settings control; failed or automatic translations do not advance it. If the
translated text pushes that control off a phone's screen, the guide gently
scrolls it into view. The settings menu briefly explains automatic translation,
bilingual versus in-place display, and model selection using the real controls.

The first appearance waits for initial scrolling to settle. Once visible, the
card stays mounted and follows the same control; when that control leaves the
viewport, the card docks at the screen edge with a button to return to it.
Scrolling never changes or completes a step. Guided settings remain open while
changing preferences. Outside taps, Escape, closing details, and rapid toggles
preserve progress and return to the settings step. Only an explicit “知道了” or
“跳过” completes the guide; exit controls ignore carried and repeated clicks
during their first 350 ms.

Progress is stored under `course-atlas:translation-guide:v1`: `settings` resumes
after a successful translation, and `done` suppresses future prompts after
completion or skipping. Tabs synchronize progress; blocked storage falls back
to the current session. The guide follows visible controls inside course sheets
and drawers, supports Escape and keyboard navigation, and respects reduced
motion. It does not change translation preferences on the user's behalf.

With Playwright available, run the browser regression check against a running
development server:

```sh
GUIDE_TEST_BASE_URL=http://localhost:3000 node tests/translation/onboarding.browser.mjs
```

`PLAYWRIGHT_MODULE` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` optionally select an
existing Playwright installation and Chromium binary. The check uses controlled
catalog and translation responses, samples animation frames during repeated
scrolling, and exercises rapid clicks, outside taps, settings, sheets, and drawers.

## Configure the NAS node

Set these server-only values in `.env.local` or the server's environment, then
restart Next.js:

```ini
KJCH_AI_SERVICES_API_URL=https://ai-services.kjch.net
KJCH_AI_SERVICES_CF_CLIENT_ID=your-client-id
KJCH_AI_SERVICES_CF_CLIENT_SECRET=your-client-secret
KJCH_AI_SERVICES_MODEL=HY-MT1.5-1.8B-GGUF:Q4_K_M
```

The URL may also include `/api/generate`; the adapter will not append the path
twice. Use the model name actually registered in Ollama, rather than its GGUF
filename. If the repaired model is registered as `hy-mt-fixed:latest`, set
`KJCH_AI_SERVICES_MODEL=hy-mt-fixed:latest` instead.

The server adds `CF-Access-Client-Id` and `CF-Access-Client-Secret` only to the NAS
request. No model URLs, credentials, or upstream payloads are returned to the
browser. Both credentials may be omitted for a private endpoint without Access;
configuring just one disables the NAS adapter. Missing or malformed URLs also
skip NAS. Cloudflare-protected endpoints require both real credentials.
See [Cloudflare's service token headers](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).

A 302 redirect to a Cloudflare Access login page is an authentication problem,
not model overload. Verify that the Access application has a Service Auth policy
permitting the configured, valid service token. Following that redirect can
produce an HTTP 200 HTML login page; this is not a successful translation.
The NAS adapter rejects redirects and never forwards credentials to a login URL.

Requests use [Ollama's generate API](https://docs.ollama.com/api/generate):

```json
{
  "model": "HY-MT1.5-1.8B-GGUF:Q4_K_M",
  "prompt": "将以下文本翻译为英文，注意只需要输出翻译后的结果，不要额外解释：\n\n这位教授讲得很清楚。",
  "stream": false,
  "keep_alive": "10m",
  "options": { "temperature": 0.2, "num_predict": 2048 }
}
```

The target in the prompt is `英文` or `简体中文`. The existing content-language
heuristic chooses English for Chinese text and Chinese for English text,
independently of the site's interface language. Currently `en` and `zh-CN` are
the supported targets; the API also normalizes the alias `zh` to `zh-CN`.
Ollama results must contain a string `response` and `done: true`; output stopped
with `done_reason: "length"` is discarded so a truncated translation can fall
back to another provider.

## Availability and load decisions

NAS health is an explicit state machine persisted in PostgreSQL, with separate
node configuration, current state, inference attempts/leases, and transition
history. The first request, a stale health observation, or an elapsed cooldown
admits one recovery probe. Success returns the node to healthy and clears the
consecutive-failure streak; old failure history stays historical. Cooldowns are
finite, capped at five minutes. Expired leases are reclaimed and late results
from an expired or obsolete generation are ignored. Only an explicit operator
`disable` can keep a configured node disabled indefinitely.

Use `pnpm translation:status` or `osu_translation.v_provider_status` to distinguish
`ready`, `busy`, `waiting_retry`, and `ready_to_probe`. A raw historical `failure`
counter does not determine availability. The full state definitions, policy
limits, and retry/enable/disable/probe commands are in the
[operations guide](translation-operations.md).

The database coordinates server concurrency and recovery probes across Node
processes. Inference runs outside database transactions. If a configured database
is unavailable, NAS admission temporarily stops while the browser can still use
Google. Installations without a database use the same state machine in memory.
Translation-result caches and per-client HTTP rate limits remain process-local:
32 unique pending translations, 512 cached NAS translations, 2048 rate keys,
and 30 snippets per client per minute. Cache hits are not health probes.

Manual **kjch ai service** requests use a FIFO queue rather than treating a busy
slot as failure. The browser sends one NAS item at a time. Each server process
also queues manual work (32 waiting entries, 30-second waiting deadline); only
the queue head polls for a database-coordinated permit while another worker
owns the slot. Queue expiry and overflow do not record a provider failure.
Database leases still enforce the configured concurrency across all processes.
Queues are in memory and exist only while handling requests; no extra service
or continuous availability checker runs.

A successful but slow node remains eligible for serialized manual work after
its previous inference finishes. Auto still diverts from it during its slow
cooldown. Actual failure cooldowns, disabled nodes, and unconfigured nodes are
respected in both modes. Manual requests do not fall back to Google.

After local translation fails, Auto reserves at most one NAS lane per device
and sends overflow to three browser Google lanes immediately. These results
are displayed independently while NAS is still running. Google endpoint health
and concurrency limits stay independent, and a later request can use NAS again
once its lane is free. If every Google endpoint is unavailable, overflow can
join the NAS queue instead of failing merely because NAS is busy.

Google is called **only by the user's browser**, using that device's network
connection and public egress IP. The website server never proxies Google text
or results. The API supplies fixed public endpoint metadata and the browser
validates it against its own allowlist. Requests use `mode: "cors"`,
`credentials: "omit"`, and `referrerPolicy: "no-referrer"`; NAS Access credentials
never leave the server. See [Fetch CORS and credentials](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch).

Each browser uses the same explicit state machine for its own Google nodes,
with independent leases, 2.5-second attempt deadlines, and finite cooldowns.
HTTP 429 respects an exposed `Retry-After`, capped at 60 seconds. Transient
failures start with five-second cooling and back off to at most 40 seconds.
The next eligible request probes again. One user's failure cannot disable
another user's node. Anonymous, sequenced browser state reports are for
observation only and cannot change server routing.

Google endpoints remain undocumented best-effort services; CORS and availability
may change. A CSP with `connect-src` must allow `https://translate.googleapis.com`
and `https://clients5.google.com`. API network errors, 429/503, and invalid API
responses still permit browser-direct fallback. After all candidates fail, the
original text remains visible and a bounded retry hint controls the next attempt.

## HTTP contract

The website sends NAS-bound snippets individually inside the batch contract so
one slow NAS response cannot hold up other providers. The API also accepts
batches from other callers. Each HTTP batch has at most eight items and 12,000
input characters; each item has a unique ID, at most 4,000 characters, and a
supported target. Request bodies are capped at 48 KiB with a three-second read
deadline. Upstream responses are capped at 64 KiB and each translation at 8,000
characters. The browser bounds the full normalized response to 256 KiB and
waits at most 20 seconds for an Auto request, or 51 seconds for a manual NAS
request (30 seconds waiting, at most 16 seconds inference, and transport margin).
The optional top-level `mode` is `auto` (default, fail-fast on busy NAS) or
`ollama` (bounded queued admission). Unknown modes return 400. A manual batch
queues its items independently without asking Ollama to infer them concurrently.

```http
POST /api/translate
Content-Type: application/json

{"items":[{"id":"review-1","text":"The professor explains things clearly.","target":"zh-CN"}]}
```

```json
{
  "version": 1,
  "results": [
    {
      "id": "review-1",
      "target": "zh-CN",
      "status": "translated",
      "translation": "这位教授讲解得很清楚。",
      "provider": "ollama",
      "cache": "miss",
      "durationMs": 800
    }
  ]
}
```

This is a contract example, not a measurement of the NAS. Server `provider` is
`ollama`; `cache` is `miss`, `hit`, or `shared`. The batch also contains
`browserFallback: [{ "id": "dict-chrome-ex", "endpoint": "https://translate.googleapis.com/translate_a/t" }, ...]`
listing all three fixed Google endpoints. An unavailable NAS item contains
`id`, `target`, `status: "unavailable"`, `durationMs`, and `retryAfterMs`.
The browser fetches Google itself for these items and returns the same normalized
success shape locally, with the corresponding Google `provider`. It never uploads
the Google translation to the website. Batch HTTP status remains 200 for
partial or complete item failures so each item's outcome is usable. Invalid
requests return 400, rate limits 429 with `Retry-After: 60`, and unexpected service
failures 503. All responses use `Cache-Control: no-store`; translation caching
is managed inside the application.

The legacy `{ "text": "Hello", "target": "zh-CN" }` request remains supported.
It returns one normalized result, including the existing `translation` field,
or a generic 503 error with the public fallback metadata. Legacy API callers
must follow that metadata on their own devices; no server Google proxy exists.
Texts are translated separately upstream, preserving item boundaries rather than asking the model to reconstruct a batch JSON schema.

## Chrome and display behavior

The settings menu includes a **Translation model** submenu. **Auto** is the
default and follows the local → NAS → Google order above. Users can instead
select **On-device**, **kjch ai service**, or **Google Translate**. This preference
is stored locally and shared by translation controls on the page, independently
of the automatic-translation switch and bilingual/replace display mode.
Manual choices use only the selected service; Google still tries its three
browser-direct endpoints. An unavailable manual choice preserves the original
and suggests Auto. Manual choices retain capacity limits and failure cooldowns;
a slow successful NAS can continue serialized manual work. They do not override
an operator-disabled NAS node.

Changing a model refreshes the currently displayed translation. Browser caches
and pending work include the model choice in their keys, so results from another
selection cannot satisfy the new request. Late results from a previous selection
cannot overwrite the current content or provider badge.

In Auto or On-device mode, `TranslateText` tries the [Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api).
Feature and language-pair detection determine availability. The model list
disables On-device while probing and when the API or language pair is unavailable,
with a short desktop Chrome 138+ requirement. A saved On-device preference on an
unsupported device falls back to Auto for the current environment.

Translation only creates sessions for models reported as `available`. Neither
manual nor automatic requests in Auto download missing models. Explicitly
selecting On-device with a missing model opens a confirmation before any
`Translator.create()` call. Only “Download and enable” initiates preparation,
directly within that user gesture. Cancelling preserves the previous selection;
failed downloads can be retried explicitly. Confirmation is required again if a
previously downloaded model is removed. Shared requests use a single dialog.

Chrome does not expose a reliable model size before downloading. The dialog
states that limitation and shows real byte totals only when provided. Normalized
`downloadprogress` events (`total: 1`) are percentages, never a one-byte model.
Downloads have a three-minute deadline and support cancellation; ready-model
translations retain a 12-second deadline. Rejected, timed-out, or invalid local
output proceeds to the server batch only in Auto.

With Playwright available, `node tests/translation/local-model.browser.mjs`
checks compatibility, consent, cancellation, progress, retry, ready models,
automatic fallback, and nested course dialogs using controlled browser API
responses. It accepts the same environment overrides as the onboarding check.

The source stays visible until a validated translation arrives. Translation
failure leaves it intact and displays the existing unavailable message.
Whitespace and paragraphs are preserved. The `bilingual` / `replace` preference
and automatic switch remain device-local. Automatic translation only processes
visible snippets, with at most four running at once; duplicate previews/details
share work. Queued snippets show a waiting label. Queued work is skipped only
when every consumer has left, changed models, or disabled automatic translation;
a manual detail request keeps shared work alive while its preview scrolls away.
Successful browser scheduler entries expire after 30 seconds, allowing later
requests to reconsider a recovered NAS rather than pinning Google forever.
Failed snippets use the bounded retry hint, with no global scheduler circuit
that blocks unrelated snippets. Manual clicks can retry a failed snippet
immediately. Consecutive automatic failures back off from five seconds to five
minutes, respecting longer provider retry hints. Success or a changed snippet
key resets the backoff. Visibility changes preserve the remaining wait; disabling
automatic mode or unmounting cancels the timer. Chrome-only mode does not retry
automatically when the browser has no Translator API. No independent health-polling
process is started. The settings popover continues to use its Radix portal.

## State and statistics management

```sh
pnpm db:translation:init
pnpm translation:status
pnpm translation:manage history ollama
pnpm translation:manage attempts ollama
pnpm translation:manage retry ollama
pnpm translation:manage probe ollama
pnpm translation:manage sync-config ollama
```

Inspection commands do not register the shell's environment configuration.
`sync-config` explicitly replaces the NAS configuration fingerprint; a probe
requires matching configuration and never replaces it implicitly. Provider resets
fence old outcomes while keeping their leases occupied until inference settles
or expires, including in the status view. Concurrent successes cannot clear a
newer failure's cooldown; an eligible recovery probe must clear it.

Setup is additive and idempotent. Existing `daily_usage` rows remain historical;
new counters are written to `usage_daily` with an explicit `server`,
`browser_reported`, or `application` source. Unified views label old data
`legacy_unknown` rather than guessing whether past Google calls came from
servers or browsers. Use `v_daily_attempts` for actual reported attempts and
`v_daily_routing` for cache/shared/busy/cooldown/unavailable decisions.

Current NAS state lives in `provider_state`, actual calls and expiring leases in
`provider_attempts`, and state-change audit events in `provider_transitions`.
`browser_provider_state` contains only each anonymous page session's latest
Google health report. Its monotonically increasing sequence rejects duplicate
or out-of-order reports. It never drives NAS or other users' Google state.

No text, prompts, translations, URLs, credentials, IPs, or accounts are stored.
The usage endpoint accepts at most 32 metadata events and 32 KiB per request,
with a 120-events-per-client-per-minute limit. Server state remains necessary
when `TRANSLATION_USAGE_ENABLED=false`; that switch disables only historical
summary counters. Request-driven maintenance keeps 30 days of attempt details,
90 days of transitions/counters, and one day of anonymous browser observations.
No separate process or health-polling job is required.

See the [operations guide](translation-operations.md) for the schema map, state
transitions, operator commands, configuration ownership, and common SQL queries.
Summary counters are best-effort observations; current state and leases are
transactional controls, not reconstructed from those counters.

```sh
node --test --test-isolation=none tests/translation/*.test.mjs
TRANSLATION_DATABASE_TEST=1 node --env-file-if-exists=.env.local --test --test-isolation=none tests/translation/provider-state.integration.test.mjs tests/translation/translation-usage.integration.test.mjs
```

The database tests use isolated schemas and clean them up or roll back.
They verify shared admission, recovery after a crashed worker, generation fencing,
policy persistence, browser isolation and ordering, and legacy-data preservation.
An authenticated NAS probe additionally requires valid Access credentials and
the exact model name registered in your running Ollama installation.

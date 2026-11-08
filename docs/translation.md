# On-demand translation

Translation runs inside the existing Next.js server when a user requests it.
There is no additional process, polling job, or background health checker.
`src/lib/translation` separates the shared contract, browser adapter, server
provider adapters, scheduler, HTTP validation, and usage aggregation.

The flow is:

```text
TranslateText → Chrome Translator API when available
              → batch POST /api/translate
                  → bounded memory cache / shared in-flight work
                  → NAS Ollama
              ← NAS result or public Google endpoint metadata, matched by ID
              → browser directly fetches Google dict-chrome-ex → clients5 → gtx
              ← browser validates and normalizes the Google result
```

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

Availability is learned from real translation requests. The server considers
configuration, reserved concurrent requests, the age of active requests, recent
latency, timeouts, and consecutive failures. It checks these before each attempt.
There are no speculative model generations or extra health requests.

| Setting                            | Default | Accepted range | Effect                                                                       |
| ---------------------------------- | ------- | -------------- | ---------------------------------------------------------------------------- |
| `KJCH_AI_SERVICES_TIMEOUT_MS`      | 6000    | 500–8000       | Abort NAS and return browser fallback metadata                               |
| `KJCH_AI_SERVICES_SLOW_MS`         | 2500    | 250–8000       | Divert new requests while an active attempt is slow, or after a slow success |
| `KJCH_AI_SERVICES_MAX_CONCURRENCY` | 1       | 1–8            | Return browser fallback metadata for overflow                                |
| `KJCH_AI_SERVICES_COOLDOWN_MS`     | 30000   | 1000–300000    | Pause attempts after a timeout, two consecutive failures, or a slow success  |

Invalid numeric settings use their defaults. After a cooldown, one real request
probes the node. A fast success restores normal routing; another slow result or
failure keeps it in cooldown. The request that receives a slow but valid result
can use it; subsequent requests divert. A still-running attempt retains its
concurrency permit while draining, until it settles or its original timeout plus
one cooldown expires. The next request reclaims an orphaned permit and admits
one recovery probe; an upstream that ignores abort cannot block NAS forever.
Failed translations are never cached on the server. Database failure counters
are historical measurements, never a persistent provider blacklist.

Google is called **only by the user's browser**, using that device's network
connection and public egress IP. The website server never requests Google or
proxies its translation payloads. The API returns the fixed public endpoint list;
the browser only accepts endpoints matching its built-in allowlist. It adds the
text and language parameters locally and uses `mode: "cors"`,
`credentials: "omit"`, and `referrerPolicy: "no-referrer"`. NAS Access headers
never reach Google. See [Fetch's CORS and credential behavior](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch).

Each Google provider has a 2.5-second timeout and independent browser-local
cooldown. Network, CORS, HTTP, malformed, empty, unchanged, oversized, or
wrong-language results fall through to the next endpoint. Transient failures
start at five seconds and back off to at most 40 seconds; HTTP 429 also respects
an exposed `Retry-After` header, capped at 60 seconds (30 seconds when absent).
After the interval, one request probes that provider again. Failure on one
device or one Google endpoint cannot disable NAS or other users' providers.
These are undocumented best-effort services; CORS and availability may change.
A site's CSP must permit `connect-src` to `https://translate.googleapis.com` and
`https://clients5.google.com` if it defines this policy.

An API network error, 429, 503, or unusable response also allows the browser to
attempt Google directly. The browser never sends those requests back through a
website proxy. After every provider fails, the source remains visible and the
error includes a bounded retry hint. A later request always considers NAS first.

State is shared per Node process, including development reloads: at most 32
unique pending translations, 512 cached translations, and 2048 rate-limit keys.
Only successful NAS translations are cached on the server, for seven days.
Duplicate texts with the same target share inference. Each trusted client address is limited to 30 snippets
per minute; batching does not multiply this allowance. Deployment proxies must
overwrite forwarded client-IP headers. With multiple server replicas, caches,
permits, and rate limits are independent per replica; start with one process or
size NAS concurrency for the total replica count. The limits do not inspect
Ollama traffic from other applications. Google permits and cooldowns live only
in the browser, so they never share a server egress quota.

## HTTP contract

The website batches only snippets that could not translate locally, waiting up
to 25 ms to combine work. Each HTTP batch has at most eight items and 12,000
input characters; each item has a unique ID, at most 4,000 characters, and a
supported target. Request bodies are capped at 48 KiB with a three-second read
deadline. Upstream responses are capped at 64 KiB and each translation at 8,000
characters. The browser bounds the full normalized response to 256 KiB and
waits at most 20 seconds for a server batch.

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

`TranslateText` first tries the [Chrome Translator API](https://developer.chrome.com/docs/ai/translator-api).
Feature and language-pair detection, rather than the browser's name, determine
availability. Automatic mode only uses a model reported as `available`, so it
cannot initiate a download. A direct manual click may prepare a model while
user activation is present. Local attempts have a 12-second deadline; rejected,
timed-out, or invalid local output proceeds to the server batch.

The source stays visible until a validated translation arrives. Translation
failure leaves it intact and displays the existing unavailable message.
Whitespace and paragraphs are preserved. The `bilingual` / `replace` preference
and automatic switch remain device-local. Automatic translation only processes
visible snippets, with at most two running at once; duplicate previews/details
share work. Leaving the viewport before queued work starts skips that work.
Successful browser scheduler entries expire after 30 seconds, allowing later
requests to reconsider a recovered NAS rather than pinning Google forever.
Failed snippets use the bounded retry hint, with no global scheduler circuit
that blocks unrelated snippets. Manual clicks can retry a failed snippet
immediately. In automatic mode, a failed visible snippet retries after at least
five seconds; disabling automatic mode, leaving the viewport, or unmounting the
snippet cancels this retry. No independent health-polling process is started. The settings popover continues to use its Radix portal.

## Lightweight usage statistics

Install the additive table in the existing database:

```sh
pnpm db:translation:init
```

`osu_translation.daily_usage` aggregates UTC day, fixed provider, target, and
outcome. Each row holds request count, input-character count, total duration,
and maximum duration. There is no translation text, prompt, IP, user ID, model
output, URL, raw error, or per-request row in the table. Local Chrome translations
are not reported to the server, keeping their text and activity local. Browser
Google attempts report only the five numeric/enum fields through
`POST /api/translate/usage`, in batches of at most 32 counters and at most 120
counters per client per minute. The endpoint rejects text, URLs, model names,
unknown fields, and forged NAS events. Its body is capped at 8 KiB. Reports are
best-effort and untrusted: they are aggregated for analysis but never affect
routing health. No new database migration is needed for browser reports.

Outcomes `success`, `failure`, and `timeout` count actual upstream attempts.
`busy` and `circuit` count routing skips. Provider `gateway` records cache hits,
shared in-flight results, and unavailable requests. These counters measure
different stages and should not be summed as unique website translation clicks.

Statistics accumulate in at most 512 in-memory buckets. Next.js `after()` flushes
them after a response, at most once every 30 seconds when requests arrive.
Database failures are swallowed and retained aggregates are retried on later
requests. No database connection is required to translate. Set
`TRANSLATION_USAGE_ENABLED=false` to disable statistics.

A request-driven cleanup runs at most once an hour and keeps 90 UTC days.
After cleanup, the fixed dimensions allow at most 7,200 rows; the interval before
cleanup can temporarily retain an additional day. No requests means no writes
or growth. Aggregates are best-effort operational measurements: buffered data
can be lost on process restart or serverless suspension, so these are not billing
records. PostgreSQL's normal autovacuum handles space from expired rows.

Example analysis:

```sql
SELECT day, provider,
       sum(requests) FILTER (WHERE outcome IN ('success', 'failure', 'timeout')) AS attempts,
       sum(requests) FILTER (WHERE outcome = 'success') AS successes,
       sum(requests) FILTER (WHERE outcome = 'timeout') AS timeouts,
       round(sum(total_duration_ms) FILTER (WHERE outcome IN ('success', 'failure', 'timeout'))::numeric
         / nullif(sum(requests) FILTER (WHERE outcome IN ('success', 'failure', 'timeout')), 0), 1) AS avg_ms
FROM osu_translation.daily_usage
WHERE provider <> 'gateway'
GROUP BY day, provider
ORDER BY day DESC, provider;
```

Run focused checks with:

```sh
node --test --test-isolation=none tests/translation/*.test.mjs
TRANSLATION_DATABASE_TEST=1 node --env-file-if-exists=.env.local --test --test-isolation=none tests/translation/translation-usage.integration.test.mjs
```

The database test creates an isolated schema in a transaction and rolls it back.
Deterministic transport tests exercise browser batching → HTTP validation →
NAS routing → browser-direct Google fallback → normalized results without sending content to real services.
An authenticated NAS smoke test additionally requires the real Access credentials
and the model name from your running Ollama installation.

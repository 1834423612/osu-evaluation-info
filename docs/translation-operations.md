# Translation provider state and operations

English · [简体中文](zh-CN/translation-operations.md)

Use `pnpm translation:status` or `osu_translation.v_provider_status`. Historical failures, current health and current admission are separate fields. Google runs directly in each browser; the website server calls only Ollama.

## Data responsibilities

| Table                    | Purpose                                                             | Routing authority                                                     |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `provider_nodes`         | Execution location, enablement, timeout, concurrency and cooldown   | Server configuration; browser rows describe client configuration only |
| `provider_state`         | NAS health, failure streak, retry time, last results and generation | Shared current state                                                  |
| `provider_attempts`      | NAS calls, probes, results, timing and leases                       | Live leases enforce concurrency                                       |
| `provider_transitions`   | State changes, reasons and operator provenance                      | Audit only                                                            |
| `browser_provider_state` | Latest anonymous page-session reports                               | Observation only, never controls NAS/other users                      |
| `usage_daily`            | Aggregates with server/browser/scheduler provenance                 | Not health state                                                      |
| `daily_usage`            | Legacy aggregates labelled `legacy_unknown`                         | Retained, no new writes                                               |

These tables contain no source text, translations, prompts, IPs, accounts, model URLs or Access credentials. Configuration uses irreversible fingerprints; CLI output conceals them and credentials.

## Health and admission

| Health         | Meaning and next action                                                     |
| -------------- | --------------------------------------------------------------------------- |
| `unconfigured` | Supply URL/model/credentials, then restart or explicitly sync configuration |
| `disabled`     | Operator-disabled; only `enable` restores it                                |
| `unknown`      | Admit one verification request                                              |
| `healthy`      | Use configured concurrency                                                  |
| `degraded`     | Slow response or first ordinary failure; temporarily divert, then probe     |
| `cooldown`     | Wait until `next_retry_at`, then permit one probe                           |
| `recovering`   | One probe is running; other work diverts                                    |
| `per_device`   | Google has independent browser state                                        |

Normal NAS path: `unknown → recovering → healthy`. Failed probes enter cooldown and remain retryable indefinitely; backoff caps at five minutes. Successful probes reset the failure streak and wait, but retain historical failure fields. Health older than five minutes requires a new single verification. Cache hits are not probes.

`availability` describes what can happen now: `ready`, `ready_to_probe`, `waiting_retry`, `busy`, `disabled`, `unconfigured` or `per_device`. An expired raw cooldown row can correctly show `ready_to_probe` without a background write. Times are stored and reported in UTC.

## Commands

Initialization is additive and preserves prior state/statistics:

```sh
pnpm db:translation:init
pnpm translation:status
pnpm translation:status --json
pnpm translation:manage attempts ollama
pnpm translation:manage history ollama
pnpm translation:manage retry ollama
pnpm translation:manage probe ollama
pnpm translation:manage sync-config ollama
pnpm translation:manage disable ollama
pnpm translation:manage enable ollama
pnpm translation:manage configure ollama --timeout-ms 6000 --slow-ms 2500 --cooldown-ms 30000 --concurrency 1
```

`attempts` shows the latest 30 calls; `history` shows transitions. `retry` removes current waiting without deleting history. `probe` performs one actual recovery call, not a daemon. `sync-config` explicitly registers the current shell's URL/model/credential fingerprint. Restart every website process afterward.

Configuration bounds: timeout 500–8000 ms, slow threshold 250–8000 ms, base cooldown 1000–300000 ms, concurrency 1–8. Start with concurrency 1. URL, model and credentials remain environment-managed; scheduling settings are database-managed after initial registration and survive restarts.

Read-only commands never register shell configuration. Neither do `retry`, `enable`, `disable` or `configure`. Probes require a matching configuration fingerprint. A shell without NAS credentials can safely inspect status.

Configuration, enablement and retry changes advance `generation`, cancel old admission and record provenance. Late old-generation results cannot replace new state or cache. Old-configuration workers are rejected until restarted. Started calls keep their slots until completion or lease expiry; `draining_requests` counts them. A late concurrent success cannot erase a newer failure cooldown.

There is no global Google failure/retry/disable switch. Each browser has independent probes and cooldown. Anonymous page-session reports have increasing sequence numbers; stale reports cannot replace newer state.

## Views

```sql
SELECT provider,execution,health,reason,availability,active_requests,
       consecutive_failures,next_retry_at,last_success_at,last_failure_kind
FROM osu_translation.v_provider_status ORDER BY priority;
SELECT * FROM osu_translation.v_daily_routing ORDER BY day DESC;
```

Google observations cover the last 30 minutes. A routing decision of `circuit` means a provider was skipped for cooldown, disablement or missing configuration. Browser reports are not a global availability measurement.

## Expiry and failures

PostgreSQL short transactions and row locks allocate NAS slots; no transaction stays open during inference. Leases coordinate workers and one recovery probe. Expired leases are reclaimed and recorded as `expired`, preventing permanent `recovering` state after a crash.

If a configured database is unavailable, NAS admission pauses while browsers continue Google. Installations without a database use the same process-local state machine. There is no polling daemon; new translation requests or an explicit `probe` trigger recovery.

Maintenance retains call detail for 30 days, transitions/aggregates for 90 days and anonymous browser reports for one day. `TRANSLATION_USAGE_ENABLED=false` disables historical counters, not necessary state/audit.

Failure kinds include `auth`, `rate_limit`, `network`, `http`, `invalid_response`, `timeout` and `lease_expired`. Authentication errors still require corrected configuration; recovery never bypasses authorization.

| Environment variable                | HTTP header               |
| ----------------------------------- | ------------------------- |
| `KJCH_AI_SERVICES_CF_CLIENT_ID`     | `CF-Access-Client-Id`     |
| `KJCH_AI_SERVICES_CF_CLIENT_SECRET` | `CF-Access-Client-Secret` |

After Access permits a request, a Tunnel 502 saying `Unable to reach the origin service` points to cloudflared-to-Ollama connectivity. Tunnel health proves connector connectivity to Cloudflare, not access to Ollama. With origin `http://localhost:11434`, each connector's runtime must reach that address; Docker bridge localhost refers to its own container.

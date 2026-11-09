import type { Pool } from "pg";
import type { TranslationObservation } from "./gateway.ts";

/** Browser reports are observations only; no query here can mutate provider_state. */
export async function saveBrowserProviderStates(
  pool: Pick<Pool, "query">,
  events: TranslationObservation[],
  schema = "osu_translation",
) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema))
    throw Error("Invalid translation schema.");
  const rows = events.flatMap((event) =>
    event.browser
      ? [
          {
            session: event.browser.sessionId,
            provider: event.provider,
            sequence: event.browser.sequence,
            phase: event.browser.phase,
            reason: event.browser.reason,
            failures: event.browser.consecutiveFailures,
            retry: event.browser.retryAfterMs,
            outcome: event.outcome,
          },
        ]
      : [],
  );
  if (!rows.length) return;
  await pool.query(
    `WITH reports AS (
      SELECT *, bool_or(outcome='success') OVER (PARTITION BY session,provider) AS had_success,
             bool_or(outcome IN ('failure','timeout')) OVER (PARTITION BY session,provider) AS had_failure,
             row_number() OVER (PARTITION BY session,provider ORDER BY sequence DESC) AS rank
      FROM jsonb_to_recordset($1::jsonb) AS x(session uuid,provider text,sequence bigint,phase text,reason text,failures integer,retry integer,outcome text)
    )
    INSERT INTO ${schema}.browser_provider_state AS current
      (session_id,provider_id,sequence,phase,reason,consecutive_failures,next_retry_at,last_success_at,last_failure_at,observed_at)
    SELECT session,provider,sequence,phase,reason,failures,
           CASE WHEN retry > 0 THEN clock_timestamp()+retry*interval '1 millisecond' END,
           CASE WHEN had_success THEN clock_timestamp() END,
           CASE WHEN had_failure THEN clock_timestamp() END,clock_timestamp()
    FROM reports WHERE rank=1
    ON CONFLICT(session_id,provider_id) DO UPDATE SET
      sequence=EXCLUDED.sequence,phase=EXCLUDED.phase,reason=EXCLUDED.reason,
      consecutive_failures=EXCLUDED.consecutive_failures,next_retry_at=EXCLUDED.next_retry_at,
      last_success_at=coalesce(EXCLUDED.last_success_at,current.last_success_at),
      last_failure_at=coalesce(EXCLUDED.last_failure_at,current.last_failure_at),observed_at=EXCLUDED.observed_at
    WHERE EXCLUDED.sequence > current.sequence`,
    [JSON.stringify(rows)],
  );
}

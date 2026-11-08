import { Pool } from "pg";
import type { TranslationObservation } from "./gateway.ts";

type UsageBucket = TranslationObservation & {
  day: string;
  count: number;
  maxDurationMs: number;
};
type UsageWriter = (buckets: UsageBucket[]) => Promise<void>;

/** Fixed dimensions, bounded memory, no text, user identifiers, IPs or error payloads. */
export function createTranslationUsage(write: UsageWriter, now = Date.now) {
  const buckets = new Map<string, UsageBucket>();
  let lastFlush = -Infinity;
  let flushing: Promise<void> | null = null;
  function observe(event: TranslationObservation) {
    const day = new Date(now()).toISOString().slice(0, 10);
    const key = `${day}:${event.provider}:${event.target}:${event.outcome}`;
    const current = buckets.get(key);
    const durationMs = Math.min(
      60_000,
      Math.max(0, Math.round(event.durationMs)),
    );
    const characters = Math.min(
      4000,
      Math.max(0, Math.round(event.characters)),
    );
    if (current) {
      current.count++;
      current.characters += characters;
      current.durationMs += durationMs;
      current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    } else {
      buckets.set(key, {
        ...event,
        day,
        count: 1,
        characters,
        durationMs,
        maxDurationMs: durationMs,
      });
    }
    while (buckets.size > 512) buckets.delete(buckets.keys().next().value!);
  }
  function flush(force = false): Promise<void> {
    if (flushing) return flushing;
    if (!buckets.size || (!force && now() - lastFlush < 30_000))
      return Promise.resolve();
    lastFlush = now();
    const batch = [...buckets.entries()];
    buckets.clear();
    flushing = Promise.resolve()
      .then(() => write(batch.map(([, bucket]) => bucket)))
      .catch(() => {
        // A database outage cannot break translation or cause an unbounded retry queue.
        for (const [key, bucket] of batch) {
          const newer = buckets.get(key);
          if (newer) {
            newer.count += bucket.count;
            newer.characters += bucket.characters;
            newer.durationMs += bucket.durationMs;
            newer.maxDurationMs = Math.max(
              newer.maxDurationMs,
              bucket.maxDurationMs,
            );
          } else buckets.set(key, bucket);
        }
        while (buckets.size > 512) buckets.delete(buckets.keys().next().value!);
      })
      .finally(() => {
        flushing = null;
      });
    return flushing;
  }
  return { observe, flush };
}

export const UPSERT_TRANSLATION_USAGE_SQL = `
  INSERT INTO osu_translation.daily_usage
    (day, provider, target, outcome, requests, input_characters, total_duration_ms, max_duration_ms)
  SELECT day::date, provider, target, outcome, count, characters, "durationMs", "maxDurationMs"
  FROM jsonb_to_recordset($1::jsonb) AS x(
    day text, provider text, target text, outcome text, count bigint,
    characters bigint, "durationMs" bigint, "maxDurationMs" integer)
  WHERE day::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 89
  ON CONFLICT (day, provider, target, outcome) DO UPDATE SET
    requests = osu_translation.daily_usage.requests + EXCLUDED.requests,
    input_characters = osu_translation.daily_usage.input_characters + EXCLUDED.input_characters,
    total_duration_ms = osu_translation.daily_usage.total_duration_ms + EXCLUDED.total_duration_ms,
    max_duration_ms = GREATEST(osu_translation.daily_usage.max_duration_ms, EXCLUDED.max_duration_ms)`;

export function createDatabaseTranslationUsage(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString || environment.TRANSLATION_USAGE_ENABLED === "false")
    return {
      observe: () => undefined,
      flush: async () => undefined,
    };
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 1000,
    idleTimeoutMillis: 10000,
    statement_timeout: 1500,
    application_name: "osu-translation-usage",
    allowExitOnIdle: true,
  });
  pool.on("error", () => undefined);
  let lastPrune = -Infinity;
  return createTranslationUsage(async (buckets) => {
    if (Date.now() - lastPrune > 60 * 60 * 1000) {
      await pool.query(
        "DELETE FROM osu_translation.daily_usage WHERE day < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 89",
      );
      lastPrune = Date.now();
    }
    await pool.query(UPSERT_TRANSLATION_USAGE_SQL, [JSON.stringify(buckets)]);
  });
}

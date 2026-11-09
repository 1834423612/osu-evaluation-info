import { Pool, type PoolClient } from "pg";
import {
  acquireProvider,
  expireProviderLeases,
  finishProvider,
  releaseProvider,
  resetProvider,
  type HealthPhase,
  type HealthReason,
  type ProviderAttempt,
  type ProviderHealth,
  type ProviderPolicy,
  type ProviderRecord,
} from "./health.ts";
import type {
  ProviderRegistration,
  TranslationStateStore,
} from "./state-store.ts";

type Row = Record<string, unknown>;
const date = (value: unknown) =>
  value == null
    ? null
    : value instanceof Date
      ? value.getTime()
      : new Date(String(value)).getTime();
const instant = (value: number | null) =>
  value === null ? null : new Date(value);
/** Decode database timestamps and counters into the shared state machine representation. */
function health(row: Row): ProviderHealth {
  return {
    phase: String(row.phase) as HealthPhase,
    reason: String(row.reason) as HealthReason,
    generation: Number(row.generation),
    revision: Number(row.revision),
    consecutiveFailures: Number(row.consecutive_failures),
    nextRetryAt: date(row.next_retry_at),
    probeId: row.probe_id ? String(row.probe_id) : null,
    lastAttemptAt: date(row.last_attempt_at),
    lastSuccessAt: date(row.last_success_at),
    lastFailureAt: date(row.last_failure_at),
    lastFailureKind: row.last_failure_kind
      ? (String(row.last_failure_kind) as HealthReason)
      : null,
    lastHttpStatus:
      row.last_http_status == null ? null : Number(row.last_http_status),
    updatedAt: date(row.updated_at)!,
  };
}
/** Decode both current and draining leases without dropping previous generations. */
function attempt(row: Row): ProviderAttempt {
  return {
    id: String(row.id),
    generation: Number(row.generation),
    startedAt: date(row.started_at)!,
    expiresAt: date(row.lease_expires_at)!,
    releasedAt: date(row.lease_released_at),
    isProbe: Boolean(row.is_probe),
    status: String(row.status) as ProviderAttempt["status"],
    finishedAt: date(row.finished_at),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    reason: row.reason ? (String(row.reason) as HealthReason) : null,
    httpStatus: row.http_status == null ? null : Number(row.http_status),
    target: String(row.target) as ProviderAttempt["target"],
    characters: Number(row.input_characters),
  };
}

/** Short row-locked transactions; no lock/connection is held during model inference. */
export function createPostgresTranslationState(
  pool: Pool,
  schema = "osu_translation",
) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema))
    throw Error("Invalid translation schema.");
  const table = (name: string) => `${schema}.${name}`;
  async function transaction<T>(
    id: string,
    operation: (
      record: ProviderRecord,
      row: Row,
      client: PoolClient,
      now: number,
    ) => Promise<T>,
    attemptId?: string,
    source = "request",
  ) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<Row>(
        `SELECT p.*,s.* FROM ${table("provider_nodes")} p JOIN ${table("provider_state")} s ON s.provider_id=p.id WHERE p.id=$1 FOR UPDATE OF p,s`,
        [id],
      );
      const row = selected.rows[0];
      if (!row)
        throw Error(
          "Unknown server translation provider. Run pnpm db:translation:init.",
        );
      const now = (
        await client.query<{ now: Date }>("SELECT clock_timestamp() AS now")
      ).rows[0].now.getTime();
      const leases = await client.query<Row>(
        `SELECT * FROM ${table("provider_attempts")} WHERE provider_id=$1 AND (lease_released_at IS NULL OR id=$2::uuid)`,
        [id, attemptId ?? null],
      );
      const record: ProviderRecord = {
        id,
        enabled: Boolean(row.enabled),
        configured: Boolean(row.configured),
        policy: {
          timeoutMs: Number(row.timeout_ms),
          slowMs: Number(row.slow_ms),
          cooldownMs: Number(row.cooldown_ms),
          concurrency: Number(row.max_concurrency),
        },
        health: health(row),
        attempts: leases.rows.map(attempt),
        transitions: [],
      };
      const originalHealth = JSON.stringify(record.health);
      const originalAttempts = new Map(
        record.attempts.map((entry) => [entry.id, JSON.stringify(entry)]),
      );
      const result = await operation(record, row, client, now);
      for (const entry of record.attempts) {
        if (originalAttempts.get(entry.id) === JSON.stringify(entry)) continue;
        await client.query(
          `INSERT INTO ${table("provider_attempts")}
          (id,provider_id,generation,is_probe,target,input_characters,status,reason,http_status,duration_ms,started_at,finished_at,lease_expires_at,lease_released_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,http_status=EXCLUDED.http_status,
            duration_ms=EXCLUDED.duration_ms,finished_at=EXCLUDED.finished_at,lease_released_at=EXCLUDED.lease_released_at`,
          [
            entry.id,
            id,
            entry.generation,
            entry.isProbe,
            entry.target,
            entry.characters,
            entry.status,
            entry.reason,
            entry.httpStatus,
            entry.durationMs,
            instant(entry.startedAt),
            instant(entry.finishedAt),
            instant(entry.expiresAt),
            instant(entry.releasedAt),
          ],
        );
      }
      const h = record.health;
      if (originalHealth !== JSON.stringify(h))
        await client.query(
          `UPDATE ${table("provider_state")} SET
        phase=$2,reason=$3,generation=$4,revision=$5,consecutive_failures=$6,next_retry_at=$7,probe_id=$8,
        last_attempt_at=$9,last_success_at=$10,last_failure_at=$11,last_failure_kind=$12,last_http_status=$13,updated_at=$14 WHERE provider_id=$1`,
          [
            id,
            h.phase,
            h.reason,
            h.generation,
            h.revision,
            h.consecutiveFailures,
            instant(h.nextRetryAt),
            h.probeId,
            instant(h.lastAttemptAt),
            instant(h.lastSuccessAt),
            instant(h.lastFailureAt),
            h.lastFailureKind,
            h.lastHttpStatus,
            instant(h.updatedAt),
          ],
        );
      for (const event of record.transitions)
        await client.query(
          `INSERT INTO ${table("provider_transitions")}
        (provider_id,from_phase,to_phase,reason,generation,attempt_id,source,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            id,
            event.from,
            event.to,
            event.reason,
            event.generation,
            event.attemptId,
            event.reason === "lease_expired" ? "expiry" : source,
            instant(event.at),
          ],
        );
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  const store: TranslationStateStore = {
    register: (registration: ProviderRegistration) =>
      transaction(
        registration.id,
        async (record, row, client, now) => {
          const changed =
            row.config_hash !== registration.configHash ||
            record.configured !== registration.configured;
          const policy =
            row.config_hash === null ? registration.policy : record.policy;
          await client.query(
            `UPDATE ${table("provider_nodes")} SET configured=$2,config_hash=$3,timeout_ms=$4,slow_ms=$5,cooldown_ms=$6,max_concurrency=$7,updated_at=CASE WHEN configured IS DISTINCT FROM $2 OR config_hash IS DISTINCT FROM $3 THEN clock_timestamp() ELSE updated_at END WHERE id=$1`,
            [
              registration.id,
              registration.configured,
              registration.configHash,
              policy.timeoutMs,
              policy.slowMs,
              policy.cooldownMs,
              policy.concurrency,
            ],
          );
          record.configured = registration.configured;
          record.policy = policy;
          if (changed) resetProvider(record, "config_changed", now);
        },
        undefined,
        "configuration",
      ),
    claim: (id, attemptId, target, characters, configHash, allowSlow) =>
      transaction(id, async (record, row, _client, now) =>
        configHash !== undefined && row.config_hash !== configHash
          ? {
              allowed: false,
              availability: "unconfigured",
              retryAfterMs: 30000,
            }
          : acquireProvider(
              record,
              attemptId,
              target,
              characters,
              now,
              allowSlow,
            ),
      ),
    finish: (id, attemptId, outcome, settled) =>
      transaction(
        id,
        async (record, _row, _client, now) =>
          finishProvider(record, attemptId, outcome, settled, now),
        attemptId,
      ),
    release: (id, attemptId) =>
      transaction(
        id,
        async (record, _row, _client, now) =>
          releaseProvider(record, attemptId, now),
        attemptId,
      ),
  };
  return {
    ...store,
    refresh: (id: string) =>
      transaction(id, async (record, _row, _client, now) =>
        expireProviderLeases(record, now),
      ),
    async manage(
      id: string,
      command: "retry" | "enable" | "disable" | "configure",
      policy: Partial<ProviderPolicy> = {},
      expectedConfigHash?: string,
    ) {
      await transaction(
        id,
        async (record, row, client, now) => {
          if (
            expectedConfigHash !== undefined &&
            row.config_hash !== expectedConfigHash
          )
            throw Error(
              "Local provider configuration differs from the website. Use sync-config explicitly to replace it.",
            );
          if (command === "retry" && (!record.enabled || !record.configured))
            throw Error(
              "Enable and configure the provider before requesting a recovery probe.",
            );
          if (command === "enable") record.enabled = true;
          if (command === "disable") record.enabled = false;
          if (command === "configure") {
            const next = { ...record.policy, ...policy };
            if (
              !Number.isInteger(next.timeoutMs) ||
              next.timeoutMs < 500 ||
              next.timeoutMs > 8000 ||
              !Number.isInteger(next.slowMs) ||
              next.slowMs < 250 ||
              next.slowMs > 8000 ||
              !Number.isInteger(next.cooldownMs) ||
              next.cooldownMs < 1000 ||
              next.cooldownMs > 300000 ||
              !Number.isInteger(next.concurrency) ||
              next.concurrency < 1 ||
              next.concurrency > 8
            )
              throw Error("Invalid provider policy limits.");
            record.policy = next;
          }
          await client.query(
            `UPDATE ${table("provider_nodes")} SET enabled=$2,timeout_ms=$3,slow_ms=$4,cooldown_ms=$5,max_concurrency=$6,updated_at=clock_timestamp() WHERE id=$1`,
            [
              id,
              record.enabled,
              record.policy.timeoutMs,
              record.policy.slowMs,
              record.policy.cooldownMs,
              record.policy.concurrency,
            ],
          );
          resetProvider(
            record,
            command === "disable" ? "operator_disabled" : "operator_reset",
            now,
          );
        },
        undefined,
        "operator",
      );
    },
    async status() {
      return (
        await pool.query(
          `SELECT * FROM ${table("v_provider_status")} ORDER BY priority,provider`,
        )
      ).rows;
    },
    async prune() {
      await transaction("ollama", async (record, _row, _client, now) =>
        expireProviderLeases(record, now),
      );
      await pool.query(
        `DELETE FROM ${table("browser_provider_state")} WHERE observed_at < now()-interval '1 day'`,
      );
      await pool.query(
        `DELETE FROM ${table("provider_transitions")} WHERE occurred_at < now()-interval '90 days'`,
      );
      await pool.query(
        `DELETE FROM ${table("provider_attempts")} WHERE finished_at < now()-interval '30 days' AND lease_released_at IS NOT NULL`,
      );
    },
    async history(id: string) {
      return (
        await pool.query(
          `SELECT * FROM ${table("v_state_history")} WHERE provider=$1 ORDER BY occurred_at DESC LIMIT 30`,
          [id],
        )
      ).rows;
    },
    async attempts(id: string) {
      return (
        await pool.query(
          `SELECT * FROM ${table("v_recent_attempts")} WHERE provider=$1 ORDER BY started_at DESC LIMIT 30`,
          [id],
        )
      ).rows;
    },
  };
}

/** Limit database connections and lock waits independently from model inference. */
export function createTranslationStatePool(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const pool = new Pool({
    connectionString: environment.DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 1500,
    statement_timeout: 2000,
    lock_timeout: 1500,
    idleTimeoutMillis: 10000,
    application_name: "osu-translation-state",
    allowExitOnIdle: true,
  });
  pool.on("error", () => undefined);
  return pool;
}

/** Shared state machine; no network, database, or browser globals. */
export const HEALTH_PHASES = [
  "unconfigured",
  "disabled",
  "unknown",
  "healthy",
  "degraded",
  "cooldown",
  "recovering",
] as const;
export type HealthPhase = (typeof HEALTH_PHASES)[number];
export const HEALTH_REASONS = [
  "not_configured",
  "operator_disabled",
  "never_checked",
  "config_changed",
  "operator_reset",
  "probe",
  "success",
  "slow",
  "network",
  "timeout",
  "auth",
  "rate_limit",
  "http",
  "invalid_response",
  "lease_expired",
  "stale",
] as const;
export type HealthReason = (typeof HEALTH_REASONS)[number];
export type ProviderPolicy = {
  timeoutMs: number;
  slowMs: number;
  cooldownMs: number;
  concurrency: number;
};
export type ProviderHealth = {
  phase: HealthPhase;
  reason: HealthReason;
  generation: number;
  revision: number;
  consecutiveFailures: number;
  nextRetryAt: number | null;
  probeId: string | null;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
  lastFailureKind: HealthReason | null;
  lastHttpStatus: number | null;
  updatedAt: number;
};
export type ProviderAttempt = {
  id: string;
  generation: number;
  startedAt: number;
  expiresAt: number;
  releasedAt: number | null;
  isProbe: boolean;
  status:
    "running" | "succeeded" | "failed" | "timed_out" | "expired" | "cancelled";
  finishedAt: number | null;
  durationMs: number | null;
  reason: HealthReason | null;
  httpStatus: number | null;
  target: "en" | "zh-CN";
  characters: number;
};
export type HealthTransition = {
  from: HealthPhase;
  to: HealthPhase;
  reason: HealthReason;
  at: number;
  attemptId: string | null;
  generation: number;
};
export type ProviderRecord = {
  id: string;
  enabled: boolean;
  configured: boolean;
  policy: ProviderPolicy;
  health: ProviderHealth;
  attempts: ProviderAttempt[];
  transitions: HealthTransition[];
};
export type ProviderDecision =
  | { allowed: true; attempt: ProviderAttempt; policy: ProviderPolicy }
  | {
      allowed: false;
      availability: "disabled" | "unconfigured" | "busy" | "waiting_retry";
      retryAfterMs: number;
    };
export type AttemptOutcome = {
  success: boolean;
  durationMs: number;
  reason: HealthReason;
  httpStatus?: number;
  retryAfterMs?: number;
};

export function initialHealth(now: number): ProviderHealth {
  return {
    phase: "unknown",
    reason: "never_checked",
    generation: 0,
    revision: 0,
    consecutiveFailures: 0,
    nextRetryAt: null,
    probeId: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureKind: null,
    lastHttpStatus: null,
    updatedAt: now,
  };
}

function transition(
  record: ProviderRecord,
  phase: HealthPhase,
  reason: HealthReason,
  now: number,
  attemptId: string | null = null,
) {
  const previous = record.health;
  if (previous.phase !== phase || previous.reason !== reason)
    record.transitions.push({
      from: previous.phase,
      to: phase,
      reason,
      at: now,
      attemptId,
      generation: previous.generation,
    });
  previous.phase = phase;
  previous.reason = reason;
  previous.updatedAt = now;
  previous.revision++;
}

/** Configuration/operator changes fence off all old work; historical failures stay historical. */
export function resetProvider(
  record: ProviderRecord,
  reason: "config_changed" | "operator_reset" | "operator_disabled",
  now: number,
) {
  record.health.generation++;
  for (const attempt of record.attempts)
    if (attempt.releasedAt === null) {
      attempt.releasedAt = now;
      if (attempt.status === "running") {
        attempt.status = "cancelled";
        attempt.finishedAt = now;
        attempt.reason = reason;
      }
    }
  record.health.consecutiveFailures = 0;
  record.health.nextRetryAt = null;
  record.health.probeId = null;
  transition(
    record,
    !record.enabled
      ? "disabled"
      : !record.configured
        ? "unconfigured"
        : "unknown",
    !record.enabled
      ? "operator_disabled"
      : !record.configured
        ? "not_configured"
        : reason,
    now,
  );
}

/** Expiry is checked on demand, so a crashed worker cannot leave a permanent recovering state. */
export function expireProviderLeases(record: ProviderRecord, now: number) {
  for (const attempt of record.attempts) {
    if (attempt.releasedAt !== null || attempt.expiresAt > now) continue;
    attempt.releasedAt = now;
    if (attempt.status !== "running") continue;
    attempt.status = "expired";
    attempt.finishedAt = now;
    attempt.reason = "lease_expired";
    attempt.durationMs = Math.max(
      0,
      Math.min(
        now - attempt.startedAt,
        record.policy.timeoutMs + record.policy.cooldownMs,
      ),
    );
    if (attempt.generation !== record.health.generation) continue;
    record.health.consecutiveFailures = Math.min(
      100000,
      record.health.consecutiveFailures + 1,
    );
    record.health.lastFailureAt = now;
    record.health.lastFailureKind = "lease_expired";
    record.health.nextRetryAt = now;
    record.health.probeId = null;
    transition(record, "cooldown", "lease_expired", now, attempt.id);
  }
  if (
    record.health.phase === "healthy" &&
    record.health.lastSuccessAt !== null &&
    now - record.health.lastSuccessAt >= 300000 &&
    !record.attempts.some(
      (attempt) => attempt.releasedAt === null && attempt.expiresAt > now,
    )
  ) {
    record.health.nextRetryAt = null;
    transition(record, "unknown", "stale", now);
  }
}

export function acquireProvider(
  record: ProviderRecord,
  id: string,
  target: ProviderAttempt["target"],
  characters: number,
  now: number,
  allowSlow = false,
): ProviderDecision {
  expireProviderLeases(record, now);
  if (!record.enabled)
    return { allowed: false, availability: "disabled", retryAfterMs: 60_000 };
  if (!record.configured)
    return {
      allowed: false,
      availability: "unconfigured",
      retryAfterMs: 30_000,
    };
  const health = record.health;
  // Manual selection may wait for a slow but successful node. Actual failures keep their cooldown.
  const slowOnly =
    allowSlow &&
    health.phase === "degraded" &&
    health.reason === "slow" &&
    health.consecutiveFailures === 0;
  if (health.nextRetryAt !== null && health.nextRetryAt > now && !slowOnly)
    return {
      allowed: false,
      availability: "waiting_retry",
      retryAfterMs: health.nextRetryAt - now,
    };
  const active = record.attempts.filter(
    (attempt) =>
      attempt.generation === health.generation &&
      attempt.releasedAt === null &&
      attempt.expiresAt > now,
  );
  const probe = health.phase !== "healthy";
  if (
    active.length >= record.policy.concurrency ||
    (probe && active.length > 0) ||
    active.some((attempt) => now - attempt.startedAt >= record.policy.slowMs)
  )
    return {
      allowed: false,
      availability: "busy",
      retryAfterMs: Math.max(
        1000,
        Math.min(...active.map((attempt) => attempt.expiresAt - now)),
      ),
    };
  const attempt: ProviderAttempt = {
    id,
    generation: health.generation,
    startedAt: now,
    expiresAt: now + record.policy.timeoutMs + record.policy.cooldownMs,
    releasedAt: null,
    isProbe: probe,
    status: "running",
    finishedAt: null,
    durationMs: null,
    reason: null,
    httpStatus: null,
    target,
    characters,
  };
  record.attempts.push(attempt);
  health.lastAttemptAt = now;
  if (probe) {
    health.probeId = id;
    health.nextRetryAt = null;
    transition(record, "recovering", "probe", now, id);
  }
  return { allowed: true, attempt, policy: { ...record.policy } };
}

export function finishProvider(
  record: ProviderRecord,
  id: string,
  outcome: AttemptOutcome,
  settled: boolean,
  now: number,
): boolean {
  expireProviderLeases(record, now);
  const attempt = record.attempts.find((entry) => entry.id === id);
  if (
    !attempt ||
    attempt.status !== "running" ||
    attempt.generation !== record.health.generation ||
    (attempt.isProbe && record.health.probeId !== id)
  )
    return false;
  attempt.status = outcome.success
    ? "succeeded"
    : outcome.reason === "timeout"
      ? "timed_out"
      : "failed";
  attempt.finishedAt = now;
  attempt.durationMs = Math.max(0, Math.round(outcome.durationMs));
  attempt.reason = outcome.reason;
  attempt.httpStatus = outcome.httpStatus ?? null;
  if (settled || outcome.success) attempt.releasedAt = now;
  const health = record.health;
  health.probeId = null;
  health.lastHttpStatus = outcome.httpStatus ?? null;
  if (outcome.success) {
    health.consecutiveFailures = 0;
    health.lastSuccessAt = now;
    const slow = outcome.durationMs >= record.policy.slowMs;
    health.nextRetryAt = slow ? now + record.policy.cooldownMs : null;
    transition(
      record,
      slow ? "degraded" : "healthy",
      slow ? "slow" : "success",
      now,
      id,
    );
  } else {
    health.consecutiveFailures = Math.min(
      100000,
      health.consecutiveFailures + 1,
    );
    health.lastFailureAt = now;
    health.lastFailureKind = outcome.reason;
    const cooldown =
      attempt.isProbe ||
      health.consecutiveFailures >= 2 ||
      ["timeout", "auth", "rate_limit"].includes(outcome.reason);
    const duration = cooldown
      ? Math.min(
          300_000,
          record.policy.cooldownMs *
            2 ** Math.min(health.consecutiveFailures - 1, 3),
        )
      : Math.min(5000, record.policy.cooldownMs);
    health.nextRetryAt =
      now + Math.min(300_000, Math.max(duration, outcome.retryAfterMs ?? 0));
    transition(
      record,
      cooldown ? "cooldown" : "degraded",
      outcome.reason,
      now,
      id,
    );
  }
  return true;
}

export function releaseProvider(
  record: ProviderRecord,
  id: string,
  now: number,
) {
  const attempt = record.attempts.find((entry) => entry.id === id);
  if (attempt && attempt.status !== "running" && attempt.releasedAt === null)
    attempt.releasedAt = now;
}

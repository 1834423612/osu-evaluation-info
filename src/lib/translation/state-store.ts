import {
  acquireProvider,
  finishProvider,
  initialHealth,
  releaseProvider,
  resetProvider,
  type AttemptOutcome,
  type ProviderDecision,
  type ProviderRecord,
  type ProviderPolicy,
} from "./health.ts";

export type ProviderRegistration = {
  id: string;
  configured: boolean;
  configHash: string;
  policy: ProviderPolicy;
};
export interface TranslationStateStore {
  register(registration: ProviderRegistration): Promise<void>;
  claim(
    id: string,
    attemptId: string,
    target: "en" | "zh-CN",
    characters: number,
    configHash?: string,
  ): Promise<ProviderDecision>;
  finish(
    id: string,
    attemptId: string,
    outcome: AttemptOutcome,
    settled: boolean,
  ): Promise<boolean>;
  release(id: string, attemptId: string): Promise<void>;
}

/** Same transition rules as PostgreSQL, for browsers, tests and DB-less installations. */
export function createMemoryTranslationState(now = Date.now) {
  const records = new Map<string, ProviderRecord & { configHash: string }>();
  const get = (id: string) => {
    const record = records.get(id);
    if (!record) throw Error("Unknown translation provider.");
    return record;
  };
  function trim(record: ProviderRecord) {
    const finished = record.attempts
      .filter((attempt) => attempt.releasedAt !== null)
      .slice(-64);
    record.attempts = [
      ...finished,
      ...record.attempts.filter((attempt) => attempt.releasedAt === null),
    ];
    record.transitions = record.transitions.slice(-64);
  }
  const store: TranslationStateStore = {
    async register(registration) {
      let record = records.get(registration.id);
      if (!record) {
        record = {
          ...registration,
          enabled: true,
          health: initialHealth(now()),
          attempts: [],
          transitions: [],
        };
        records.set(registration.id, record);
        if (!record.configured) resetProvider(record, "config_changed", now());
      } else if (
        record.configHash !== registration.configHash ||
        record.configured !== registration.configured
      ) {
        record.configHash = registration.configHash;
        record.configured = registration.configured;
        resetProvider(record, "config_changed", now());
      }
    },
    async claim(id, attemptId, target, characters, configHash) {
      const record = get(id);
      if (configHash !== undefined && record.configHash !== configHash)
        return {
          allowed: false,
          availability: "unconfigured",
          retryAfterMs: 30000,
        };
      const result = acquireProvider(
        record,
        attemptId,
        target,
        characters,
        now(),
      );
      trim(record);
      return result;
    },
    async finish(id, attemptId, outcome, settled) {
      const record = get(id);
      const accepted = finishProvider(
        record,
        attemptId,
        outcome,
        settled,
        now(),
      );
      trim(record);
      return accepted;
    },
    async release(id, attemptId) {
      releaseProvider(get(id), attemptId, now());
    },
  };
  return {
    ...store,
    snapshot: (id: string) => structuredClone(get(id)),
    reset(id: string, enabled = true) {
      const record = get(id);
      record.enabled = enabled;
      resetProvider(
        record,
        enabled ? "operator_reset" : "operator_disabled",
        now(),
      );
    },
  };
}

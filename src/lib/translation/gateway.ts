import { createHash, randomUUID } from "node:crypto";
import { withDeadline } from "./http.ts";
import {
  TRANSLATION_DEADLINE_MS,
  TRANSLATION_QUEUE_WAIT_MS,
  parseTranslationBatch,
  TranslationUnavailableError,
  type TranslationItem,
  type TranslationResult,
  type TranslationTarget,
  type TranslationProvider,
  type TranslationRequestOptions,
} from "./service.ts";
import type { TranslationNode } from "./providers.ts";
import {
  createMemoryTranslationState,
  type TranslationStateStore,
  type ProviderRegistration,
} from "./state-store.ts";
import { TranslationProviderError } from "./provider-error.ts";
import type { HealthPhase, HealthReason } from "./health.ts";
import { createTranslationQueue } from "./queue.ts";

export type TranslationObservation = {
  provider: Exclude<TranslationProvider, "chrome"> | "gateway";
  target: TranslationTarget;
  outcome:
    | "success"
    | "failure"
    | "timeout"
    | "busy"
    | "circuit"
    | "cache"
    | "shared"
    | "unavailable";
  characters: number;
  durationMs: number;
  browser?: {
    sessionId: string;
    sequence: number;
    phase: HealthPhase;
    reason: HealthReason;
    consecutiveFailures: number;
    retryAfterMs: number;
  };
};

type Translated = Pick<
  Extract<TranslationResult, { status: "translated" }>,
  "translation" | "provider"
>;

/** Route validated server work through shared leases, bounded queues and a result cache. */
export function createTranslationGateway(
  nodes: TranslationNode[],
  observe: (event: TranslationObservation) => void = () => undefined,
  now = Date.now,
  stateStore: TranslationStateStore = createMemoryTranslationState(now),
  registrations: ProviderRegistration[] = nodes.map((node) => ({
    id: node.id,
    configured: true,
    configHash: node.id,
    policy: {
      timeoutMs: node.timeoutMs,
      slowMs: node.slowMs,
      cooldownMs: node.cooldownMs,
      concurrency: node.concurrency,
    },
  })),
  queueOptions: {
    waitMs?: number;
    limit?: number;
    pollMs?: number;
    registerProviders?: boolean;
  } = {},
) {
  const queueWaitMs = queueOptions.waitMs ?? TRANSLATION_QUEUE_WAIT_MS;
  const manualQueue = createTranslationQueue(
    1,
    queueOptions.limit ?? 32,
    queueWaitMs,
  );
  const cache = new Map<string, { result: Translated; expires: number }>();
  const pending = new Map<string, Promise<Translated>>();
  let registered: Promise<void> | undefined;
  /** Register once per runtime; operator probes verify existing configuration instead. */
  function initialize() {
    registered ??= Promise.all(
      queueOptions.registerProviders === false
        ? []
        : registrations.map((registration) =>
            stateStore.register(registration),
          ),
    )
      .then(() => undefined)
      .catch((error) => {
        registered = undefined;
        throw error;
      });
    return registered;
  }

  /** Claim capacity before inference and retain unsettled permits after a timeout. */
  async function route(
    item: TranslationItem,
    manual = false,
    deadline = 0,
  ): Promise<Translated> {
    await initialize();
    let retryAfterMs = Infinity;
    for (const node of nodes) {
      const attemptId = randomUUID();
      const claim = () =>
        stateStore.claim(
          node.id,
          attemptId,
          item.target,
          item.text.length,
          registrations.find((entry) => entry.id === node.id)?.configHash,
          manual,
        );
      let decision = await claim();
      // Only the head of the manual FIFO polls for a cross-worker permit.
      while (
        manual &&
        !decision.allowed &&
        decision.availability === "busy" &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(
              queueOptions.pollMs ?? 250,
              Math.max(1, deadline - Date.now()),
            ),
          ),
        );
        decision = await claim();
      }
      if (!decision.allowed) {
        retryAfterMs = Math.min(retryAfterMs, decision.retryAfterMs);
        observe({
          provider: node.id,
          target: item.target,
          outcome: decision.availability === "busy" ? "busy" : "circuit",
          characters: item.text.length,
          durationMs: 0,
        });
        continue;
      }
      const started = now();
      let settled = false;
      let finalized = false;
      const report = (outcome: TranslationObservation["outcome"]) =>
        observe({
          provider: node.id,
          target: item.target,
          outcome,
          characters: item.text.length,
          durationMs: Math.max(0, now() - started),
        });
      const onSettled = () => {
        settled = true;
        if (finalized)
          void stateStore.release(node.id, attemptId).catch(() => undefined);
      };
      try {
        const translation = await withDeadline(
          (signal) => {
            const operation = Promise.resolve().then(() =>
              node.translate(item, signal),
            );
            void operation.then(onSettled, onSettled);
            return operation;
          },
          Math.min(decision.policy.timeoutMs, TRANSLATION_DEADLINE_MS),
        );
        const accepted = await stateStore.finish(
          node.id,
          attemptId,
          {
            success: true,
            reason: "success",
            durationMs: Math.max(0, now() - started),
            httpStatus: 200,
          },
          true,
        );
        if (!accepted) {
          retryAfterMs = 1000;
          continue;
        }
        report("success");
        return { translation, provider: node.id };
      } catch (error) {
        const timeout = error instanceof Error && error.name === "TimeoutError";
        const reason = timeout
          ? "timeout"
          : error instanceof TranslationProviderError
            ? error.kind
            : "network";
        const delay =
          error instanceof TranslationProviderError
            ? error.retryAfterMs
            : undefined;
        await stateStore.finish(
          node.id,
          attemptId,
          {
            success: false,
            reason,
            durationMs: Math.max(0, now() - started),
            httpStatus:
              error instanceof TranslationProviderError
                ? error.httpStatus
                : undefined,
            retryAfterMs: delay,
          },
          settled,
        );
        retryAfterMs = Math.min(
          retryAfterMs,
          Math.max(decision.policy.cooldownMs, delay ?? 0),
        );
        report(timeout ? "timeout" : "failure");
      } finally {
        finalized = true;
        if (settled)
          await stateStore.release(node.id, attemptId).catch(() => undefined);
      }
    }
    throw new TranslationUnavailableError(
      Number.isFinite(retryAfterMs) ? retryAfterMs : 30_000,
    );
  }

  /** Return an independent result per item, reusing successful or pending work. */
  async function translate(
    item: TranslationItem,
    options: TranslationRequestOptions = {},
  ): Promise<TranslationResult> {
    const started = now();
    const metadata = { id: item.id, target: item.target };
    if (!parseTranslationBatch({ items: [item] }))
      return { ...metadata, status: "unavailable", durationMs: 0 };
    const key = createHash("sha256")
      .update(item.target)
      .update("\0")
      .update(item.text)
      .digest("hex");
    const report = (outcome: TranslationObservation["outcome"]) =>
      observe({
        provider: "gateway",
        target: item.target,
        outcome,
        characters: item.text.length,
        durationMs: Math.max(0, now() - started),
      });
    let saved = cache.get(key);
    if (saved && saved.expires <= now()) {
      cache.delete(key);
      saved = undefined;
    }
    if (saved && !options.bypassCache) {
      report("cache");
      return {
        ...metadata,
        ...saved.result,
        status: "translated",
        cache: "hit",
        durationMs: 0,
      };
    }
    const pendingKey = `${options.mode ?? "auto"}\0${options.bypassCache ? "fresh" : "cached"}\0${key}`;
    let operation = pending.get(pendingKey);
    const shared = Boolean(operation);
    let queuedCacheHit = false;
    if (!operation && pending.size < 32) {
      const deadline = Date.now() + queueWaitMs;
      const work = () => {
        const current = cache.get(key);
        if (!options.bypassCache && current && current.expires > now()) {
          queuedCacheHit = true;
          return Promise.resolve(current.result);
        }
        if (options.mode === "ollama" && Date.now() >= deadline)
          throw new TranslationUnavailableError(1000);
        return route(item, options.mode === "ollama", deadline);
      };
      operation = (options.mode === "ollama" ? manualQueue.run(work) : work())
        .then((result) => {
          if (!queuedCacheHit && !options.bypassCache) {
            cache.set(key, {
              result,
              expires: now() + 7 * 24 * 60 * 60 * 1000,
            });
            while (cache.size > 512) cache.delete(cache.keys().next().value!);
          }
          return result;
        })
        .finally(() => pending.delete(pendingKey));
      pending.set(pendingKey, operation);
    }
    try {
      if (!operation) throw new TranslationUnavailableError();
      const result = await operation;
      if (queuedCacheHit) report("cache");
      else if (shared) report("shared");
      return {
        ...metadata,
        ...result,
        status: "translated",
        cache: queuedCacheHit ? "hit" : shared ? "shared" : "miss",
        durationMs: Math.max(0, now() - started),
      };
    } catch (error) {
      report("unavailable");
      return {
        ...metadata,
        status: "unavailable",
        retryAfterMs:
          error instanceof TranslationUnavailableError
            ? error.retryAfterMs
            : 5000,
        durationMs: Math.max(0, now() - started),
      };
    }
  }

  return {
    translate,
    translateBatch: (
      items: TranslationItem[],
      options: TranslationRequestOptions = {},
    ) => Promise.all(items.map((item) => translate(item, options))),
  };
}

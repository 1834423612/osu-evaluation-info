import { createHash } from "node:crypto";
import { withDeadline } from "./http.ts";
import {
  TRANSLATION_DEADLINE_MS,
  parseTranslationBatch,
  TranslationUnavailableError,
  type TranslationItem,
  type TranslationResult,
  type TranslationTarget,
} from "./service.ts";
import type {
  TranslationNode,
  ServerTranslationProvider,
} from "./providers.ts";

export type TranslationObservation = {
  provider: ServerTranslationProvider | "gateway";
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
};

type Translated = Pick<
  Extract<TranslationResult, { status: "translated" }>,
  "translation" | "provider"
>;

export function createTranslationGateway(
  nodes: TranslationNode[],
  observe: (event: TranslationObservation) => void = () => undefined,
  now = Date.now,
) {
  const cache = new Map<string, { result: Translated; expires: number }>();
  const pending = new Map<string, Promise<Translated>>();
  const states = nodes.map((node) => ({
    node,
    active: new Map<symbol, number>(),
    failures: 0,
    blockedUntil: 0,
  }));

  async function route(item: TranslationItem): Promise<Translated> {
    const deadline = now() + TRANSLATION_DEADLINE_MS;
    for (const state of states) {
      const { node } = state;
      const started = now();
      const report = (outcome: TranslationObservation["outcome"]) =>
        observe({
          provider: node.id,
          target: item.target,
          outcome,
          characters: item.text.length,
          durationMs: Math.max(0, now() - started),
        });
      if (started >= deadline) break;
      if (state.blockedUntil > started) {
        report("circuit");
        continue;
      }
      // Reserve synchronously: concurrent requests must not queue up on the NAS.
      if (
        state.active.size >= node.concurrency ||
        (state.blockedUntil > 0 && state.active.size > 0) ||
        [...state.active.values()].some((time) => started - time >= node.slowMs)
      ) {
        report("busy");
        continue;
      }
      const ticket = Symbol();
      state.active.set(ticket, started);
      try {
        const translation = await withDeadline(
          (signal) => {
            const operation = Promise.resolve().then(() =>
              node.translate(item, signal),
            );
            // Keep the permit until the actual upstream work settles, even if it ignores abort.
            void operation.then(
              () => state.active.delete(ticket),
              () => state.active.delete(ticket),
            );
            return operation;
          },
          Math.min(node.timeoutMs, deadline - started),
        );
        state.failures = 0;
        state.blockedUntil =
          now() - started >= node.slowMs ? now() + node.cooldownMs : 0;
        report("success");
        return { translation, provider: node.id };
      } catch (error) {
        const timeout = error instanceof Error && error.name === "TimeoutError";
        state.failures++;
        if (timeout || state.failures >= 2 || state.blockedUntil > 0)
          state.blockedUntil = now() + node.cooldownMs;
        report(timeout ? "timeout" : "failure");
      }
    }
    throw new TranslationUnavailableError();
  }

  async function translate(item: TranslationItem): Promise<TranslationResult> {
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
    if (saved) {
      report("cache");
      return {
        ...metadata,
        ...saved.result,
        status: "translated",
        cache: "hit",
        durationMs: 0,
      };
    }
    let operation = pending.get(key);
    const shared = Boolean(operation);
    if (!operation && pending.size < 32) {
      operation = route(item)
        .then((result) => {
          cache.set(key, { result, expires: now() + 7 * 24 * 60 * 60 * 1000 });
          while (cache.size > 512) cache.delete(cache.keys().next().value!);
          return result;
        })
        .finally(() => pending.delete(key));
      pending.set(key, operation);
    }
    try {
      if (!operation) throw new TranslationUnavailableError();
      const result = await operation;
      if (shared) report("shared");
      return {
        ...metadata,
        ...result,
        status: "translated",
        cache: shared ? "shared" : "miss",
        durationMs: Math.max(0, now() - started),
      };
    } catch {
      report("unavailable");
      return {
        ...metadata,
        status: "unavailable",
        durationMs: Math.max(0, now() - started),
      };
    }
  }

  return {
    translate,
    translateBatch: (items: TranslationItem[]) =>
      Promise.all(items.map(translate)),
  };
}

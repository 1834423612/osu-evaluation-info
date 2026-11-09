import { readJsonLimited, withDeadline } from "./http.ts";
import { createBrowserGoogleFallback } from "./google.ts";
import { createTranslationQueue } from "./queue.ts";
import {
  createTranslationConsumers,
  type TranslationCallbacks as RequestCallbacks,
} from "./consumers.ts";
import type { TranslationObservation } from "./gateway.ts";
import {
  TRANSLATION_QUEUE_WAIT_MS,
  TRANSLATION_DEADLINE_MS,
  parseTranslationBatch,
  TranslationUnavailableError,
  validTranslationResult,
  type TranslationItem,
  type TranslationModel,
  type TranslationResult,
  type TranslationTarget,
} from "./service.ts";

type Success = Extract<TranslationResult, { status: "translated" }>;

/** One NAS lane per device; Google work never waits behind its HTTP response. */
export function createRemoteTranslationClient(
  fetcher: typeof fetch = fetch,
  delayMs = 25,
  onGoogleAttempt?: (event: TranslationObservation) => void,
) {
  const googleFallback = createBrowserGoogleFallback(
    fetcher,
    Date.now,
    onGoogleAttempt,
  );
  const nasQueue = createTranslationQueue(1, 200, TRANSLATION_QUEUE_WAIT_MS);
  const googleQueue = createTranslationQueue(3, 200, 15_000);
  const pending = new Map<
    string,
    {
      promise: Promise<Success>;
      consumers: ReturnType<typeof createTranslationConsumers>;
    }
  >();
  let nextId = 0;
  let nasRunning = 0;
  let manualPending = 0;

  /** Discard queued work only after all of its consumers become irrelevant. */
  function checkCurrent(callbacks: RequestCallbacks) {
    if (callbacks.canStart && !callbacks.canStart())
      throw new DOMException("Translation is no longer needed.", "AbortError");
  }

  /** Keep browser-direct calls in their own bounded lane. */
  function google(
    item: TranslationItem,
    callbacks: RequestCallbacks,
    plan?: unknown,
  ) {
    return googleQueue.run(() => {
      checkCurrent(callbacks);
      callbacks.onStarted?.();
      return googleFallback(item, plan);
    }, callbacks.onQueued);
  }

  /** Reserve the device NAS lane and validate the complete server response. */
  async function nas(
    item: TranslationItem,
    manual: boolean,
    callbacks: RequestCallbacks,
  ) {
    checkCurrent(callbacks);
    callbacks.onStarted?.();
    // Reserve before yielding so a burst immediately uses the other lanes.
    nasRunning++;
    try {
      if (delayMs > 0)
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      checkCurrent(callbacks);
      const payload = await withDeadline(
        async (signal) => {
          const response = await fetcher("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({
              items: [item],
              mode: manual ? "ollama" : "auto",
            }),
            signal,
          });
          if (!response.ok) {
            void response.body?.cancel().catch(() => undefined);
            const header = response.headers.get("retry-after");
            const seconds = Number(header);
            const retryAfterMs = header?.trim()
              ? Number.isFinite(seconds)
                ? seconds * 1000
                : Date.parse(header) - Date.now()
              : 5000;
            throw new TranslationUnavailableError(retryAfterMs);
          }
          return readJsonLimited(response, 256 * 1024, signal);
        },
        manual
          ? TRANSLATION_QUEUE_WAIT_MS + TRANSLATION_DEADLINE_MS + 5000
          : 20_000,
      );
      const body =
        payload && typeof payload === "object"
          ? (payload as {
              version?: unknown;
              results?: unknown;
              browserFallback?: unknown;
            })
          : null;
      const results =
        body?.version === 1 && Array.isArray(body.results) ? body.results : [];
      const matches = results.filter(
        (result) =>
          result && typeof result === "object" && result.id === item.id,
      );
      const value = matches[0] as
        (Partial<Success> & { retryAfterMs?: number }) | undefined;
      if (
        matches.length === 1 &&
        value?.status === "translated" &&
        value.target === item.target &&
        typeof value.translation === "string" &&
        value.provider === "ollama" &&
        ["miss", "hit", "shared"].includes(value.cache ?? "") &&
        typeof value.durationMs === "number" &&
        Number.isFinite(value.durationMs) &&
        value.durationMs >= 0 &&
        validTranslationResult(value.translation, item.text, item.target)
      )
        return value as Success;
      const retryAfterMs =
        typeof value?.retryAfterMs === "number" &&
        Number.isFinite(value.retryAfterMs)
          ? value.retryAfterMs
          : 5000;
      return { retryAfterMs, plan: body?.browserFallback };
    } finally {
      nasRunning--;
    }
  }

  /** Spill into browser providers while NAS is occupied, then wait for NAS if needed. */
  async function automatic(
    item: TranslationItem,
    callbacks: RequestCallbacks,
  ): Promise<Success> {
    if (nasRunning > 0 || manualPending > 0) {
      try {
        return await google(item, callbacks);
      } catch (error) {
        // If Google is unavailable, wait for NAS rather than fail purely due to load.
        if (error instanceof Error && error.name === "AbortError") throw error;
        return manualNas(item, callbacks);
      }
    }
    let retryAfterMs = 5000;
    let plan: unknown;
    try {
      const result = await nas(item, false, callbacks);
      if ("status" in result) return result;
      retryAfterMs = result.retryAfterMs;
      plan = result.plan;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      if (error instanceof TranslationUnavailableError)
        retryAfterMs = error.retryAfterMs;
    }
    try {
      return await google(item, callbacks, plan);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new TranslationUnavailableError(
        Math.min(
          retryAfterMs,
          error instanceof TranslationUnavailableError
            ? error.retryAfterMs
            : 5000,
        ),
      );
    }
  }

  /** Serialize explicit NAS work without treating queue pressure as provider failure. */
  function manualNas(item: TranslationItem, callbacks: RequestCallbacks) {
    manualPending++;
    return nasQueue
      .run(async () => {
        // An automatic NAS request may already own the device's lane.
        if (nasRunning > 0) callbacks.onQueued?.();
        while (nasRunning > 0) {
          checkCurrent(callbacks);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const result = await nas(item, true, callbacks);
        if ("status" in result) return result;
        throw new TranslationUnavailableError(result.retryAfterMs);
      }, callbacks.onQueued)
      .finally(() => {
        manualPending--;
      });
  }

  /** Deduplicate by model, language and source while retaining every consumer's relevance. */
  function request(
    text: string,
    target: TranslationTarget,
    model: Exclude<TranslationModel, "chrome"> = "auto",
    callbacks: RequestCallbacks = {},
  ): Promise<Success> {
    const key = `${model}\0${target}\0${text}`;
    const existing = pending.get(key);
    if (existing) {
      existing.consumers.add(callbacks);
      return existing.promise;
    }
    const item = { id: String(nextId++), text, target };
    if (
      !["auto", "ollama", "google"].includes(model) ||
      !parseTranslationBatch({ items: [item] }) ||
      pending.size >= 200
    )
      return Promise.reject(new TranslationUnavailableError());
    const consumers = createTranslationConsumers(callbacks);
    const operation = (
      model === "google"
        ? google(item, consumers)
        : model === "ollama"
          ? manualNas(item, consumers)
          : automatic(item, consumers)
    ).finally(() => pending.delete(key));
    pending.set(key, { promise: operation, consumers });
    return operation;
  }
  return { request };
}

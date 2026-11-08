import { readJsonLimited, withDeadline } from "./http.ts";
import { createBrowserGoogleFallback } from "./google.ts";
import type { TranslationObservation } from "./gateway.ts";
import {
  MAX_TRANSLATION_BATCH_LENGTH,
  MAX_TRANSLATION_BATCH_SIZE,
  parseTranslationBatch,
  TranslationUnavailableError,
  validTranslationResult,
  type TranslationItem,
  type TranslationModel,
  type TranslationResult,
  type TranslationTarget,
} from "./service.ts";

type Success = Extract<TranslationResult, { status: "translated" }>;
type Queued = {
  item: TranslationItem;
  model: "auto" | "ollama";
  resolve: (result: Success) => void;
  reject: (reason: unknown) => void;
};

/** Coalesce snippets only after Chrome has failed; correlate responses by ID, never array position. */
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
  const queue: Queued[] = [];
  const pending = new Map<string, Promise<Success>>();
  let nextId = 0;
  let running = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (timer || !queue.length || running >= 2) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, delayMs);
  }

  async function flush() {
    if (running >= 2 || !queue.length) return;
    const batch: Queued[] = [];
    let characters = 0;
    while (
      queue.length &&
      batch.length < MAX_TRANSLATION_BATCH_SIZE &&
      characters + queue[0].item.text.length <= MAX_TRANSLATION_BATCH_LENGTH
    ) {
      const queued = queue.shift()!;
      characters += queued.item.text.length;
      batch.push(queued);
    }
    running++;
    schedule();
    let payload: unknown = null;
    try {
      payload = await withDeadline(async (signal) => {
        const response = await fetcher("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ items: batch.map(({ item }) => item) }),
          signal,
        });
        if (!response.ok) {
          void response.body?.cancel().catch(() => undefined);
          throw new TranslationUnavailableError();
        }
        return readJsonLimited(response, 256 * 1024, signal);
      }, 20_000);
    } catch {
      // NAS/API failures cannot prevent this device from using Google directly.
    }
    try {
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
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(2, batch.length) }, async () => {
          while (cursor < batch.length) {
            const queued = batch[cursor++];
            const matches = results.filter(
              (result) =>
                result &&
                typeof result === "object" &&
                result.id === queued.item.id,
            );
            const value = matches[0] as
              (Partial<Success> & { retryAfterMs?: number }) | undefined;
            if (
              matches.length === 1 &&
              value?.status === "translated" &&
              value.target === queued.item.target &&
              typeof value.translation === "string" &&
              value.provider === "ollama" &&
              ["miss", "hit", "shared"].includes(value.cache ?? "") &&
              typeof value.durationMs === "number" &&
              Number.isFinite(value.durationMs) &&
              value.durationMs >= 0 &&
              validTranslationResult(
                value.translation,
                queued.item.text,
                queued.item.target,
              )
            ) {
              queued.resolve(value as Success);
              continue;
            }
            if (queued.model === "ollama") {
              queued.reject(
                new TranslationUnavailableError(
                  typeof value?.retryAfterMs === "number" &&
                    Number.isFinite(value.retryAfterMs)
                    ? value.retryAfterMs
                    : 5000,
                ),
              );
              continue;
            }
            try {
              queued.resolve(
                await googleFallback(queued.item, body?.browserFallback),
              );
            } catch (error) {
              const googleRetry =
                error instanceof TranslationUnavailableError
                  ? error.retryAfterMs
                  : 5000;
              // Reconsider either tier as soon as one may recover. Never negative-cache NAS globally.
              const nasRetry =
                typeof value?.retryAfterMs === "number" &&
                Number.isFinite(value.retryAfterMs)
                  ? value.retryAfterMs
                  : 5000;
              queued.reject(
                new TranslationUnavailableError(
                  Math.min(googleRetry, nasRetry),
                ),
              );
            }
          }
        }),
      );
    } catch (error) {
      for (const queued of batch) queued.reject(error);
    } finally {
      running--;
      schedule();
    }
  }

  function request(
    text: string,
    target: TranslationTarget,
    model: Exclude<TranslationModel, "chrome"> = "auto",
  ): Promise<Success> {
    const key = `${model}\0${target}\0${text}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const item = { id: String(nextId++), text, target };
    if (
      !["auto", "ollama", "google"].includes(model) ||
      !parseTranslationBatch({ items: [item] }) ||
      queue.length >= 200
    )
      return Promise.reject(new TranslationUnavailableError());
    const operation = (
      model === "google"
        ? googleFallback(item)
        : new Promise<Success>((resolve, reject) => {
            queue.push({ item, model, resolve, reject });
          })
    ).finally(() => pending.delete(key));
    pending.set(key, operation);
    schedule();
    return operation;
  }
  return { request };
}
